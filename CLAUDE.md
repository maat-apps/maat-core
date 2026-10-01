# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

maat-core is the shared layer of the Ma'at Apps ecosystem: ecosystem docs
(`STRUCTURE.md`, `VERIFICATION.md`, `docs/`), shared configs (`configs/`)
and the npm workspaces under `packages/`. See `README.md` for the map.

## Packages

| Package                             | What                                                     |
| ----------------------------------- | -------------------------------------------------------- |
| `packages/ui` → `@maat-apps/ui`     | Shared React components (shadcn `base-nova`)             |
| `packages/core` → `@maat-apps/core` | Non-UI plumbing: storage, crypto, lock, i18n, SW, update |
| `packages/create-maat-app`          | Scaffolding CLI for a new app                            |

Consumers: `maat-apps/routines` and `maat-apps/trainer`. A change here is
only half done until they use it — follow up with a PR in each app.

## Commands

- `npm run lint` / `lint:fix` — ESLint with this repo's own
  `configs/eslint/base.mjs`.
- `npm run format` / `format:check` — Prettier (`prettier.config.mjs`: the
  shared config minus Tailwind class sorting, which needs an app's
  stylesheet).
- `npm run typecheck` / `npm test` / `npm run build` — every workspace that
  defines them (`--workspaces --if-present`).

CI (`.github/workflows/ci.yml`) runs all of these on every PR. There are no
hooks in this repo, so after editing run `npm run lint:fix` and
`npm run format` yourself before committing — formatting slips otherwise
only surface as a CI failure.

## Releasing a package

1. In the same PR as the change, bump the package's `version` (semver;
   0.x minor for new exports) and run `npm install --package-lock-only` so
   the lockfile's workspace entry matches.
2. After the PR merges, run the publish workflow against `main`:
   `gh workflow run publish.yml -R maat-apps/maat-core --ref main -f package=<ui|core>`.
   It builds and **stages** the version (`npm stage publish`, npm Trusted
   Publishing via OIDC — no token).
3. **The owner approves it** (npmjs.com → Staged Packages, or
   `npm stage approve <stage-id>` with 2FA). That 2FA step is a deliberate
   per-release checkpoint and can't run in CI — ask the owner, then wait.
4. Check `npm view @maat-apps/<pkg> dist-tags`: `latest` goes to whichever
   version was approved last, so approving an older staged version after a
   newer one moves `latest` back (fix: `npm dist-tag add
@maat-apps/<pkg>@<version> latest`, owner's npm account).
5. Bump the dependency in routines/trainer in a follow-up PR per app.

A brand-new package can't be staged: its first version needs one manual
`npm publish -w <package> --access public` by the owner, then a Trusted
Publisher entry for `publish.yml` on npmjs.com.

## Workflow rules

- Never edit or commit on `main`. Branch `<type>/<slug>` with a
  Conventional Commits type (`STRUCTURE.md`'s Branch naming); commit
  messages and PR titles use the same `type(scope): summary` form.
- Commit when a task is done, push, open the PR with `gh pr create`.
- Merge your own PR (squash) once CI is green, respecting any required
  order (stacked PRs, a prerequisite not merged yet). This repo doesn't
  allow auto-merge, so merge by hand.
- Work items are GitHub Issues on this repo, tracked in the
  [Ma'at Apps Roadmap](https://github.com/orgs/maat-apps/projects/1)
  (`STRUCTURE.md`'s Task tracking).
- `core`'s non-React subpaths (`storage`, `crypto`, `lock`, `locale`,
  `persisted`, `update`, `sw`, `validation`, `backup`) must never import
  `react`; only `/i18n` and `/install`
  may (`react` is an optional peer).
- `core/crypto`'s `deriveKey` `info` argument is part of each app's stored
  data format — never change a value an app already uses (routines:
  `"routines-data-v1"`).
