import * as core from '@actions/core';
import * as github from '@actions/github';
import type { Octokit } from '@octokit/core';
import { PullRequestEvent, PullRequestReviewEvent } from '@octokit/webhooks-definitions/schema';

const pullRequestQuery = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(name: $name, owner: $owner) {
    pullRequest(number: $number) {
      reviewDecision
      reviews(last: 20) {
        nodes {
          author {
            login
          }
          body
          state
          submittedAt
        }
      }
      labels(first: 20) {
        nodes {
          name
        }
      }
    }
  }
}
`;

export type ReviewType = 'APPROVED' | 'PENDING' | 'COMMENTED' | 'CHANGES_REQUESTED' | 'DISMISSED';

export type PullRequestReview = {
  author: {
    login: string;
  };
  body: string;
  state: ReviewType;
  submittedAt: string;
};

export type PullRequestReviewsAndLabels = {
  reviews: {
    nodes: PullRequestReview[];
  };
  labels: {
    nodes: {
      name: string;
    }[];
  };
  reviewDecision: 'REVIEW_REQUIRED' | 'APPROVED' | 'CHANGES_REQUESTED';
};

export function uniqueApprovals(reviews: PullRequestReview[]): number {
  const latestReviews: Record<string, { timestamp: string; state: ReviewType }> = {};
  for (const review of reviews) {
    const latestReview = latestReviews[review.author.login];
    if (!latestReview || (latestReview.timestamp < review.submittedAt && ['APPROVED', 'DISMISSED', 'CHANGES_REQUESTED'].includes(review.state))) {
      latestReviews[review.author.login] = { timestamp: review.submittedAt, state: review.state };
    }
  }
  return Object.entries(latestReviews).reduce((sum, [_, review]) => sum + (review.state === 'APPROVED' ? 1 : 0), 0);
}

export function requiredReviewThreshold(pullRequest: PullRequestReviewsAndLabels, labelFormat: string, defaultReviews: number): number {
  const matchingLabels = pullRequest.labels.nodes
    .map(label => label.name)
    .filter(name => name.startsWith(labelFormat));

  if (!matchingLabels.length) {
    core.warning(`No label matched; falling back to default: ${defaultReviews}`);
    return defaultReviews;
  }

  return matchingLabels
    .map(label => label.replace(labelFormat, ''))
    .map(suffix => Number(suffix))
    .map(num => (isNaN(num) || num < 1) ? 0 : num)
    .reduce((a, b) => Math.max(a, b), 0);
}

async function getPullRequest(octokit: Octokit, owner: string, name: string, number: number): Promise<PullRequestReviewsAndLabels> {
  const data = (await octokit.graphql<{ repository: { pullRequest: PullRequestReviewsAndLabels } }>(pullRequestQuery, {
    owner,
    name,
    number,
  }));
  return data.repository.pullRequest;
}

async function run(): Promise<void> {
  const labelFormat = core.getInput('review-label-prefix', { required: true });
  const defaultReviews = Number(core.getInput('default-required-reviewers', { required: true }));
  if (isNaN(defaultReviews) || defaultReviews < 0) {
    throw new Error('Default review count must be at least `0`');
  }
  const token = core.getInput('token', { required: true });

  const octokit = github.getOctokit(token);
  if (!github.context.eventName.startsWith('pull_request')) {
    throw new Error('The event type is not correct');
  }
  const event = github.context.payload as PullRequestEvent | PullRequestReviewEvent;
  const owner = event.repository.owner;
  const repoName = event.repository.name;
  const prNumber = event.pull_request.number;
  const pullRequest = await getPullRequest(octokit, owner.login, repoName, prNumber);
  if (pullRequest.reviewDecision === 'CHANGES_REQUESTED') {
    throw new Error('The pull request is in a "Changes requested" state and cannot be merged');
  }
  // At the point, all reviews are either comments or approvals and the branch protection
  // threshold has been met; however, we need to ensure the PR meets the addition rules for
  // this action's configuration.
  const requiredApprovals = requiredReviewThreshold(pullRequest, labelFormat, defaultReviews);
  const approveCount = uniqueApprovals(pullRequest.reviews.nodes);
  if (requiredApprovals < 1) {
    core.warning(`Approval threshold was found to be less than 1 (is: ${requiredApprovals}). Is this intentional?`);
  }
  if (approveCount < requiredApprovals) {
    core.setFailed(`Only  ${approveCount} reviews have approved but ${requiredApprovals} are required`);
  } else {
    core.info(`Received ${requiredApprovals}/${approveCount} approvals`);
  }
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    if (error instanceof Error) core.setFailed(error.message);
    else core.setFailed(`${error}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
