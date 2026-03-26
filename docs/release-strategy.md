# Release Strategy

## Release automation

This repo uses Changesets for package release automation.

Relevant files:
- `.changeset/config.json`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`

Relevant scripts:
- `npm run changeset`
- `npm run version-packages`
- `npm run release`

Release authentication model:
- GitHub Actions OIDC trusted publishing
- no long-lived `NPM_TOKEN` secret required for publish

Workflow behavior:
- on `main`, verify the repo first
- if unreleased changesets exist, create and push a version commit directly to `main`
- then run `changeset publish` for any unpublished package versions in the repo

Changeset rule for this repo:
- add a Changeset when a change affects the published package
- do not add Changesets for docs-only, workflow-only, or internal tooling changes that do not affect the published package

## Trusted publishing setup

Use npm trusted publishing instead of a long-lived automation token.

Required npm-side configuration:
1. On npm, open the package settings for `multimcts`.
2. In the trusted publisher section, add a GitHub Actions trusted publisher.
3. Use these exact values:
   - GitHub owner: `taylorvance`
   - Repository: `multimcts-js`
   - Workflow file: `release.yml`
   - Environment: leave empty unless publishing later moves behind a protected GitHub environment
4. Save the trusted publisher.

Required GitHub-side configuration:
- none for npm credentials
- the workflow already requests `id-token: write`

Important implementation detail:
- npm trusted publishing currently requires Node `22.14.0+` and npm `11.5.1+`, which the release workflow installs explicitly

## Operational guidance

- Keep `.github/workflows/release.yml` present at that exact path.
- Make sure branch protection on `main` does not block the release workflow from pushing its version commit.
- If npm does not expose trusted publishing settings until after the first publish, do the first publish from a trusted local session, then add the trusted publisher so all later releases come from GitHub Actions.
