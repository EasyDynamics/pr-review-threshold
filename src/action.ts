import * as core from '@actions/core';
import * as github from '@actions/github';
import type { Octokit } from '@octokit/core';
import type { PullRequestReviewState, PullRequestReviewDecision } from '@octokit/graphql-schema';
import type { PullRequestEvent, PullRequestReviewEvent } from '@octokit/webhooks-types';
import * as constants from './constants';

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

export type PullRequestReview = {
  author: {
    login: string;
  };
  body: string;
  state: PullRequestReviewState;
  submittedAt: string;
};
export type PullRequestLabel = {
  name: string;
}
export type PullRequestReviewsAndLabels = {
  reviews: {
    nodes: PullRequestReview[];
  };
  labels: {
    nodes: PullRequestLabel[];
  };
  reviewDecision: PullRequestReviewDecision;
};
export type QueryResponse = {
  repository: {
    pullRequest: PullRequestReviewsAndLabels;
  };
};

/**
 * Count the number of unique approvers for a pull request.
 *
 * Given a list of reviews, this checks how many authors currently approve the pull request.
 * If an author has multiple approving reviews, only one will be counted (as only reviewers
 * are counted, not individual reviews). If the review has been dismissed, it is not counted
 * and overrides an earlier approval. If an approval is followed by requested changes, the
 * earlier approval is discounted. Comments and pending reviews are not considered.
 *
 * @param reviews the reviews to evaluate
 * @returns the number of reviewers who currently approve the pull request
 */
export function uniqueActiveApprovers(reviews: PullRequestReview[]): number {
  const latestReviews: Record<string, { timestamp: string; state: PullRequestReviewState }> = {};
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

/**
 * Determine the required number of approving approvals.
 *
 * This determination is based primarily on the applied labels and the configured review
 * requirement prefix. If no such labels are defined, the default count is returned. Otherwise,
 * the labels are evaluated. If one matching label is applied, it is used. If multiple matching
 * labels are applied, the largest is chosen.
 *
 * @param labels the labels currently applied to the pull request
 * @param labelPrefix the string that the precedes the reviewer count in label names
 * @param defaultReviews the default number of approvals to require for each pull request
 * @returns the required number of approvals for the pull request
 */
export function requiredReviewThreshold(labels: PullRequestLabel[], labelPrefix: string, defaultReviews: number): number {
  const matchingLabels = labels
    .map(label => label.name)
    .filter(name => name.startsWith(labelPrefix));

  if (!matchingLabels.length) {
    core.warning(`No label matched; falling back to default: ${defaultReviews}`);
    return defaultReviews;
  }

  const reviewerCounts = matchingLabels
    .map(label => label.replace(labelPrefix, ''))
    .map(suffix => Number(suffix))
    // Ensure that we do not accidentally return `NaN` or a negative number
    .map(num => (isNaN(num) || num < 1) ? 0 : num);
  return Math.max(...reviewerCounts);
}

async function getPullRequest(octokit: Octokit, owner: string, name: string, number: number): Promise<PullRequestReviewsAndLabels> {
  const data = (await octokit.graphql<QueryResponse>(pullRequestQuery, {
    owner,
    name,
    number,
  }));
  return data.repository.pullRequest;
}

function getDefaultReviewCount(): number {
  const defaultReviews = Number(core.getInput(constants.DEFAULT_REVIEW_COUNT_INPUT, { required: true }));
  if (isNaN(defaultReviews) || defaultReviews < 0) {
    throw new Error('Default review count must be at least `0`');
  }
  return defaultReviews;
}

export async function run(): Promise<void> {
  if (!github.context.eventName.startsWith('pull_request')) {
    throw new Error(`The event type (${github.context.eventName}) is not supported`);
  }

  const labelFormat = core.getInput(constants.REVIEWER_LABEL_NAME_INPUT, { required: true });
  const defaultReviews = getDefaultReviewCount();

  const event = github.context.payload as PullRequestEvent | PullRequestReviewEvent;
  const owner = event.repository.owner;
  const repoName = event.repository.name;
  const prNumber = event.pull_request.number;

  const octokit = github.getOctokit(core.getInput(constants.TOKEN_INPUT, { required: true }));
  const pullRequest = await getPullRequest(octokit, owner.login, repoName, prNumber);
  if (pullRequest.reviewDecision === 'CHANGES_REQUESTED') {
    throw new Error('The pull request is in a "Changes requested" state and cannot be merged');
  }

  // At the point, all reviews are either comments or approvals and the branch protection
  // threshold has been met; however, we need to ensure the PR meets the additional rules for
  // this action's configuration.
  const requiredApprovals = requiredReviewThreshold(pullRequest.labels.nodes, labelFormat, defaultReviews);
  const approveCount = uniqueActiveApprovers(pullRequest.reviews.nodes);

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
