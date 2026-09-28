# `@maat-apps/core`

Browser-platform plumbing shared by `maat-apps` apps — no React, no UI
(components live in [`@maat-apps/ui`](../ui)). One package, one subpath per
concern, so an app's bundle only contains what it imports.

| Import                    | What                                          |
| ------------------------- | --------------------------------------------- |
| `@maat-apps/core/storage` | IndexedDB key-value store                     |
| `@maat-apps/core/crypto`  | WebAuthn PRF → AES-GCM encryption, base64url  |
| `@maat-apps/core/locale`  | Persisted locale store with device detection  |
| `@maat-apps/core/i18n`    | `useTranslation` hook (the only React import) |

Planned: `/sw` (#45), later `/lock`, `/update` (#46). `react` is an
optional peer dependency, needed only for `/i18n`.

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

## Testing

`npm test` (Vitest, Node environment): Node provides WebCrypto; IndexedDB
comes from `fake-indexeddb`.
