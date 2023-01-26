import { github } from 'projen';
import { GitHubActionTypeScriptProject, RunsUsing } from 'projen-github-action-typescript';

const description = 'A status check Action that fails until the required number of approvals are met';

const project = new GitHubActionTypeScriptProject({
  name: 'review-threshold',
  description,

  devDeps: ['projen-github-action-typescript'],
  deps: ['@octokit/webhooks-definitions'],

  defaultReleaseBranch: 'main',
  projenrcTs: true,

  actionMetadata: {
    description,
    runs: {
      using: RunsUsing.NODE_16,
      main: 'dist/index.js',
    },
    inputs: {
      'review-label-prefix': {
        description: 'The format of label names that identify the required number of reviewers',
        default: 'reviewers-required/',
        required: true,
      },
      'default-required-reviewers': {
        description: 'The default number of reviewers that are required on a pull request',
        default: '1',
        required: true,
      },
      'token': {
        description: 'The token with access to read pull requests and issues and write statuses',
        default: '${{ secret.GITHUB_TOKEN }}',
        required: true,
      },
    },
  },
});

const workflow = project.github?.addWorkflow('check-reviews');
workflow?.on({
  pullRequestTarget: {
    types: ['opened', 'labeled', 'reopened', 'unlabeled', 'edited'],
  },
  pullRequestReview: {},
});
workflow?.addJob('check-count', {
  name: 'Check Review Count',
  runsOn: ['ubuntu-latest'],
  permissions: {
    contents: github.workflows.JobPermission.READ,
    pullRequests: github.workflows.JobPermission.READ,
  },
  steps: [
    {
      name: 'Checkout code',
      uses: 'actions/checkout@v3',
    },
    {
      name: 'Run action',
      uses: './',
    },
  ],
});

project.synth();
