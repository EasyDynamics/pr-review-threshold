import { github } from 'projen';
import { GitHubActionTypeScriptProject, RunsUsing } from 'projen-github-action-typescript';
import * as constants from './src/constants';

const description = 'A status check Action that fails until the required number of approvals are met';

const project = new GitHubActionTypeScriptProject({
  name: 'pr-review-threshold',
  description,
  authorName: 'Easy Dynamics Corp',
  authorUrl: 'https://easydynamics.com',
  authorOrganization: true,

  devDeps: ['projen-github-action-typescript', '@octokit/graphql-schema', '@octokit/webhooks-types'],

  defaultReleaseBranch: 'main',
  projenrcTs: true,
  license: 'MIT',

  entrypoint: 'lib/main.js',

  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp(),
    pullRequestLintOptions: {
      semanticTitleOptions: {
        types: ['feat', 'fix', 'chore', 'refactor', 'docs', 'merge'],
      },
    },
  },

  actionMetadata: {
    description,
    runs: {
      using: RunsUsing.NODE_16,
      // The build always creates this as `index.js`, regardless of the naming we use
      // internally.
      main: 'dist/index.js',
    },
    inputs: {
      [constants.REVIEWER_LABEL_NAME_INPUT]: {
        description: 'The format of label names that identify the required number of reviewers',
        default: 'reviewers-required/',
        required: true,
      },
      [constants.DEFAULT_REVIEW_COUNT_INPUT]: {
        description: 'The default number of reviewers that are required on a pull request',
        default: '1',
        required: true,
      },
      [constants.TOKEN_INPUT]: {
        description: 'The token with access to read pull requests and issues and write statuses',
        default: '${{ github.token }}',
        required: true,
      },
    },
  },
});

// Workaround for projen/projen-github-action-typescript#212
project.tryFindObjectFile('package.json')?.addOverride('main', 'lib/main.js');

const workflow = project.github?.addWorkflow('check-reviews');
workflow?.on({
  pullRequestTarget: {
    types: ['opened', 'labeled', 'reopened', 'unlabeled', 'edited', 'synchronize'],
  },
  pullRequestReview: {},
});
workflow?.addJob('check-count', {
  name: 'Check Review Count',
  runsOn: ['ubuntu-latest'],
  permissions: {
    pullRequests: github.workflows.JobPermission.READ,
    // We need to clone the repository because the action lives here, which requires
    // `contents: read`. This would not normally be required for this action.
    contents: github.workflows.JobPermission.READ,
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
