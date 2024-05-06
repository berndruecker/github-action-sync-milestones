const core = require('@actions/core');
const github = require('@actions/github');
//const { Octokit } = require("@octokit/rest");

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
      body: JSON.stringify({})
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
          path: "src/main/resources/" + fileResponseJson.simplePath,
          message: "Updates synced from Camunda Web Modeler",
          content: contentEncoded,
          branch: "CAMUNDA_" + milestone.id
                    //"Bernd Ruecker", // Committer
          //"bernd.ruecker@amunda.com",
          //"Bernd Ruecker", // Auhor
          //"bernd.ruecker@amunda.com"
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