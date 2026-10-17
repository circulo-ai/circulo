# Contributing to Circulo

Thanks for helping improve Circulo. This guide describes the expected
workflow for issues, changes, and releases.

## Before you start

- Check existing issues and pull requests before opening a duplicate.
- For larger changes, open an issue first to agree on scope and approach.
- Read the [Code of Conduct](CODE_OF_CONDUCT.md) and
  [Security Policy](SECURITY.md).
- Do not include credentials, customer data, or other sensitive information
  in issues, commits, fixtures, or logs.

## Set up the repository

Use Bun 1.3.4, Node.js 20 or newer, and Docker Compose. Follow the
[local development instructions](README.md#local-development) to configure
environment files, start PostgreSQL, Redis, and MinIO, and apply migrations.
Keep `bun.lock` in sync with dependency changes.

## Make a change

1. Create a focused branch from `master`, such as `feat/workflow-replay` or
   `fix/upload-validation`.
2. Keep each change small enough to review and update documentation when
   behavior, configuration, or public APIs change.
3. Use Conventional Commit style for commit messages, for example
   `fix(upload): reject expired upload tokens` or
   `docs: clarify desktop release steps`.
4. Add a Changeset when changing a publishable package under `packages/`:

   ```bash
   bunx changeset
   ```

   Select the affected package and the appropriate semver impact. Changesets
   are not needed for private applications or documentation-only changes.

## Verify your changes

Run the relevant checks from the repository root:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

For a focused change, run the corresponding workspace command, such as
`bun --filter web typecheck` or `bun --filter @circulo-ai/di test`. Include the
commands you ran and any known limitations in the pull request description.
Never claim a check passed if it was skipped or failed.

## Open a pull request

- Open the pull request against `master` and use a Conventional Commit title.
- Explain the user-visible behavior and why the change is needed.
- Link related issues and call out database, environment, or deployment
  changes.
- Include screenshots for visual changes and migration notes for breaking
  changes.
- Confirm the applicable CI checks pass and resolve review feedback.

The pull request template includes the review checklist. GitHub Actions runs
the repository checks; do not publish a package or desktop release manually.

## Releases

Changeset release pull requests are created by the version workflow and
published by GitHub Actions after they are merged. Desktop installers are
published by pushing a `desktop-v<version>` tag that matches
`apps/desktop/package.json`. See [the desktop guide](apps/desktop/README.md#installers-and-updates).
