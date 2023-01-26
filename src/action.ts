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
    const previousAuthorReview = latestReviews[review.author.login];
    // The input data should be date-ordered but it may not be too. Additionally, comments
    // and pending reviews do not "override" a previous approval or rejection. Only a
    // dismissal, approval, or rejection can.
    const isUpdatedReview = (
      (previousAuthorReview?.timestamp ?? '') < review.submittedAt
      && ['APPROVED', 'DISMISSED', 'CHANGES_REQUESTED'].includes(review.state)
    );
    if (!previousAuthorReview || isUpdatedReview) {
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

function getDefaultReviewCount(): number {
  const defaultReviews = Number(core.getInput('default-required-reviewers', { required: true }));
  if (isNaN(defaultReviews) || defaultReviews < 0) {
    throw new Error('Default review count must be at least `0`');
  }
  return defaultReviews;
}

export async function run(): Promise<void> {
  if (!github.context.eventName.startsWith('pull_request')) {
    throw new Error(`The event type (${github.context.eventName}) is not supported`);
  }

  const labelFormat = core.getInput('review-label-prefix', { required: true });
  const defaultReviews = getDefaultReviewCount();

  const event = github.context.payload as PullRequestEvent | PullRequestReviewEvent;
  const owner = event.repository.owner;
  const repoName = event.repository.name;
  const prNumber = event.pull_request.number;

  const octokit = github.getOctokit(core.getInput('token', { required: true }));
  const pullRequest = await getPullRequest(octokit, owner.login, repoName, prNumber);
  if (pullRequest.reviewDecision === 'CHANGES_REQUESTED') {
    throw new Error('The pull request is in a "Changes requested" state and cannot be merged');
  }

  // At the point, all reviews are either comments or approvals and the branch protection
  // threshold has been met; however, we need to ensure the PR meets the additional rules for
  // this action's configuration.
  const requiredApprovals = requiredReviewThreshold(pullRequest, labelFormat, defaultReviews);
  const approveCount = uniqueApprovals(pullRequest.reviews.nodes);

  // These situations are explicitly supported by this action; however, we should still warn
  // that this situation occurred.
  if (requiredApprovals < 1) {
    core.warning(`Approval threshold (${requiredApprovals}) is less than 1. Is this intentional?`);
  }
  if (requiredApprovals < defaultReviews) {
    core.warning(`Approval threshold (${requiredApprovals}) is less than the configured default (${defaultReviews}). Is this intentional?`);
  }

  if (approveCount < requiredApprovals) {
    core.setFailed(`Only ${approveCount} reviews have approved but ${requiredApprovals} are required`);
  } else {
    core.info(`Received ${requiredApprovals}/${approveCount} approvals`);
  }
}
