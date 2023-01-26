# Contributing

Contributions are welcome to this project! For awareness, this Action is bootstrapped via
[Projen](https://github.com/projen/projen) using
[`projen-github-action-typescript`](https://github.com/projen/projen-github-action-typescript).
Changes to `action.yml` or most other top-level files within the repository should be made in
`.projenrc.ts`.

## Getting Started

After cloning the project, it will be helpful to install the project dependencies. We use
the Yarn package manager.

```bash
yarn install
```

## Making Changes

If your changes are to source files, they can be made directly to the contents of the files
in `src/`. Please make your changes so that they can be tested and add necessary test cases
in the `test/` directory.

To modify files in other locations, first see if they can be modified in the `.projenrc.ts`
file. For example, changes to GitHub workflows, the `package.json`, or `action.yml` must be
made via the `.projenrc.ts`.

After you have completed making your changes, build the project:

```bash
yarn build
```

You can then commit your changes. Be sure to check in changes to the `dist/` folder! Failing
to do so will result in failures during the automated CI pipeline checks.

## Pull Requests & Review

After you have pushed your changes, open a pull request on GitHub. This will kick off the
automated tests. A maintainer will review your contribution and may provide feedback. As
part of this process, they may approve and merge your pull request or they may request
that changes be made.

If you have not already accepted the CLA, a bot on the pull request will ask that you
sign it. Please review and properly select whether your contribution is as an individual or
on behalf of an employer.

## Security Reports

If your contribution resolves a security vulnerability, please follow our process for
[disclosing security issues](https://github.com/EasyDynamics/.github/blob/main/SECURITY.md)
prior to discussing it in a pull request.
