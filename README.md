# maat-core

Shared standards, configs, and tooling for the [Ma'at Apps](https://github.com/maat-apps)
ecosystem — [`routines`](https://github.com/maat-apps/routines) and whatever
else follows it.

This repo doesn't ship a runtime app itself. It's the place ecosystem-wide
decisions (shared config, UI components, conventions) live once they're worth
extracting out of a single app repo — tracked as
[Issues](https://github.com/maat-apps/maat-core/issues) even before the code
behind them exists here.

## What's here

- [`configs/`](./configs) — shared ESLint, Prettier, and base TypeScript
  config, extracted from `routines`. See its own README for how to use them.

## Packages

`packages/*` is an npm workspaces monorepo publishing scoped
`@maat-apps/*` packages to the public npm registry — the eventual home
for real, installable versions of what's copy-pasted from `configs/`/`ui/`
today. See [`.github/workflows/publish.yml`](./.github/workflows/publish.yml)
(manual `workflow_dispatch`, one package per run) and
[maat-apps/maat-core#18](https://github.com/maat-apps/maat-core/issues/18)
for the full plan.

**Not yet usable**: publishing needs the `@maat-apps` npm scope claimed and
an `NPM_TOKEN` repo secret first — see
[maat-apps/maat-core#22](https://github.com/maat-apps/maat-core/issues/22).
`packages/placeholder` exists only to prove the publish/consume loop once
that's done, before any real content depends on it.
