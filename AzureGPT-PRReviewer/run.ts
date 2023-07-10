import tl = require('azure-pipelines-task-lib/task');
import simpleGit = require('simple-git');
const { Configuration, OpenAIApi } = require("openai");
const https = require("https");
import { GetChangedFiles } from './file_ret';
// import { GetLatestCommitFiles } from './file_ret';
import { DeleteExistingComments } from './del_com';
import { reviewFile } from './rev_comm';
import { getTargetBranchName } from './file_ret';

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

async function run() {
  try {
    if (tl.getVariable('Build.Reason') !== 'PullRequest') {
      tl.setResult(tl.TaskResult.Skipped, "This task should be run only when the build is triggered from a Pull Request.");
      return;
    }

    const supportSelfSignedCertificate = tl.getBoolInput('support_self_signed_certificate');
    apiKey = tl.getInput('api_key', true);
    aoiEndpoint = tl.getInput('aoi_endpoint');
    
    if (apiKey == undefined) {
      tl.setResult(tl.TaskResult.Failed, 'No Api Key provided!');
      return;
    }

    if (aoiEndpoint == undefined) {
      const openAiConfiguration = new Configuration({
        apiKey: apiKey,
      });
      
      openai = new OpenAIApi(openAiConfiguration);
    }

    httpsAgent = new https.Agent({
      rejectUnauthorized: !supportSelfSignedCertificate
    });

    git = simpleGit.simpleGit(gitOptions);
    targetBranch = getTargetBranchName();

    // const latestCommitFiles = await GetLatestCommitFiles(latestCommitID);
    // for (const fileName of latestCommitFiles) {
    //   await reviewFile(fileName)
    // }

    const filesNames = await GetChangedFiles(targetBranch);

    await DeleteExistingComments();
    // await DeleteExistingComments(filesNames);

    for (const fileName of filesNames) {
      await reviewFile(fileName)
    }

    tl.setResult(tl.TaskResult.Succeeded, "Pull Request reviewed.");
  }
  catch (err: any) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}