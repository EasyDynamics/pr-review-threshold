# PR Review Threshold Action

This is a GitHub Action that ensures that pull request has met a requisite review threshold
before it can be merged. This allows for having specific pull requests that need more review
while keeping the base review threshold for a repository lower.

The action will review all labels assigned to a pull request, find those that match the
given pattern, and then choose the label that applies the **highest** review threshold.
Any label, even if lower than `default-required-reviewers` will set the threshold to that
level (though, GitHub branch protection policies are still in effect and are not impacted
by this action).

## Using this Action

This Action is useless unless it is a required status check for branch protection rules.
Otherwise, its failing status can be ignored.

```yaml
- name: Enforce additional reviews
  uses: easydynamics/cloud-pr-review-threshold-action@main
  with:
    # You can use any token as long as it has `pull-requests: read`.
    token: ${{ secrets.GITHUB_TOKEN }}
    # The number of reviewers to require should immediately follow this as an integer value
    # in the label name. For example `required-reviews/1` or `required-reviews/3`.
    # This can be any non-empty string but it purely functions as a prefix and is not
    # matched as a pattern.
    review-label-prefix: "required-reviews/"
    # The number of reviewers to require on a pull request by default (if no matching labels
    # are found). If set to `0`, this effectively delegates entirely to the GitHub branch
    # protection review requirement.
    default-required-reviewers: 1
```

This Action will pass whenever the required number of approvals have been met and fails if
that requirement has not (or if there is an error).

## Known Limitations

- Currently, this action only evaluates the 20 most recent reviews on the pull request. This
  effectively places an upper bound on the number of possible required reviews; additionally,
  it means that if all approvals happened more than 20 review actions ago, this action will
  fail to pass (possibly as a false negative). If this limitation impacts your use case, it
  can be fixed by bumping the number in the GraphQL query or implementing pagination.
- Currently, this action only evaluates the "first" 20 labels assigned to pull request. If
  the necessary review labels are not in that "first" 20 list then the rules may not be
  evaluated properly. Ideally, pull requests are not labeled with more than 20 labels at a
  time. If this does conflict with your use case, it can be mitigated by increasing the limit
  in the GraphQL query or implementing pagination.

Pull requests to address any known limitations are welcome! Please open an issue to discuss
the implementation and your specific use case before beginning work.

## Contributing

This project welcomes contributions! Please review the
[contributing documentation](/CONTRIBUTING.md) and [code of conduct](/CODE_OF_CONDUCT.md).
Additionally, contributions to this project must be made available under the terms of
the [license](/LICENSE) and after signing the project CLA.
