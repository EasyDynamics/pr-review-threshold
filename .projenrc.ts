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
        default: '${{ secrets.GITHUB_TOKEN }}',
        required: true,
      },
    },
  },

  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});

project.github
  ?.addWorkflow('check-reviews')
  .addJob('Check review count', {
    runsOn: ['ubuntu-latest'],
    permissions: {
      pullRequests: github.workflows.JobPermission.READ,
    },
    steps: [
      {
        name: 'Run action',
        uses: '.',
      },
    ],
  });

project.synth();
