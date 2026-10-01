# `@maat-apps/core`

Browser-platform plumbing shared by `maat-apps` apps — no UI (components
live in [`@maat-apps/ui`](../ui)). One package, one subpath per concern, so
an app's bundle only contains what it imports.

| Import                       | What                                              |
| ---------------------------- | ------------------------------------------------- |
| `@maat-apps/core/storage`    | IndexedDB key-value store                         |
| `@maat-apps/core/persisted`  | In-memory + IndexedDB store (e.g. settings)       |
| `@maat-apps/core/crypto`     | WebAuthn PRF → AES-GCM encryption, base64url      |
| `@maat-apps/core/lock`       | App lock: WebAuthn gate + optional encryption     |
| `@maat-apps/core/locale`     | Persisted locale store with device detection      |
| `@maat-apps/core/i18n`       | `useTranslation` hook (React)                     |
| `@maat-apps/core/sw`         | The app's service worker, as a factory            |
| `@maat-apps/core/update`     | "Update app" with a pre-update data snapshot      |
| `@maat-apps/core/install`    | `useInstallPrompt` hook for "Install app" (React) |
| `@maat-apps/core/validation` | Lenient per-entry Valibot parsing helpers         |
| `@maat-apps/core/backup`     | Backup envelope, backup files, share/download     |

`react` is an optional peer dependency, needed only for `/i18n` and
`/install`; `valibot` likewise, only for `/validation` and `/lock`.

## `storage`

```ts
import { createKeyValueStore } from "@maat-apps/core/storage";

const store = createKeyValueStore({ name: "my-app" });
await store.set("my-app-data", { items: [] });
const data = await store.get<{ items: string[] }>("my-app-data");
await store.delete("my-app-data");
```

- One database per app (`name`), one key-value object store, opened lazily
  and reused.
- `onCreate(objectStore)` runs only when the database is first created — use
  it to migrate data from an older storage layer. It may return a callback
  that runs once the database has opened (e.g. to clear what was migrated).
  New apps don't need it.
- The pattern apps build on top (an in-memory copy as the source of truth,
  this store as the write-through backing store) is in
  [`docs/storage.md`](../../docs/storage.md).

## `crypto`

```ts
import {
  deriveKey,
  encryptJson,
  decryptJson,
  isEncryptedBlob,
} from "@maat-apps/core/crypto";

const key = await deriveKey(prfOutput, salt, "my-app-data-v1");
const blob = await encryptJson(key, data);
const back = await decryptJson<typeof data>(key, blob);
```

- `deriveKey(prfOutput, salt, info)`: HKDF-SHA256 from a WebAuthn PRF secret
  to a non-extractable AES-GCM-256 key.
- **`info` is part of your stored data format. Never change it once an app
  has encrypted data**, or that data can't be decrypted any more. routines
  uses `"routines-data-v1"`.
- `encryptJson` uses a fresh random IV per call; `isEncryptedBlob` tells an
  encrypted value from plain data.
- `randomBytes`, `toBase64Url`, `fromBase64Url`: the helpers a WebAuthn
  enrol/verify ceremony needs (challenges, storing credential ids).

## `lock`

Every app ships the app lock. The logic lives here; the lock screen is
`@maat-apps/ui/app-lock-gate`.

```ts
// src/lib/encryption-key.ts — shared by the lock and every encrypting module
import { createKeyHolder } from "@maat-apps/core/lock";
export const encryptionKey = createKeyHolder();

// src/lib/app-lock.ts
import { createAppLock } from "@maat-apps/core/lock";
export const appLock = createAppLock({
  name: "My App", // shown by the platform prompt
  keyInfo: "my-app-data-v1", // HKDF info — NEVER change once data exists
  keyHolder: encryptionKey,
  saveEnrolment: setLockEnrolment, // into the app's settings
  data: {
    rewrite: () => replaceAllData(getRawData()), // re-save with the new key
    erase: async () => {
      replaceAllData(emptyData);
      await discardUpdateSnapshot();
    },
  },
});
```

