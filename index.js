const core = require('@actions/core');
const github = require('@actions/github');
const camundaSdk = require('@camunda8/sdk');

/*
const camundaClientId = core.getInput('camunda-client-id');
const camundaClientSecret = core.getInput('camunda-client-secret');
const zeebeAddress = core.getInput('camunda-zeebe-address');
*/

const camunda = new camundaSdk.Camunda8();
/*{
  Moved to environment variables because of https://github.com/camunda/camunda-8-js-sdk/issues/153
  config: {
    ZEEBE_ADDRESS: zeebeAddress,
    ZEEBE_CLIENT_ID: camundaClientId,
    ZEEBE_CLIENT_SECRET: camundaClientSecret,
//    ZEEBE_AUTHORIZATION_SERVER_URL: 'https://login.cloud.camunda.io/oauth/token',
    CAMUNDA_OAUTH_URL: 'https://login.cloud.camunda.io/oauth/token'
  }
});
*/
const zeebe = camunda.getZeebeGrpcApiClient();

run();

async function run() {

  //let topology = await zeebe.topology();
  //console.log(topology);

  try {
    const githubToken = core.getInput('github-token');
    const webmodelerClientId = core.getInput('webmodeler-client-id');
    const webmodelerClientSecret = core.getInput('webmodeler-client-secret');

    if (!github || !webmodelerClientId || !webmodelerClientSecret) {
      core.setFailed("You need to set GITHUB_TOKEN and WEB_MODELER CREDENTIALS");
    }

    // Get Web Modeler Milestones 
    let tokenResponse = await fetch("https://login.cloud.camunda.io/oauth/token", {
      method: "POST",
      headers: { "Content-type": "application/json" },
      body: JSON.stringify({
        "grant_type":"client_credentials",
        "audience":"api.cloud.camunda.io", 
        "client_id": webmodelerClientId, 
        "client_secret": webmodelerClientSecret
      })
    });

    const tokenResponseJson = await tokenResponse.json();
    const webModelerToken = tokenResponseJson.access_token;
    let milestoneResponse = await fetch("https://modeler.cloud.camunda.io/api/v1/milestones/search", {
      method: "POST",
      headers: { 
        "Content-type": "application/json",
        "Authorization": "Bearer " + webModelerToken
      },
      body: JSON.stringify({
        "sort": [
          {
            "field": "created",
            "direction": "DESC"
        }],
        size: 10
      })
    });
    let milestonesJson = await milestoneResponse.json();
    //console.log(milestonesJson);
    let milestones = milestonesJson.items;
    //console.log(milestones);


    // Get branches from GitHub
    const octokit = github.getOctokit(githubToken);
    const [ghOwner, ghRepo] = process.env.GITHUB_REPOSITORY.split("/");

    let mainBranchJson = await octokit.request('GET /repos/{owner}/{repo}/branches/main', {
      owner: ghOwner,
      repo: ghRepo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    //console.log(mainBranchJson);
    let mainBranchSha = mainBranchJson.data.commit.sha;

    let branchesJson = await octokit.request('GET /repos/{owner}/{repo}/branches', {
      owner: ghOwner,
      repo: ghRepo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    console.log(branchesJson);
    let branches = branchesJson.data;
    console.log(branches);

    for (const milestone of milestones) {

      // Check if for every milestone exists an branch
      if (!branches.some(b => b.name === "CAMUNDA_" + milestone.id)) {

        console.log("CREATE branch for milestone: " + milestone.name);

        let branchesJson = await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
          owner: ghOwner,
          repo: ghRepo,
          ref: "refs/heads/CAMUNDA_" + milestone.id, 
          sha: mainBranchSha,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });

        // get file content
        let fileResponse = await fetch("https://modeler.cloud.camunda.io/api/v1/files/" + milestone.fileId, {
          method: "GET",
          headers: { 
            "Content-type": "application/json",
            "Authorization": "Bearer " + webModelerToken
          }
        });

        let fileResponseJson = await fileResponse.json();

        if (fileResponseJson.metadata.simplePath.endsWith(".bpmn")) {
          console.log("Syncing BPMN: " + JSON.stringify(fileResponseJson.metadata));

          let fileContent = fileResponseJson.content;
              
          // push to GitHub
          octokit.rest.repos.createOrUpdateFileContents({
            owner: ghOwner,
            repo: ghRepo,
            path: "src/main/resources/" + fileResponseJson.metadata.simplePath,
            message: "Synchronized model from Camunda Web Modeler",
            content: btoa(fileContent),
            branch: "CAMUNDA_" + milestone.id
          });

          // deploy to Camunda production system via API
          const deployment = await zeebe.deployResource({
            name: fileResponseJson.metadata.simplePath,
            process: Buffer.from(fileContent)
          });

        } else {
          console.log("Ignoring " + JSON.stringify(fileResponseJson.metadata));
        }

      } else {
        console.log("Ignoring milestone that already has a branch: " + milestone.name);
      }
      
    }


  } catch (error) {
    console.log(error);
    core.setFailed(error.message);
  }
}