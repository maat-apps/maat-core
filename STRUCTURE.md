# App structure

The common layout and conventions every `maat-apps` app (Vite + React +
TypeScript) starts from — extracted from
[`routines`](https://github.com/maat-apps/routines), the reference
implementation. Link to this from an app's own `CLAUDE.md`/`AGENTS.md`
instead of re-documenting the generic pattern from scratch; keep that
file's own Architecture section for what's actually specific to that app
(its data model, its product behavior).

See [maat-apps/maat-core#5](https://github.com/maat-apps/maat-core/issues/5).

## Folder layout

```
src/
  app/          # router, top-level app shell, global CSS
  views/        # one folder per screen — src/views/<name>/
  components/   # shared UI (2+ views, gates, ui/ primitives)
  lib/          # framework-free logic — no react/react-dom imports
  hooks/        # React hooks (use*) — never in lib/
  i18n/         # translation store + message catalogs
tests/unit/     # Vitest, mirrors src/'s structure
e2e/            # Playwright specs + e2e/utils.ts
```

## Routing pattern

- One folder per screen under `src/views/<name>/`; `src/app/router.tsx`
  maps them to routes with React Router, each view `lazy()`-loaded as its
  own chunk.
- Views read the target id from a `:id` path param via `useParams`.
  Drilling deeper (list → detail → edit) is a plain forward `navigate(...)`.
- Returning uses a `useSmartBack(fallback)` hook: every route is also a
  valid deep link (hard refresh, PWA relaunch, a bookmark), so a "Back"
  action can't assume a real history entry sits behind it. The hook pops
  real history when the current location was actually pushed (React
  Router's `location.key !== "default"`) and replaces to `fallback`
  otherwise — so repeated visit/return round trips don't grow the stack,
  and native back keeps landing where a header's back arrow would.
- A component used by 2+ views lives in `src/components/`, not a view
  folder.

## UI stack

- [shadcn](https://ui.shadcn.com/) generated primitives in
  `src/components/ui/` — generated, not hand-edited (see
  [`configs/shadcn`](./configs/shadcn) for the config choice and any
  post-generation patches to re-apply).
- Tailwind, with design tokens as CSS variables — colors and other brand
  decisions are per-app, not part of this shared structure.
- Always import through the aliases `components.json` declares (`utils`,
  `ui`, `components`, `lib`, `hooks`) rather than straight from an
  underlying package, so a future `npx shadcn add` or hand-adjustment
  doesn't quietly bypass the alias.
- Shared components pulled from [`ui/`](./ui) in this repo assume this
  same alias setup — see that directory's own README.

## i18n

- A small `useSyncExternalStore`-backed locale store, not a library —
  detects the device language on first launch, remembers the choice in
  `localStorage`, and exposes a `t(key, params?)` function doing
  `{placeholder}` substitution. No provider needed; the store is a
  module-level singleton.
- Message catalogs as flat JSON files (one per locale), kept in sync by
  hand — small enough per app that a library's tooling isn't worth the
  dependency.

## Conventions

- Filenames: kebab-case everywhere, including components — not
  PascalCase. Component names inside a file stay PascalCase
  (`routine-view.tsx` exports `RoutineView`).
- Named exports throughout; no framework here forces a default export.
- Hooks (`use*`) live in `src/hooks/`, not colocated in `src/lib/` —
  `lib/` must stay free of `react`/`react-dom` imports.
- Extract a component or function into its own file once either (a) it's
  used in more than two places, or (b) its containing file grows past
  ~200 lines — whichever comes first, and not a mechanical gate: some
  files earn their length; judge whether splitting actually improves
  readability.

## Testing

- **Unit (Vitest)**: `tests/unit/`, mirroring `src/`'s structure rather
  than co-located with the source. Scoped to `src/lib/`, `src/hooks/`,
  `src/i18n/` — pure logic and the hook/store bridge; views/components are
  e2e's job, not unit's.
- **E2E (Playwright)**: `e2e/*.spec.ts`, with reusable helpers in
  `e2e/utils.ts` — a cross-project convention, not `fixtures.ts`, since
  these are plain functions specs call directly, not Playwright's own
  `test.extend()` fixture-injection system. Runs against the real
  production build, not the dev server.
- Both split by what they actually exercise, not by mechanical coverage
  targets.
