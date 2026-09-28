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
- A working PWA shell and manual force-update mechanism, every app's
  default rather than something bolted on later: `vite-plugin-pwa`
  (`injectManifest` strategy) + a hand-rolled `src/sw.ts` that deliberately
  never calls `skipWaiting()` on install, `public/manifest.json` +
  `public/icon.svg` (a brand-neutral placeholder — replace with the app's
  own mark), `src/lib/app-update.ts` (tells a waiting worker to take over,
  clears every cache, reloads), `src/hooks/use-install-prompt.ts` +
  `src/lib/app-settings.ts` (install-prompt handling, including the
  persisted "installed" flag Chrome needs), and a small `src/lib/
idb-store.ts` KV wrapper those two lean on. `home-view.tsx` wires up
  bare Install/Update buttons as a placeholder — move them into a real
  Settings screen once the app has one (see trainer's or routines' own
  `settings-app-section.tsx` for that pattern), and extend
  `app-update.ts` with a snapshot/restore step once the app has its own
  local data worth backing up before an update.

## What it deliberately doesn't include

Routines-specific pieces that aren't part of the generic structure: a
reactive, IndexedDB-backed app-data store (`storage.ts`'s
`getDataSnapshot()`/`subscribe()` pattern — routines' own version, and
trainer's, both build on the same `idb-store.ts` this scaffold already
ships), `@dnd-kit`, and the second `pl` locale catalog. Add these per-app
once actually needed — see `STRUCTURE.md`'s own scope note on what's
generic vs. app-specific. (PWA/service-worker support _used_ to be on this
list too — see `package-json.mjs`'s own comment for why that changed.)

## Verifying a change to this generator

`node bin/cli.mjs <name>` into a scratch directory, then `npm install &&
npm run validate` inside the generated app — this package has no
automated test of its own yet beyond that manual round-trip.
