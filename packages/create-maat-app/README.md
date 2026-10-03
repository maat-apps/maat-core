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
  wraps its router in `@maat-apps/ui`'s `MobileGate` (`src/app/root.tsx`).

## What it generates

- The folder layout from [`STRUCTURE.md`](../../STRUCTURE.md): `src/app/`,
  `src/views/`, `src/components/`, `src/lib/`, `src/hooks/`, `src/i18n/`,
  `tests/unit/`, `e2e/`.
- A starter `CLAUDE.md`/`AGENTS.md` and `README.md` linking to
  maat-core's `STRUCTURE.md` and [`VERIFICATION.md`](../../VERIFICATION.md)
  — linked, not copied, so the new repo never carries a stale snapshot.
- `eslint.config.mjs`, `prettier.config.mjs` and `tsconfig.*.json` that
  use [`@maat-apps/config`](../config) (a devDependency, so the lint and
  format plugins come with it), and `configs/shadcn` plus `components.json`
  copied from this repo's own `configs/`.
- A `.claude/` tooling baseline: the ecosystem's Claude Code standard from
  [`configs/claude`](../../configs/claude) — `/open-pr` and
  `/pr-description` (close a matching Issue, merge once CI is green) and
  the Clean Code skills — plus the template's own hooks: the
  `session-validate.sh` Stop hook (typecheck every turn, unit tests only
  when `src/`/`tests/` changed) and the `post-edit-format.mjs` PostToolUse
  hook.
- **Built on the shared packages, not copies**: `@maat-apps/ui` for
  components and the theme (`src/app/globals.css` imports
  `@maat-apps/ui/theme.css` — true black + white on Outfit), and
  `@maat-apps/core` for the plumbing, through thin per-app wrappers:
  `src/lib/idb-store.ts` (`/storage`, a database named after the app),
  `app-settings.ts` (`/persisted`), `locale-store.ts` +
  `src/i18n/use-translation.ts` (`/locale` + `/i18n`, `en.json`),
  `app-update.ts` (`/update`), `src/hooks/use-install-prompt.ts`
  (`/install`) and `src/sw.ts` (`/sw`) — the same shape routines and
  trainer use.
- **The app lock**, every app's default: `src/lib/app-lock.ts`
  (`/lock`, HKDF info `<app-name>-data-v1`), `encryption-key.ts`,
  `src/components/app-lock-gate.tsx` (ui's `AppLockGate` around the
  router) and a lock switch on the starter view. Its `data` adapter is
  empty until the app keeps data — then wire it to storage like routines
  and trainer do.
- A working PWA shell and manual force-update mechanism, every app's
  default: `vite-plugin-pwa` (`injectManifest`) with that `src/sw.ts`,
  `public/manifest.json` + `public/icon.svg` (a brand-neutral placeholder —
  replace with the app's own mark), and one starter view
  (`src/views/home/home-view.tsx`, wired into `src/app/router.tsx`) with
  bare Install/Update buttons. Move those into a real Settings screen
  later, and give `app-update.ts` a pre-update snapshot
  (`createUpdateSnapshot`) once the app has data worth backing up.
- CI/CD: `.github/workflows/` callers of maat-core's reusable workflows
  (from [`configs/workflows`](../../configs/workflows)).
- Version `1.0.0`, which the app keeps (STRUCTURE.md's Versioning).

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
