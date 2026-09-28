import type { KeyValueStore } from "./storage";

// The React-free half of i18n: a module-level-singleton-style store for the
// current locale, readable from plain code (e.g. a backup import) as well as
// from the `useTranslation` hook in `@maat-apps/core/i18n`.

export type LocaleStore<L extends string> = {
  /** The current locale; starts as the device-language guess. */
  getSnapshot(): L;
  /** For `useSyncExternalStore`'s server snapshot: always the fallback. */
  getServerSnapshot(): L;
  subscribe(listener: () => void): () => void;
  setLocale(locale: L): void;
  isLocale(value: unknown): value is L;
  /** Resolves once the stored choice has been read. Mainly for tests. */
  whenLoaded(): Promise<void>;
};

export type LocaleStoreOptions<L extends string> = {
  /** Every supported locale, e.g. `["en", "pl"]`. */
  locales: readonly L[];
  /** Used when the device language matches none of `locales`, and on the server. */
  fallbackLocale: L;
  /** Where the user's choice is persisted. */
  storage: KeyValueStore;
  /** The key it's persisted under, e.g. `"my-app-locale"`. */
  storageKey: string;
};

/**
 * First launch only: pick the supported locale the device language starts
 * with (`"pl-PL"` → `"pl"`), else the fallback.
 */
export function detectLocale<L extends string>(
  locales: readonly L[],
  fallbackLocale: L,
  language: string | undefined,
): L {
  const normalized = (language ?? "").toLowerCase();
  return (
    locales.find((locale) => normalized.startsWith(locale.toLowerCase())) ??
    fallbackLocale
  );
}

/**
 * The snapshot starts as the instant, synchronous device-language guess, so
 * there's no loading gap; the stored choice (read once, in the background)
 * corrects it if it differs. On the very first run the guess is persisted,
 * so from then on a stored value always wins over detection.
 */
export function createLocaleStore<L extends string>({
  locales,
  fallbackLocale,
  storage,
  storageKey,
}: LocaleStoreOptions<L>): LocaleStore<L> {
  const listeners = new Set<() => void>();
  let snapshot: L | null = null;
  let loaded: Promise<void> | null = null;

  function isLocale(value: unknown): value is L {
    return (locales as readonly unknown[]).includes(value);
  }

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function ensureLoaded(): void {
    if (loaded || typeof window === "undefined") return;
    const guess = detectLocale(
      locales,
      fallbackLocale,
      window.navigator?.language,
    );
    snapshot ??= guess;

    loaded = storage
      .get<unknown>(storageKey)
      .then((stored) => {
        if (isLocale(stored)) {
          if (stored !== snapshot) {
            snapshot = stored;
            notify();
          }
        } else if (snapshot) {
          void storage.set(storageKey, snapshot);
        }
      })
      .catch(() => {
        // Keep the guess.
      });
  }

  return {
    getSnapshot() {
      ensureLoaded();
      return snapshot ?? fallbackLocale;
    },
    getServerSnapshot() {
      return fallbackLocale;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setLocale(next) {
      snapshot = next;
      void storage.set(storageKey, next);
      notify();
    },
    isLocale,
    whenLoaded() {
      ensureLoaded();
      return loaded ?? Promise.resolve();
    },
  };
}