- **Two modes**, decided at enrolment: with the PRF extension, an AES-GCM
  key is derived (`keyInfo` via `/crypto`'s `deriveKey`) and set on the
  key holder, and storage encrypts with it; without PRF the lock is a UI
  gate only, and the app's settings must say so.
- `enrol()` registers the credential and, with PRF, runs a second prompt
  right away to get the secret (PRF is only _requested_ at creation).
  `verify(enrolment)` passes the lock and derives the key in one prompt.
- `disable()` (unlocked, key in memory): data is rewritten unencrypted.
  `disableAndErase()` is the escape hatch when the authenticator is gone —
  the data can't be decrypted, so it's erased; the gate warns first.
- Persist the enrolment in the app's settings (`/persisted`), parsing it
  with `parseLockEnrolment` — anything corrupt reads as "no lock".
- Storage: encrypt on write when `encryptionKey.get()` is set; before the
  first read, if the stored enrolment has `encryptionSupported`, `await
encryptionKey.whenSet()`. `/update`'s `encryption: { getKey:
encryptionKey.get }` covers the snapshot.
- Session unlock state is memory only (`isSessionUnlocked`,
  `subscribeToUnlock`): closing the app locks it again.

## `locale` + `i18n`

```ts
// src/lib/locale-store.ts — React-free, usable from plain code too
import { createLocaleStore } from "@maat-apps/core/locale";
export const localeStore = createLocaleStore({
  locales: ["en", "pl"] as const,
  fallbackLocale: "en",
  storage: store, // from createKeyValueStore
  storageKey: "my-app-locale",
});

// src/i18n/use-translation.ts
import { createTranslation } from "@maat-apps/core/i18n";
import en from "./en.json";
import pl from "./pl.json";
export const useTranslation = createTranslation(localeStore, { en, pl });

// in a component
const { t, locale, setLocale } = useTranslation();
t("greeting", { name: "Ana" }); // "Hello, {name}!" → "Hello, Ana!"
```

- First launch: the locale whose code the device language starts with
  (`"pl-PL"` → `"pl"`), else `fallbackLocale`; that guess is persisted, and
  from then on the stored choice always wins.
- No provider: the store is a singleton read through
  `useSyncExternalStore`.
- `t()` only accepts keys present in _every_ catalog, so a key missing
  from one language fails to compile. Unknown `{placeholders}` are left
  as-is.

## `sw`

Each app keeps a tiny `src/sw.ts` entry, since vite-plugin-pwa's
`injectManifest` needs a file to compile and inject `self.__WB_MANIFEST`
into:

```ts
/// <reference lib="webworker" />
import { registerAppWorker } from "@maat-apps/core/sw";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
};

registerAppWorker(self, {
  cacheName: "my-app-v1", // bump whenever the app shell changes
  manifest: self.__WB_MANIFEST,
  baseUrl: import.meta.env.BASE_URL,
});
```

- Install precaches `baseUrl` plus every manifest entry. Activate deletes
  every cache not named `cacheName` and claims clients.
- Navigations and `manifest.json` go network-first, with the cached shell
  as the offline fallback. Everything else is cache-first (Vite's assets
  are content-hashed). Only successful `GET`s over http(s) are cached.
- A new worker **waits**: it takes over only when the page posts
  `SKIP_WAITING_MESSAGE` to it (e.g. from an "Update app" action), so an
  open tab never loses the chunks it already loaded.
- **Bump `cacheName` whenever the shell changes.** It's the only way old
  caches get cleaned up.

## `persisted`

```ts
import { createPersistedStore } from "@maat-apps/core/persisted";

export const settings = createPersistedStore({
  storage, // from createKeyValueStore
  key: "my-app-settings",
  defaults: { installed: false },
  parse: (stored) => parseSettings(stored), // validate; throwing keeps defaults
});

