import tl from 'azure-pipelines-task-lib/task';
import fetch from 'node-fetch';
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import binaryExtensions from 'binary-extensions';
import { AzureOpenAIClient, AzureKeyCredential } from '@azure/openai';
import { Configuration, OpenAIApi } from 'openai';
import https from 'https';

interface PullRequestThreadContext {
  filePath: string;
}

interface PullRequestComment {
  parentCommentId: number;
  content: string;
  commentType: number;
}

interface PullRequestThread {
  id: string;
  threadContext: PullRequestThreadContext | null;
}

interface PullRequestThreadsResponse {
  value: PullRequestThread[];
}

interface PullRequestCommentResponse {
  value: PullRequestComment[];
}

const gitOptions: Partial<SimpleGitOptions> = {
  baseDir: `${tl.getVariable('System.DefaultWorkingDirectory')}`,
  binary: 'git'
};

const apiKey: string = tl.getInput('api_key', true);
const customOpenAIEndpoint: string = tl.getInput('custom_oi_endpoint');
const modelName = 'gpt-35-turbo';

const openAiConfiguration = new Configuration({
  apiKey: apiKey
});

const openai = new OpenAIApi(openAiConfiguration);
const azure_open_api = new AzureOpenAIClient(customOpenAIEndpoint, new AzureKeyCredential(apiKey));

const httpsAgent = new https.Agent({
  rejectUnauthorized: !tl.getBoolInput('support_self_signed_certificate')
});

const git: SimpleGit = simpleGit(gitOptions);
const targetBranch: string = getTargetBranchName();

async function run() {
  try {
    if (tl.getVariable('Build.Reason') !== 'PullRequest') {
      tl.setResult(tl.TaskResult.Skipped, 'This task should be run only when the build is triggered from a Pull Request.');
      return;
    }

    if (!apiKey) {
      tl.setResult(tl.TaskResult.Failed, 'No API key provided!');
      return;
    }

    const filesNames = await getChangedFiles(targetBranch);

    await deleteExistingComments();

    for (const fileName of filesNames) {
      await reviewFile(fileName);
    }

    tl.setResult(tl.TaskResult.Succeeded, 'Pull Request reviewed.');
  } catch (err: any) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

async function getChangedFiles(targetBranch: string): Promise<string[]> {
  await git.addConfig('core.pager', 'cat');
  await git.addConfig('core.quotepath', 'false');
  await git.fetch();

  const diffs = await git.diff([targetBranch, '--name-only']);
  const files = diffs.split('\n').filter(line => line.trim().length > 0);
  const nonBinaryFiles = files.filter(file => !binaryExtensions.includes(getFileExtension(file)));

  console.log(`Changed Files (excluding binary files): \n${nonBinaryFiles.join('\n')}`);

  return nonBinaryFiles;
}

async function callOpenAIModel(prompt: string) {
  try {
    const response = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: prompt,
      max_tokens: 500
    });
    return response.data.choices;
  } catch (error: any) {
    handleErrorResponse(error);
  }
}

async function callAzureOpenAPI(modelName: string, prompt: string) {
  try {
    const response = await azure_open_api.getCompletions(modelName, prompt, {
      maxTokens: 500
    });
    return response.data.choices;
  } catch (error: any) {
    handleErrorResponse(error);
  }
}

async function reviewFile(fileName: string) {
  const content = await git.show([targetBranch, fileName]);

  const prompt = `Review the following file: ${fileName}\n\n${content}`;
  const commentPromises = [];
  if (customOpenAIEndpoint){
    const azureOpenAPIChoices = await callAzureOpenAPI(modelName, prompt);
    if (azureOpenAPIChoices.length > 0) {
      const azureOpenAPIComment = `**Azure OpenAI Model Output:**\n${azureOpenAPIChoices[0].text}`;
      commentPromises.push(addCommentToPR(fileName, azureOpenAPIComment));
    }
  }else{
    const openAIChoices = await callOpenAIModel(prompt);
    if (openAIChoices.length > 0) {
      const openAIComment = `**OpenAI Model Output:**\n${openAIChoices[0].text}`;
      commentPromises.push(addCommentToPR(fileName, openAIComment));
    }
  }
  await Promise.all(commentPromises);
}

