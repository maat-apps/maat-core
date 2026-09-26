# @maat-apps/create-maat-app

Scaffolds a new `maat-apps` repo (Vite + React + TypeScript + Tailwind v4 +
shadcn) matching [`routines`](https://github.com/maat-apps/routines)'
structure — see [maat-apps/maat-core#7](https://github.com/maat-apps/maat-core/issues/7).

## Usage

```sh
node packages/create-maat-app/bin/cli.mjs <app-name> [--desktop]
```

(Once published, `npx @maat-apps/create-maat-app <app-name>`.)

- `<app-name>` — directory name and `package.json` `name`, created in the
  current working directory.
- `--desktop` — scaffold without the mobile-only gate. Omit this for a
  mobile-only app (the default, matching routines): the generated app
  wraps its router in `src/components/mobile-gate.tsx`.

## What it generates

- The folder layout from [`STRUCTURE.md`](../../STRUCTURE.md): `src/app/`,
  `src/views/`, `src/components/`, `src/lib/`, `src/hooks/`, `src/i18n/`,
  `tests/unit/`, `e2e/`.
- A starter `CLAUDE.md`/`AGENTS.md` linking to `STRUCTURE.md` and
  [`VERIFICATION.md`](../../VERIFICATION.md) (both copied into the new repo
  too, as a point-in-time snapshot for offline reference).
- `configs/eslint`, `configs/typescript`, `configs/shadcn` copied from this
  repo's own `configs/` (plus `.prettierrc.json`, `eslint.config.mjs`,
  `tsconfig.*.json`, `components.json` wired to use them) — copy, not
  install, since there's no published `@maat-apps/*` config package yet
  (see `../../configs/README.md`).
- A `.claude/` tooling baseline: `/pr-description` and `/open-pr` commands
  (both close a matching GitHub Issue automatically), the
  `session-validate.sh` Stop hook (typecheck every turn, unit tests only
  when `src/`/`tests/` changed), and the `post-edit-format.mjs` PostToolUse
  hook — the two concrete pieces routines' own workflow proved useful
  enough to carry forward as-is.
- A minimal single-locale i18n store (`src/i18n/use-translation.ts` +
  `en.json`) following `STRUCTURE.md`'s pattern, and one starter view
  (`src/views/home/home-view.tsx`) wired into `src/app/router.tsx`.

## What it deliberately doesn't include

Routines-specific pieces that aren't part of the generic structure: the
service worker/PWA setup, IndexedDB-backed storage, `@dnd-kit`, and the
second `pl` locale catalog. Add these per-app once actually needed — see
`STRUCTURE.md`'s own scope note on what's generic vs. app-specific.

## Verifying a change to this generator

`node bin/cli.mjs <name>` into a scratch directory, then `npm install &&
npm run validate` inside the generated app — this package has no
automated test of its own yet beyond that manual round-trip.
