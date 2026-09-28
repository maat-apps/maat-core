# App structure

The common layout and conventions every `maat-apps` app (Vite + React +
TypeScript) starts from — extracted from
[`routines`](https://github.com/maat-apps/routines), the reference
implementation. Link to this from an app's own `CLAUDE.md`/`AGENTS.md`
instead of re-documenting the generic pattern from scratch; keep that
file's own Architecture section for what's actually specific to that app
(its data model, its product behavior).

See [maat-apps/maat-core#5](https://github.com/maat-apps/maat-core/issues/5).

## Design principles

Every app in the ecosystem is guided by these; keep them in mind when
writing or reviewing code.

- **Minimalism.** Prefer the simplest solution; avoid unnecessary
  abstractions, UI complexity or dependencies.
- **Independence.** Avoid vendor/cloud lock-in — don't reach for a backend
  or third-party service where a local-first approach works.
- **Smallest possible runtime footprint.** Keep bundles and components
  lightweight to save battery and resources on the user's device — e.g.
  prefer true black (`#000000`) backgrounds, which save power on OLED
  screens. This is about the shipped app; the build/verify side of the
  same principle is [`VERIFICATION.md`](./VERIFICATION.md).
- **Ease of use.** Keep the app simple and predictable for the user.
- **Accessibility.** Semantic markup, keyboard/screen-reader support,
  sufficient contrast.

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
- Tailwind v4, with design tokens as CSS variables — **the same for every
  app**: true black + white on Outfit, shipped as `@maat-apps/ui/theme.css`
  and imported right after Tailwind. Apps don't redefine the tokens or pick
  another typeface or accent color; they only add genuinely app-specific
  styles on top.
- Always import through the aliases `components.json` declares (`utils`,
  `ui`, `components`, `lib`, `hooks`) rather than straight from an
  underlying package, so a future `npx shadcn add` or hand-adjustment
  doesn't quietly bypass the alias.
- Shared components from [`@maat-apps/ui`](./packages/ui) assume this same
  alias setup for your own code — the package itself ships an internal
  `cn` utility rather than depending on your `@/lib/utils` alias. See that
  package's own README for setup.

## i18n

- A small `useSyncExternalStore`-backed locale store, not a library —
  detects the device language on first launch, remembers the choice in
  `localStorage`, and exposes a `t(key, params?)` function doing
  `{placeholder}` substitution. No provider needed; the store is a
  module-level singleton.
- Message catalogs as flat JSON files (one per locale), kept in sync by
  hand — small enough per app that a library's tooling isn't worth the
  dependency.
- The store and hook come from `@maat-apps/core` (`/locale`, `/i18n`); the
  app keeps only its catalogs, locale list and storage key — see
  [its README](./packages/core/README.md).

## Conventions

- Filenames: kebab-case everywhere, including components — not
  PascalCase. Component names inside a file stay PascalCase
  (`routine-view.tsx` exports `RoutineView`).
- Named exports throughout; no framework here forces a default export.
- Hooks (`use*`) live in `src/hooks/`, not colocated in `src/lib/` —
  `lib/` must stay free of `react`/`react-dom` imports.
- Extract a component or function into its own file once either (a) it's
  used in more than two places — including within a single file — or (b)
  its containing file grows past ~200 lines, whichever comes first. Not a
  mechanical gate: some files earn their length (a view made of many
  short, cohesive JSX sections, a single-purpose `lib/` module); judge
  whether splitting actually improves readability.
- Validate anything crossing a trust boundary (backup imports, storage
  read-back) with [Valibot](https://valibot.dev/) schemas, not hand-rolled
  `typeof` checks — the ecosystem's standard validation library
  ([maat-apps/maat-core#2](https://github.com/maat-apps/maat-core/issues/2)).
  Infer types from the schemas (`v.InferOutput`), and validate
  array/record entries one by one rather than handing the whole collection
  to `v.array()`/`v.record()`, so one malformed entry doesn't sink an
  otherwise-valid whole.
- Avoid `as` assertions where TypeScript already infers the right type. A
  cast should mean "I know something the compiler can't": narrowing
  `unknown`/`any` at a trust boundary (`JSON.parse`, a loosely typed DOM or
  IndexedDB API, a partial test mock) or a shape TS can't know (a
  not-yet-typed API, a non-standard property like
  `navigator.standalone`). If removing a cast still type-checks, it was
  never doing anything.
- Persist data with the local-first storage pattern in
  [`docs/storage.md`](./docs/storage.md).

## Branch naming

Branches use a `<type>/<short-descriptive-slug>` pattern — the type
prefix matches Conventional Commits' type set (`feat`, `fix`, `docs`,
`style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`), and the
slug is a few kebab-case words describing what the branch actually adds
or changes (`feat/bottom-navigation`, `fix/vite-config-lint-error`,
`docs/branch-naming-convention`) — never a generic or session-scoped
name. One branch per PR/task; don't reuse a branch name across unrelated
changes once its PR has merged — cut a fresh one instead.

## Versioning

- **Apps don't bump their version.** Every app's `package.json` is
  `1.0.0` and stays there: an app ships by deploying `main`, nothing
  consumes its version, and per-PR bumps were only churn.
  `create-maat-app` generates `1.0.0`.
- **maat-core's published packages do** (`@maat-apps/ui`,
  `@maat-apps/core`, …): semver, bumped in the same PR as the change —
  apps depend on those numbers. See maat-core's `CLAUDE.md` for the
  release steps.

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
- Details and known traps: [`docs/testing-unit.md`](./docs/testing-unit.md)
  (coverage scope, `isolate: false`, fake IndexedDB, RTL cleanup) and
  [`docs/testing-e2e.md`](./docs/testing-e2e.md) (device projects, WebKit
  vs. CDP, axe and Lighthouse).

## Task tracking

- Work items are **GitHub Issues**, not local files. Anything ecosystem-wide
  or belonging to another repo is also added to the org-level
  [Ma'at Apps Roadmap](https://github.com/orgs/maat-apps/projects/1)
  Project, which only holds real Issues/PRs — so every repo with tasks
  needs Issues enabled (`gh repo edit <repo> --enable-issues`).
- Where an Issue goes: an app's own work (features, bugs — a bug is just
  the `bug` label) on that app's repo; ecosystem-wide work (shared config,
  UI library, CI/testing standards, scaffolding) on
  [`maat-apps/maat-core`](https://github.com/maat-apps/maat-core/issues).
- Priority is the Project's `Priority` field (`Now`/`Next`/`Later`), set
  and read with `gh project item-edit`/`item-list` — not a local file.
