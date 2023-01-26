import { requiredReviewThreshold, uniqueApprovals, PullRequestReview, ReviewType, PullRequestReviewsAndLabels } from '../src';

function makeReview(name: string, state: ReviewType, timestamp: string): PullRequestReview {
  return {
    author: {
      login: name,
    },
    body: '',
    state,
    submittedAt: timestamp,
  };
}

const reviews: PullRequestReview[] = [
  makeReview('user123', 'CHANGES_REQUESTED', '2022-08-01T19:33:49Z'),
  makeReview('user345', 'APPROVED', '2022-08-01T20:15:19Z'),
  makeReview('user123', 'COMMENTED', '2022-08-11T20:16:19Z'),
  makeReview('user123', 'APPROVED', '2022-08-12T06:14:34Z'),
];

describe('unique approval count', () => {
  it('returns the number of approvals', () => {
    expect(uniqueApprovals(reviews)).toBe(2);
  });
  it('ignores an approval if changes later requested', () => {
    // GIVEN
    const prReviews = [
      ...reviews,
      makeReview('user345', 'CHANGES_REQUESTED', '2023-01-01T00:00:00Z'),
    ];
    // WHEN
    const approvalCount = uniqueApprovals(prReviews);
    // THEN
    expect(approvalCount).toBe(1);
  });
  it('does not count an approval if it is later dismissed', () => {
    // GIVEN
    const prReviews = [
      ...reviews,
      makeReview('user123', 'DISMISSED', '2023-01-01T00:00:00Z'),
    ];
    // WHEN
    const approvalCount = uniqueApprovals(prReviews);
    // THEN
    expect(approvalCount).toBe(1);
  });
  it.each(['PENDING', 'COMMENTED'])('does not count %s reviews against an approval', (type) => {
    // GIVEN
    const prReviews = [
      ...reviews,
      makeReview('user123', type as ReviewType, '2023-01-01T00:00:00Z'),
    ];
    // WHEN
    const approvalCount = uniqueApprovals(prReviews);
    // THEN
    expect(approvalCount).toBe(2);
  });
});

function makeLabel(prefix: string, count: number): { prefix: string; count: number; label: string } {
  return {
    prefix,
    count,
    label: `${prefix}${count}`,
  };
}

describe('required review threshold', () => {
  it('returns default without a label', () => {
    // GIVEN
    const pr: PullRequestReviewsAndLabels = {
      reviewDecision: 'REVIEW_REQUIRED',
      reviews: { nodes: [] },
      labels: {
        nodes: [],
      },
    };
    const defaultThreshold = 100;
    // WHEN
    const required = requiredReviewThreshold(pr, 'required-reviews/', defaultThreshold);
    // THEN
    expect(required).toBe(defaultThreshold);
  });
  it.each([
    makeLabel('foo123bar/', 2),
    makeLabel('fo123', 4),
    makeLabel('expected-reviewers/', 1),
    makeLabel('review-required-from-', 2),
  ])('grabs a numeric suffix ($count) with a prefix ($prefix)', ({ prefix, count, label }) => {
    // GIVEN
    const pr: PullRequestReviewsAndLabels = {
      reviewDecision: 'REVIEW_REQUIRED',
      reviews: { nodes: [] },
      labels: { nodes: [{ name: label }] },
    };
    const defaultThreshold = -1000;
    // WHEN
    const required = requiredReviewThreshold(pr, prefix, defaultThreshold);
    // THEN
    expect(required).toBe(count);
    expect(required).not.toBe(defaultThreshold);
  });
  it('chooses the maximum when multiple labels are applied', () => {
    // GIVEN
    const prefix = 'review-required/';
    const min = 2;
    const max = 10;
    const pr: PullRequestReviewsAndLabels = {
      reviewDecision: 'REVIEW_REQUIRED',
      reviews: { nodes: [] },
      labels: {
        nodes: [
          { name: `${prefix}${min}` },
          { name: `${prefix}${max}` },
          { name: `${prefix}${min + 2}` },
        ],
      },
    };
    const defaultThreshold = -1000;
    // WHEN
    const required = requiredReviewThreshold(pr, prefix, defaultThreshold);
    // THEN
    expect(required).toBe(max);
  });
});
