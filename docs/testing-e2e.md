# E2E tests (Playwright), accessibility and Lighthouse

Conventions for a `maat-apps` app's browser tests, from
[`routines`](https://github.com/maat-apps/routines)' setup. STRUCTURE.md's
Testing section has the short version; this is the detail and the traps.

## Setup

- `e2e/*.spec.ts` + `playwright.config.ts`, with their own
  `tsconfig.e2e.json` project reference (neither the app nor the node
  tsconfig covers them).
- Runs against the **real production build**: `webServer` does
  `npm run build` + `vite preview`, not the dev server.
- **Two device projects, two engines, deliberately not a third**:
  `mobile-chromium` (e.g. `devices["Galaxy A55"]`) and `mobile-iphone`
  (`devices["iPhone 13"]`, real WebKit). A device preset only changes
  viewport/UA, never the engine, so another Android profile adds nothing.
  CI installs both `chromium` and `webkit`.
- `test:e2e` selects the device projects explicitly (`--project` twice)
  rather than running `playwright test` bare, so it never picks up the
  separate `lighthouse` project (below).
- Reusable helpers live in `e2e/utils.ts` (see STRUCTURE.md) — e.g.
  seeding storage via `page.addInitScript` to skip create/edit UI.

## Traps

- **Relative navigation with a base path**: with a `baseURL` ending in
  `/<app>/`, `page.goto("/new")` resolves to the _origin_ root. Always
  navigate without a leading slash: `page.goto("new")`, `page.goto("")`.
- **WebKit has no CDP session API.** A spec that needs raw CDP (e.g.
  `Input.dispatchTouchEvent` for touch-drag gestures, which Playwright has
  no native primitive for) is excluded from `mobile-iphone` via that
  project's `testIgnore` — remember to add the exclusion for every new
  spec that needs CDP.
- **WebAuthn**: use `context.credentials` (Playwright 1.61+,
  cross-browser) rather than a CDP virtual authenticator, so the spec runs
  on both projects.
- **Drawers react to touch, not mouse**: swipe-to-dismiss in e2e needs CDP
  touch events; synthetic mouse drags don't dismiss (see
  `@maat-apps/ui`'s README, `drawer.tsx`).

## Accessibility and Lighthouse — split by how they gate

- **`e2e/a11y.spec.ts`** (`@axe-core/playwright`): `AxeBuilder` against
  each screen and open drawer, scoped to
  `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`/`wcag22aa`, zero violations
  asserted. Cheap and deterministic, so it's a normal spec in
  `mobile-chromium` and runs with every `test:e2e`/CI run. Excluded from
  `mobile-iphone`: axe scans the DOM/ARIA tree, which doesn't differ by
  engine.
- **`e2e/lighthouse.spec.ts`** (`playwright-lighthouse` + `lighthouse`) is
  its own Playwright project, run only via `npm run test:lighthouse` / a
  `workflow_dispatch`-only workflow — Lighthouse's timing-based scoring is
  slow and flaky on shared runners, so it doesn't gate PRs.
  - It launches its own `chromium` with a fixed `--remote-debugging-port`
    instead of using the managed `page` fixture; `playAudit` drives Chrome
    over that CDP port.
  - `playwright-lighthouse` is unmaintained and its defaults still include
    the removed `pwa` category, which current `lighthouse` rejects. Always
    pass an explicit `thresholds` object covering only
    `performance`/`accessibility`/`best-practices`/`seo` (the package
    derives `onlyCategories` from its keys).
  - Set thresholds from a real baseline run; leave slack on
    `performance` (the flaky, timing-based one) and keep the others at the
    baseline.
