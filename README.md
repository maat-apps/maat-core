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

- [`STRUCTURE.md`](./STRUCTURE.md) — the common app layout/conventions
  every `maat-apps` app starts from (folder structure, routing, i18n,
  testing) — link to it from an app's own `CLAUDE.md` instead of
  re-documenting the generic pattern there.
- [`configs/`](./configs) — shared ESLint, Prettier, and base TypeScript
  config, extracted from `routines`. See its own README for how to use them.
- [`ui/`](./ui) — hand-built UI components extracted from `routines`
  (drawer, app bar, progress ring, and a few others). See its own README
  for what's there and what's deliberately not extracted yet.

## Packages

`packages/*` is an npm workspaces monorepo publishing scoped
`@maat-apps/*` packages to the public npm registry — the eventual home
for real, installable versions of what's copy-pasted from `configs/`/`ui/`
today. Publishing is CI-driven via
[`.github/workflows/publish.yml`](./.github/workflows/publish.yml)
(`workflow_dispatch`, one package per run), authenticated with npm Trusted
Publishing (OIDC) — no stored token. Each publish stages a version; a
maintainer with 2FA enabled promotes it live at npmjs.com (Access Tokens →
Staged Packages) — a deliberate per-release human checkpoint, not an
oversight. `packages/placeholder` proved the loop end-to-end (staged →
promoted → `npm install`d → resolved correctly); real content moving from
`configs/`/`ui/` into actual published packages is still todo.
