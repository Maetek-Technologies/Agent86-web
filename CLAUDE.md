# CLAUDE.md

## Releasing

When bumping the version for a release (`packages/bridge/package.json`), also update the version shown on the project website: the "vX.Y.Z on npm" line in `site/index.html`. It is hardcoded, and merging the change to `main` redeploys the site through `.github/workflows/pages.yml`.