async function addCommentToPR(filePath: string, content: string) {
  const prId = tl.getVariable('System.PullRequest.PullRequestId');

  if (!prId) {
    console.warn('No Pull Request ID found. Skipping comment addition.');
    return;
  }

  const url = `${tl.getVariable('System.TeamFoundationCollectionUri')}${tl.getVariable(
    'System.TeamProject'
  )}/_apis/git/repositories/${tl.getVariable('Build.Repository.ID')}/pullrequests/${prId}/threads`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${tl.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'AccessToken')}`
    },
    agent: httpsAgent
  });

  if (!response.ok) {
    throw new Error(`Failed to retrieve threads for Pull Request: ${response.statusText}`);
  }

  const threadsResponse: PullRequestThreadsResponse = await response.json();
  const threads = threadsResponse.value;
  const threadContext: PullRequestThreadContext = { filePath };

  const threadExists = threads.some(thread => {
    const isSameContext = thread.threadContext && thread.threadContext.filePath === filePath;
    return isSameContext && thread.id.startsWith('code-review-bot');
  });

  if (threadExists) {
    console.warn(`A thread already exists for file: ${filePath}. Skipping comment addition.`);
    return;
  }

  const comment: PullRequestComment = {
    parentCommentId: -1,
    content,
    commentType: 1 // CommentType 1 indicates a regular comment
  };

  const thread: PullRequestThread = {
    id: `code-review-bot-${Date.now().toString()}`,
    threadContext,
  };

  thread.threadContext = threadContext;

  const commentUrl = `${url}/${thread.id}/comments`;

  const commentResponse = await fetch(commentUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tl.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'AccessToken')}`
    },
    body: JSON.stringify(comment),
    agent: httpsAgent
  });

  if (!commentResponse.ok) {
    throw new Error(`Failed to add comment to Pull Request: ${commentResponse.statusText}`);
  }
}

async function deleteExistingComments() {
  const prId = tl.getVariable('System.PullRequest.PullRequestId');

  if (!prId) {
    console.warn('No Pull Request ID found. Skipping comment deletion.');
    return;
  }

  const url = `${tl.getVariable('System.TeamFoundationCollectionUri')}${tl.getVariable(
    'System.TeamProject'
  )}/_apis/git/repositories/${tl.getVariable('Build.Repository.ID')}/pullrequests/${prId}/threads`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${tl.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'AccessToken')}`
    },
    agent: httpsAgent
  });

  if (!response.ok) {
    throw new Error(`Failed to retrieve threads for Pull Request: ${response.statusText}`);
  }

  const threadsResponse: PullRequestThreadsResponse = await response.json();
  const threads = threadsResponse.value;
  const deletePromises = [];

  for (const thread of threads) {
    if (thread.id.startsWith('code-review-bot')) {
      const commentUrl = `${url}/${thread.id}/comments`;

      const commentResponse = await fetch(commentUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tl.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'AccessToken')}`
        },
        agent: httpsAgent
      });

      if (!commentResponse.ok) {
        throw new Error(`Failed to retrieve comments for Pull Request: ${commentResponse.statusText}`);
      }

      const commentResponseJson: PullRequestCommentResponse = await commentResponse.json();
      const comments = commentResponseJson.value;

      for (const comment of comments) {
        if (comment.content.includes('code-review-bot')) {
          const deleteCommentUrl = `${commentUrl}/${comment.id}`;

          deletePromises.push(
            fetch(deleteCommentUrl, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${tl.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'AccessToken')}`
              },
              agent: httpsAgent
            })
          );
        }
      }
    }
  }

  await Promise.all(deletePromises);
}

function getTargetBranchName(): string {
  const sourceBranch = tl.getVariable('Build.SourceBranch');

  if (sourceBranch && sourceBranch.startsWith('refs/pull/')) {
    const branchParts = sourceBranch.split('/');
    return `refs/heads/${branchParts[2]}`;
  }

  return 'origin/master';
}

function getFileExtension(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex !== -1) {
    return fileName.substring(extensionIndex + 1);
  }
  return '';
}

function handleErrorResponse(error: any) {
  if (error.response && error.response.data && error.response.data.error) {
    throw new Error(`OpenAI API Error: ${error.response.data.error.message}`);
  } else if (error.message) {
    throw new Error(`Error occurred while calling OpenAI API: ${error.message}`);
  } else {
    throw new Error('An unknown error occurred while calling OpenAI API.');
  }
}

run();
