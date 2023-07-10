import tl = require('azure-pipelines-task-lib/task');
import simpleGit = require('simple-git');
import binaryExtensions = require('binary-extensions');

const gitOptions: Partial<simpleGit.SimpleGitOptions> = {
    baseDir: `${tl.getVariable('System.DefaultWorkingDirectory')}`,
    binary: 'git'
};

let git: simpleGit.SimpleGit;

function getFileExtension(fileName: string) {
    return fileName.slice((fileName.lastIndexOf(".") - 1 >>> 0) + 2);
}

export async function GetChangedFiles(targetBranch: string) {
await git.addConfig('core.pager', 'cat');
await git.addConfig('core.quotepath', 'false');
await git.fetch();

const diffs = await git.diff([targetBranch, '--name-only']);
const files = diffs.split('\n').filter(line => line.trim().length > 0);
const nonBinaryFiles = files.filter(file => !binaryExtensions.includes(getFileExtension(file)));

console.log(`Changed Files (excluding binary files) : \n ${nonBinaryFiles.join('\n')}`);

return nonBinaryFiles;
}

export async function GetLatestCommitFiles() {
try{
    const latestCommitID = tl.getVariable('Build.SourceVersion') as string;
    const commitFiles = await git.diff(['--name-only', latestCommitID]);
    const files = commitFiles.split('\n').filter(line => line.trim().length > 0);
    const nonBinaryFiles = files.filter(file => !binaryExtensions.includes(getFileExtension(file)));

    console.log(`Latest Commit Files (excluding binary files) : \n ${nonBinaryFiles.join('\n')}`);

    return nonBinaryFiles;
}
catch(error){
    console.error('GetLatestCommitFiles error: ', error)
    return [];
} 
}

export function getTargetBranchName() {
    let targetBranchName = tl.getVariable('System.PullRequest.TargetBranchName');
  
    if (!targetBranchName) {
      targetBranchName = tl.getVariable('System.PullRequest.TargetBranch')?.replace('refs/heads/', '');
    }
  
    return `origin/${targetBranchName}`;
  }