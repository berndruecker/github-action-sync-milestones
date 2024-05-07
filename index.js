const core = require('@actions/core');
const github = require('@actions/github');
const Camunda8 = require('@camunda8/sdk');



const camundaClientId = core.getInput('camunda-client-id');
const camundaClientSecret = core.getInput('camunda-client-secret');
const zeebeAddress = core.getInput('camunda-zeebe-address');
//const webmodelerClientId = core.getInput('webmodeler-client-id');

const camunda = new Camunda8({
  config: {
    ZEEBE_ADDRESS: zeebeAddress,
    ZEEBE_CLIENT_ID: camundaClientId,
    ZEEBE_CLIENT_SECRET: camundaClientSecret,
    ZEEBE_AUTHORIZATION_SERVER_URL: 'https://login.cloud.camunda.io/oauth/token'
  },
})

//    ZEEBE_ADDRESS: 'localhost:26500'
//    ZEEBE_CLIENT_ID: 'zeebe'
//    ZEEBE_CLIENT_SECRET: 'zecret'
//    CAMUNDA_OAUTH_URL: 'http://localhost:18080/auth/realms/camunda-platform/protocol/openid-connect/token'

//export ZEEBE_ADDRESS='8b160d8d-ce5d-4435-aabb-a85211cd280a.syd-1.zeebe.camunda.io:443'
//export ZEEBE_CLIENT_ID='b-vWK1738v.--~beFdNlO8baKP7fZCUQ'
//export ZEEBE_CLIENT_SECRET='bY5hyY6yb.cKfJXZvIZIqg.OjrD5yWraYzLMaoMkMcxuf-Tfo-RDaypqDJjV0YLb'
//export ZEEBE_AUTHORIZATION_SERVER_URL=
/*
export ZEEBE_REST_ADDRESS='https://syd-1.zeebe.camunda.io/8b160d8d-ce5d-4435-aabb-a85211cd280a'
export ZEEBE_GRPC_ADDRESS='grpcs://8b160d8d-ce5d-4435-aabb-a85211cd280a.syd-1.zeebe.camunda.io:443'
export ZEEBE_TOKEN_AUDIENCE='zeebe.camunda.io'
export CAMUNDA_CLUSTER_ID='8b160d8d-ce5d-4435-aabb-a85211cd280a'
export CAMUNDA_CLUSTER_REGION='syd-1'
export CAMUNDA_CREDENTIALS_SCOPES='Zeebe,Operate'
export CAMUNDA_OPERATE_BASE_URL='https://syd-1.operate.camunda.io/8b160d8d-ce5d-4435-aabb-a85211cd280a'
export CAMUNDA_OAUTH_URL='https://login.cloud.camunda.io/oauth/token'
*/

run();

async function run() {
  try {
    // `who-to-greet` input defined in action metadata file
    //const nameToGreet = core.getInput('who-to-greet');
    //console.log(`Hello ${nameToGreet}!`);
    //const time = (new Date()).toTimeString();
    //core.setOutput("time", time);
    
    // Get the JSON webhook payload for the event that triggered the workflow    
    const payload = JSON.stringify(github.context.payload, undefined, 2)
    //console.log(`The event payload: ${payload}`);


      // This should be a token with access to your repository scoped in as a secret.
      // The YML workflow will need to set myToken with the GitHub Secret Token
      // myToken: ${{ secrets.GITHUB_TOKEN }}
      // https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
    const githubToken = core.getInput('github-token');
    const webmodelerClientId = core.getInput('webmodeler-client-id');
    const webmodelerClientSecret = core.getInput('webmodeler-client-secret');

    if (!github || !webmodelerClientId || !webmodelerClientSecret) {
      core.setFailed("You need to set GITHUB_TOKEN and WEB_MODELER CREDENTIALS");
    }

    const zeebe = camunda.getZeebeGrpcApiClient();

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
        size: 50
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
        console.log("CREATE " + milestone.name);

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
        console.log(fileResponse);
        let fileResponseJson = await fileResponse.json();
        console.log(fileResponseJson);
        let fileContent = fileResponseJson.content;
        console.log(fileContent);
        const contentEncoded = btoa(fileContent);
        
        // push to GitHub
        octokit.rest.repos.createOrUpdateFileContents({
          owner: ghOwner,
          repo: ghRepo,
          path: "src/main/resources/" + fileResponseJson.metadata.simplePath,
          message: "Synchronized model from Camunda Web Modeler",
          content: contentEncoded,
          branch: "CAMUNDA_" + milestone.id
                    //"Bernd Ruecker", // Committer
          //"bernd.ruecker@amunda.com",
          //"Bernd Ruecker", // Auhor
          //"bernd.ruecker@amunda.com"

          // deploy to production system via API
         const deployment = await zeebe.deployResource({
          name: fileResponseJson.metadata.simplePath,
          process: fileContent
//            processFilename: path.join(process.cwd(), "process.bpmn"),        
        });

      } else {
        console.log("NOPE " + milestone.name);

      }

      // if not, create that branch
      // and push the model files into it

      // create a PR
      
    }



  } catch (error) {
    console.log(error);
    core.warning(error);
    core.setFailed(error.message);
  }
}