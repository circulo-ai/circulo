# Package releases

Circulo uses [Changesets](https://github.com/changesets/changesets) to version
and publish public workspace packages.

## Add a changeset

For a change to a publishable package under `packages/`, run:

```bash
bunx changeset
```

Select each affected package and choose the semver impact: patch for compatible
fixes, minor for compatible features, and major for breaking changes. Review
the generated Markdown file in this directory and include it in the pull
request.

Changesets are not required for documentation-only work, private applications,
or private packages excluded by `.changeset/config.json`.

## Publish

After changesets reach `master`, the version workflow opens or updates a
release pull request with package version and changelog updates. Merge that
pull request to run the publish workflow. GitHub Actions builds, verifies, and
publishes public packages using npm trusted publishing; maintainers should not
publish package releases from a local machine.

Desktop releases use a separate tag-triggered workflow. See
[`apps/desktop/README.md`](../apps/desktop/README.md#installers-and-updates).
