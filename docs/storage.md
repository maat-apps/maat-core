# Local-first storage pattern

How a `maat-apps` app persists its data: IndexedDB as a write-through
backing store behind a synchronous, in-memory source of truth. Documented
from [`routines`](https://github.com/maat-apps/routines)' `src/lib/`, the
reference implementation. The low-level pieces — the key-value store and
the PRF encryption — ship as
[`@maat-apps/core`](../packages/core) (`/storage`, `/crypto`); this page is
the pattern an app builds on top of them.

## The pattern

- **One database, one key-value object store**, behind a small promise
  wrapper around raw IndexedDB — `createKeyValueStore({ name })` from
  `@maat-apps/core/storage`, no other dependency.
- **Each storage module keeps its data in a module-level variable**, which
  is the _real_ source of truth once loaded. IndexedDB is read once, in the
  background, at startup, and written to in the background on every
  mutation (fire-and-forget, not awaited). So a module's public functions
  stay synchronous even though the storage engine underneath is async.
- **The React bridge lives in `src/hooks/`**: `useSyncExternalStore`-based
  hooks over those modules. `lib/` never imports `react`/`react-dom`.
- **Every storage key the app owns is declared in one module**
  (`storage-keys.ts`), so backup, reset and any migration stay in step.
- **Types are inferred from Valibot schemas** (`v.InferOutput`) rather than
  hand-written in parallel, so the type and the runtime validator can't
  drift. Anything read back from storage or imported from a backup crosses
  a trust boundary and goes through those schemas, entry by entry (see
  STRUCTURE.md's Conventions).
- **Call `navigator.storage.persist()` once, best-effort**, at app start —
  insurance against iOS Safari's Intelligent Tracking Prevention evicting
  script-writable storage after 7 days without interaction in a plain
  browser tab. It matters less once installed, but it's free.

## Consequences to design for

- **First load is async.** Until the background read resolves, screens see
  empty defaults, so the first render is empty and real data appears
  moments after mount. Wherever "not loaded yet" must not be treated as
  "empty", expose a separate ready signal and render nothing until it
  fires. Example: an app-lock gate that treated unloaded settings as "no
  lock enrolled" would flash a locked device's content on every cold start.
- **Writes can still be in flight when something else touches the
  database** — relevant mainly to tests (see
  [`testing-unit.md`](./testing-unit.md)); a real tab never deletes and
  recreates its own database while using it.

## Optional encryption (WebAuthn PRF)

Every app has the app lock (`@maat-apps/core/lock`), so every storage
module that persists user data reads its key from the app's shared key
holder (`createKeyHolder()`) and encrypts what it writes whenever a key is
set. The key is AES-GCM, derived with HKDF-SHA256 from a WebAuthn credential's
**PRF extension** output (`deriveKey` in `@maat-apps/core/crypto`), only
when the authenticator supports PRF; otherwise an app lock is a UI gate
only, and the UI must say so.

- **The HKDF `info` string is part of the stored data format.** Changing it
  makes every already-encrypted record unreadable. Each app picks its own
  (routines: `"routines-data-v1"`) and never changes it once data exists.
- PRF must be requested when the credential is created and can't be added
  later. `create()` only reports _whether_ PRF is available, never the
  secret, so enrolment needs a second, immediate assertion to obtain it.
- When encrypted data exists, a module's background load must wait for the
  key (`keyHolder.whenSet()`) before decrypting, instead of racing ahead as
  it does unencrypted.

## Testing seams

Each storage module exports a test-only `whenLoaded()` that resolves once
its background read finishes, so tests await readiness instead of
polling. Module-level state is reset with `vi.resetModules()` plus a
dynamic `import()` per test, not with exported reset hooks. See
[`testing-unit.md`](./testing-unit.md).
