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
- [`ui/`](./ui) — hand-built UI components extracted from `routines`
  (drawer, app bar, progress ring, and a few others). See its own README
  for what's there and what's deliberately not extracted yet.
