import tl = require('azure-pipelines-task-lib/task');
import fetch = require('node-fetch');
import simpleGit = require('simple-git');

const gitOptions: Partial<simpleGit.SimpleGitOptions> = {
  baseDir: `${tl.getVariable('System.DefaultWorkingDirectory')}`,
  binary: 'git'
};

let openai: any;
let git: simpleGit.SimpleGit;
let targetBranch: string;
let httpsAgent: any;
var apiKey: any;
var aoiEndpoint: any;

async function AddCommentToPR(fileName: string, comment: string) {
  const body = {
    comments: [
      {
        parentCommentId: 0,
        content: comment,
        commentType: 1
      }
    ],
    status: 1,
    threadContext: {
      filePath: fileName,
    }
  }

  const prUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads?api-version=5.1`

  await fetch.default(prUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    agent: httpsAgent
  });

  console.log(`New comment added.`);
}

export async function reviewFile(fileName: string) {
    console.log(`Start reviewing ${fileName} ...`);
  
    const patch = await git.diff([targetBranch, '--', fileName]);
  
    const prompt = `
            Act as a code reviewer of a Pull Request, providing feedback on the code changes below.
            You are provided with the Pull Request changes in a patch format.
            Each patch entry has the commit message in the Subject line followed by the code changes (diffs) in a unidiff format.
            
            As a code reviewer, your task is:
            - Review only added, edited or deleted lines.
            - Non changed code should not be reviewed
            - If there's no bugs, write 'No feedback'.
            - Use bullet points if you have multiple comments.
            
            Patch of the Pull Request to review:
            ${patch}
            `;
  
    try {
      let choices: any;
  
      if (aoiEndpoint == undefined) {
        const response = await openai.createCompletion({
          model: "text-davinci-003",
          prompt: prompt,
          max_tokens: 500
        });
  
        choices = response.data.choices
      }
      else {
        const request = await fetch.default(aoiEndpoint, {
          method: 'POST',
          headers: { 'api-key': `${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            max_tokens: 500,
            messages: [{
              role: "user",
              content: prompt
            }]
          }),
          agent: httpsAgent
        });
  
        const response = await request.json();
        
        choices = response.choices;
      }
  
      if (choices && choices.length > 0) {
        const review = aoiEndpoint ? choices[0].message?.content : choices[0].text as string
  
        if (review.trim() !== "No feedback.") {
          await AddCommentToPR(fileName, review);
        }
      }
  
      console.log(`Review of ${fileName} completed.`);
    }
    catch (error: any) {
      if (error.response) {
        console.log(error.response.status);
        console.log(error.response.data);
      } else {
        console.log(error.message);
      }
    }
  }