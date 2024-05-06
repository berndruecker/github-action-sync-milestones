const core = require('@actions/core');
const github = require('@actions/github');

try {
  // `who-to-greet` input defined in action metadata file
  const nameToGreet = core.getInput('who-to-greet');
  console.log(`Hello ${nameToGreet}!`);
  const time = (new Date()).toTimeString();
  core.setOutput("time", time);
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`);


    // This should be a token with access to your repository scoped in as a secret.
    // The YML workflow will need to set myToken with the GitHub Secret Token
    // myToken: ${{ secrets.GITHUB_TOKEN }}
    // https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
    const myToken = core.getInput('myToken');
    const octokit = github.getOctokit(myToken)


  // Get Web Modeler Milestones 
  const tokenResponse = await fetch(" https://login.cloud.camunda.io/oauth/token", {
    method: "POST",
    headers: { "Content-type": "application/json" },
    body: JSON.stringify({
      "grant_type":"client_credentials",
      "audience":"api.cloud.camunda.io", 
      "client_id":"{{ secrets.WEB_MODELER_CLIENT_ID }}", 
      "client_secret":"{{ secrets.WEB_MODELER_CLIENT_SECRET }}"})
    });

  console.log(tokenResponse)

  const x = await octokit.branches(github.context.repository_owner + "/" + github.context.repository)
  console.log(x)

  // Get all GH Branches
  const { branchesList: pullRequest } == await octokit.branches(github.context.repository_owner + "/" + github.context.repository)  

  // Check if for every milestone exists an branch

    // if not, create that branch
    // and push the model files into it

    // create a PR



} catch (error) {
  core.setFailed(error.message);
}