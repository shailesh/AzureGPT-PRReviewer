import tl = require('azure-pipelines-task-lib/task');
import fetch = require('node-fetch');
const https = require("https");

let httpsAgent: any;


function getCollectionName(collectionUri: string) {
    const collectionUriWithoutProtocol = collectionUri!.replace('https://', '').replace('http://', '');
  
    if (collectionUriWithoutProtocol.includes('.visualstudio.')) {
      return collectionUriWithoutProtocol.split('.visualstudio.')[0];
    }
    else {
      return collectionUriWithoutProtocol.split('/')[1];
    }
}

export async function DeleteExistingComments() {
    // async function DeleteExistingComments(filenames: string[]) {
    console.log("Start deleting existing comments added by the previous Job ...");
  
    const threadsUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads?api-version=5.1`;
    const threadsResponse = await fetch.default(threadsUrl, {
      headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` },
      agent: httpsAgent
    });
  
    const threads = await threadsResponse.json() as { value: [] };
    const threadsWithContext = threads.value.filter((thread: any) => thread.threadContext !== null);
  
    const collectionUri = tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI') as string;
    const collectionName = getCollectionName(collectionUri);
    const buildServiceName = `${tl.getVariable('SYSTEM.TEAMPROJECT')} Build Service (${collectionName})`;
  
    for (const thread of threadsWithContext as any[]) {
      const commentsUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads/${thread.id}/comments?api-version=5.1`;
      const commentsResponse = await fetch.default(commentsUrl, {
        headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` },
        agent: httpsAgent
      });
  
      const comments = await commentsResponse.json() as { value: [] };
  
      for (const comment of comments.value.filter((comment: any) => comment.author.displayName === buildServiceName) as any[]) {
  
        /*
        const commentFilename = comment.threadContext.filePath;
        if (filenames.includes(commentFilename)) {
          const removeCommentUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads/${thread.id}/comments/${comment.id}?api-version=5.1`;
          await fetch.default(removeCommentUrl, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` },
            agent: httpsAgent
          });
        }
        */
  
        const removeCommentUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads/${thread.id}/comments/${comment.id}?api-version=5.1`;
  
        await fetch.default(removeCommentUrl, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` },
          agent: httpsAgent
        });
  
      }
    }
  
    console.log("Existing comments deleted.");
  }