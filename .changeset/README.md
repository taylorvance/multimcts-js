# Changesets

This repo uses Changesets to track semver intent for published package changes.

Typical workflow:

1. Make the package change.
2. Run `npm run changeset`.
3. Commit the generated file in `.changeset/`.
4. When ready to publish, run `npm run version-packages` or `npm run release`.
