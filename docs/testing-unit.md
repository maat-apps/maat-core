# Unit tests (Vitest)

Conventions for a `maat-apps` app's unit suite, from
[`routines`](https://github.com/maat-apps/routines)' setup. STRUCTURE.md's
Testing section has the short version; this is the detail and the traps.

## Layout and scope

- Tests live under `tests/unit/`, mirroring `src/`
  (`tests/unit/lib/storage.test.ts` for `src/lib/storage.ts`).
  `vitest.config.ts`'s `test.include` is scoped to
  `tests/unit/**/*.test.ts` explicitly, so a stray test file elsewhere is
  never picked up.
- `vitest.config.ts` is separate from `vite.config.ts`, so PWA/build
  plugins never run during tests. Environment: `jsdom`.
- `coverage.include` is `src/lib/**`, `src/hooks/**` and `src/i18n/**`:
  pure logic plus the `useSyncExternalStore` store/hook bridge, exercised
  with `@testing-library/react`'s `renderHook` (no JSX needed).
  Views/components are e2e's job; including them would only show a
  permanently low number.
- The threshold is **95%** (lines/statements/functions/branches), not 100%
  even when the suite clears 100% — a literal 100% gate has no slack for a
  new line landing without a test in the same change.

## Patterns

- **Module-level singletons** (storage modules, locale store) are reset
  with `vi.resetModules()` plus a dynamic `import()` per test, not with
  reset functions exported just for tests.
- **Missing browser globals are not a reason to skip coverage.**
  `navigator.serviceWorker`, `caches`, `URL.createObjectURL`, `matchMedia`
  and the like get stubbed with `vi.stubGlobal`/`vi.spyOn`. Only skip a gap
  after weighing it against a specific reason.
- **SSR guards are testable too**: a per-file
  `// @vitest-environment node` docblock exercises
  `typeof window === "undefined"` branches for real.
- **IndexedDB**: jsdom has none, so `tests/unit/setup.ts` (wired via
  `test.setupFiles`) installs `fake-indexeddb/auto` globally. Tests that
  touch storage delete the app's database in `beforeEach`
  (`tests/unit/reset-indexeddb.ts`'s `resetIndexedDb()`, next to
  `localStorage.clear()`), and await each module's `whenLoaded()` (see
  [`storage.md`](./storage.md)). Because storage writes are
  fire-and-forget, `setup.ts`'s global `afterEach` also waits a short
  macrotask delay so a test's last writes settle before the next test
  deletes the database.

## `isolate: false` and its traps

`isolate: false` reuses one jsdom environment across every test file
instead of creating one per file (jsdom setup was ~85% of routines' CI
test time). The cost: `window`, `document`, `Storage.prototype` and the
fake IndexedDB are the **same objects for the whole run**.

- **Restore everything you mutate in your own `afterEach`**:
  `vi.unstubAllGlobals()` for `vi.stubGlobal`, `vi.restoreAllMocks()` for
  `vi.spyOn`. The two aren't interchangeable. A missed restore fails a
  _different_, unrelated test, not the one that leaked it.
- **Call `@testing-library/react`'s `cleanup()` explicitly** in
  `setup.ts`'s global `afterEach`. RTL only auto-registers its cleanup when
  it finds a _global_ `afterEach`, which never happens without
  `test.globals: true` (files import `afterEach` from `"vitest"`). Without
  it, `renderHook()` components are never unmounted, their `window` event
  listeners outlive the test, and a later `dispatchEvent` wakes a stale
  hook whose IndexedDB connection is already closed — showing up as
  unhandled `InvalidStateError` rejections attributed to an unrelated test
  (routines#82).
- **Don't mask unhandled errors** with `dangerouslyIgnoreUnhandledErrors`;
  a stray rejection under `isolate: false` means something leaked, and the
  fix belongs at the leak.