settings.getSnapshot(); // synchronous; the defaults until loaded
settings.set({ installed: true }); // merge, notify, persist in the background
```

The pattern from [`docs/storage.md`](../../docs/storage.md) as a store:
`getSnapshot`/`getServerSnapshot`/`subscribe` for `useSyncExternalStore`,
`set(patch)`, `reset()`, and a separate **ready** signal (`isReady`,
`subscribeReady`) for anything that must not treat "not loaded yet" as "the
defaults" — e.g. an app-lock gate.

## `update`

```ts
import { createUpdateSnapshot, updateApp } from "@maat-apps/core/update";

export const updateSnapshot = createUpdateSnapshot({
  storage,
  key: "my-app-update-snapshot",
  backup: { create: createBackup, parse: parseBackupValue, apply: applyBackup },
  encryption: { getKey: () => encryptionKey }, // only if the app encrypts
});

await updateApp(updateSnapshot); // Settings' "Update app"
```

- `updateApp` saves a snapshot, asks a waiting service worker to take over
  (`SKIP_WAITING_MESSAGE` from `/sw`), deletes every cache and reloads; a
  failing step never blocks the reload.
- The snapshot is the app's own backup format, plugged in through the
  `backup` adapter. `has`/`subscribe` drive a "Restore previous version" row;
  `restore`, `read` and `discard` do what they say.
- With `encryption`, the snapshot is stored encrypted like the rest of the
  app's data.

## `install`

```ts
import { createInstallPrompt } from "@maat-apps/core/install";

export const useInstallPrompt = createInstallPrompt({
  isInstalled: () => settings.getSnapshot().installed,
  subscribe: settings.subscribe,
  markInstalled: () => settings.set({ installed: true }),
});

const { state, install } = useInstallPrompt(); // "available" | "installed" | "unavailable"
```

Captures Chromium's `beforeinstallprompt` so a button can replay it, and
reports `installed` when running standalone (incl. iOS), after
`appinstalled`, or when the persisted flag says so — Chrome stops offering
the prompt once installed, so the flag is the only record a plain browser
tab has.

## `validation`

```ts
import {
  isRecord,
  parseEach,
  parseRecordEach,
} from "@maat-apps/core/validation";

parseEach(ItemSchema, stored.items); // valid entries only; non-array → []
parseRecordEach(ProgressSchema, stored.state); // per key; non-object → {}
```

Anything crossing a trust boundary (stored data read back, an imported
backup) is validated with Valibot, entry by entry: one malformed entry is
dropped instead of failing the whole array/record, which is what
`v.array()`/`v.record()` do. The schemas themselves stay in each app.

## `backup`

```ts
import {
  readBackupJson,
  readBackupEnvelope,
  downloadBackup,
  shareBackup,
  shareOrDownloadFile,
} from "@maat-apps/core/backup";

// Export: the app builds { app, version, exportedAt, data, ...its own }.
const result = await shareBackup(backup); // "shared" | "cancelled" | "unavailable"
if (result === "unavailable") downloadBackup(backup);

// Import: envelope checks here, the app parses `data` with its schemas.
const envelope = readBackupEnvelope(readBackupJson(text, messages), {
  app: "my-app",
  version: 1, // omit to accept any version
  messages, // { notJson, wrongApp, wrongVersion? } in the app's language
});
```

- Files are `<app>-backup-YYYY-MM-DD.txt` (local date), `text/plain`:
  Chromium's Web Share file allow-list excludes JSON.
- A dismissed share sheet is `"cancelled"` — a normal outcome, not a
  reason to fall back to a download.
- `shareFile`, `downloadFile` and `shareOrDownloadFile` work for any
  generated file (e.g. a chart image), not just backups.

## Testing

`npm test` (Vitest, Node environment): Node provides WebCrypto; IndexedDB
comes from `fake-indexeddb`.
