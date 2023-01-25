# PR Review Threshold Action

This is a GitHub Action that ensures that pull request has met a requisite review threshold
before it can be merged. This allows for having specific pull requests that need more review
while keeping the base review threshold for a repository lower.

This works by applying a label to each pull request that needs futher review.

## Using this Action

This Action is useless unless it is a required status check for branch protection rules.
Otherwise, its failing status can be ignored.

```yaml
- name: Enforce additional reviews
  uses: easydynamics/cloud-pr-review-threshold-action@main
  with:
    # You can use any token as long as it has pull-requests: read, issues: read.
    token: ${{ secrets.GITHUB_TOKEN }}
    # The number of reviewers to require should immediately follow this as an integer value
    # in the label name. For example `required-reviews/1` or `required-reviews/3`.
    review-label-prefix: "required-reviews/"
    # The number of reviewers to require on a pull request by default (if no matching labels
    # are found).
    default-required-reviewers: 1
```

This Action will succeed if the review threshold is met or fail if it is not.
