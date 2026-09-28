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
- [`VERIFICATION.md`](./VERIFICATION.md) — the "verify each change exactly
  once" principle: eliminating redundant lint/test/build runs across
  local and CI is a bigger win than optimizing any single run.
- [`docs/`](./docs) — the detail behind STRUCTURE.md's short rules:
  [`storage.md`](./docs/storage.md) (the local-first IndexedDB pattern,
  optional WebAuthn PRF encryption),
  [`testing-unit.md`](./docs/testing-unit.md) and
  [`testing-e2e.md`](./docs/testing-e2e.md) (Vitest/Playwright conventions
  and known traps).
- [`configs/`](./configs) — shared ESLint, Prettier, and base TypeScript
  config, extracted from `routines`. See its own README for how to use them.
- [`packages/ui`](./packages/ui) — the real, installable `@maat-apps/ui`
  package (drawer, app bar, progress ring, and a few others), extracted
  from `routines`. See its own README for what's there, the setup a
  consuming app needs, and what's deliberately not extracted.
- [`packages/create-maat-app`](./packages/create-maat-app) — a CLI that
  scaffolds a new `maat-apps` repo matching routines' structure
  (`STRUCTURE.md`, shared configs, the `.claude/` tooling baseline). See
  its own README for usage.

## Development

- `npm run lint` / `lint:fix` — ESLint, using this repo's own shared base
  (`configs/eslint/base.mjs`) so changes to it are exercised here first.
- `npm run format` / `format:check` — Prettier, with `configs/prettier`'s
  shared options (minus Tailwind class sorting, which needs an app's own
  stylesheet — see `prettier.config.mjs`).
- `npm run typecheck` / `build` — every workspace that defines them.

CI (`.github/workflows/ci.yml`) runs all four on every PR.

## Packages

`packages/*` is an npm workspaces monorepo publishing scoped
`@maat-apps/*` packages to the public npm registry — real, installable
alternatives to what's still copy-pasted from `configs/` today. Publishing
is CI-driven via
[`.github/workflows/publish.yml`](./.github/workflows/publish.yml)
(`workflow_dispatch`, one package per run), authenticated with npm Trusted
Publishing (OIDC) — no stored token. Each publish stages a version; a
maintainer with 2FA enabled promotes it live at npmjs.com (Access Tokens →
Staged Packages) — a deliberate per-release human checkpoint, not an
oversight. `packages/placeholder` proved the loop end-to-end (staged →
promoted → `npm install`d → resolved correctly). `packages/ui` is the
first real package built on that infrastructure — its very first version
still needs one manual `npm publish` from a maintainer before the
Trusted Publisher connection can even be registered (see its own README's
"Publishing" section); `configs/` moving into an installable package is
still todo.
