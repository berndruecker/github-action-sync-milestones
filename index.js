const core = require('@actions/core');
const github = require('@actions/github');

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

    const webModelerToken = await tokenResponse.json().access_token;
    let milestoneResponse = await fetch("https://modeler.cloud.camunda.io/api/v1/milestones/search", {
      method: "POST",
      headers: { 
        "Content-type": "application/json",
        "Authorization": "Bearer " + webModelerToken
      },
      body: JSON.stringify({})
    });
    let milestones = await milestoneResponse.json().items;
    console.log(milestones);


    // Get branches from GitHub
    const octokit = github.getOctokit(githubToken);
    const [ghOwner, ghRepo] = process.env.GITHUB_REPOSITORY.split("/");

    let branches = await octokit.request('GET /repos/{owner}/{repo}/branches', {
      owner: ghOwner,
      repo: ghRepo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }).data

    console.log(branches);

    for (const milestone of miletsones) {
      // Check if for every milestone exists an branch
      if (!branches.some(b => b.name === "CAM_" + milestone.id)) {
        console.log("CREATE " + milestone);
      } else {
        console.log("NOPE " + milestone);

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