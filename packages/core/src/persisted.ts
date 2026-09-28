import type { KeyValueStore } from "./storage";

// The storage pattern from maat-core/docs/storage.md as a reusable store: an
// in-memory value is the source of truth once loaded; the key-value store is
// read once in the background and written to (fire-and-forget) on change.
// Shaped for useSyncExternalStore, with a separate "ready" signal for callers
// that must not treat "not loaded yet" as "defaults" (e.g. an app-lock gate).

export type PersistedStore<T> = {
  getSnapshot(): T;
  /** For useSyncExternalStore's server snapshot: always the defaults. */
  getServerSnapshot(): T;
  subscribe(listener: () => void): () => void;
  /** Merges `patch` into the value, then persists it. */
  set(patch: Partial<T>): void;
  /** Whether the initial background read has finished. */
  isReady(): boolean;
  subscribeReady(listener: () => void): () => void;
  /** Deletes the stored value and returns to the defaults. */
  reset(): Promise<void>;
  /** Resolves once the initial background read has finished. Mainly for tests. */
  whenLoaded(): Promise<void>;
};

export type PersistedStoreOptions<T> = {
  storage: KeyValueStore;
  key: string;
  defaults: T;
  /**
   * Turns a stored value (never null/undefined) into `T`. Validate here —
   * stored data is a trust boundary. Throwing keeps the defaults.
   */
  parse: (stored: unknown) => T;
};

export function createPersistedStore<T extends object>({
  storage,
  key,
  defaults,
  parse,
}: PersistedStoreOptions<T>): PersistedStore<T> {
  const listeners = new Set<() => void>();
  const readyListeners = new Set<() => void>();
  let snapshot = defaults;
  let ready = false;
  let loaded: Promise<void> | null = null;

  function notify(set: Set<() => void>): void {
    for (const listener of set) {
      listener();
    }
  }

  function ensureLoaded(): void {
    if (loaded || typeof window === "undefined") return;
    loaded = storage
      .get<unknown>(key)
      .then((stored) => {
        if (stored != null) snapshot = parse(stored);
      })
      .catch(() => {
        // Keep the defaults — same as a missing value.
      })
      .finally(() => {
        ready = true;
        notify(readyListeners);
        notify(listeners);
      });
  }

  function subscribeTo(set: Set<() => void>) {
    return (listener: () => void) => {
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    };
  }

  return {
    getSnapshot() {
      ensureLoaded();
      return snapshot;
    },
    getServerSnapshot() {
      return defaults;
    },
    subscribe: subscribeTo(listeners),
    set(patch) {
      ensureLoaded();
      snapshot = { ...snapshot, ...patch };
      void storage.set(key, snapshot).catch(() => undefined);
      notify(listeners);
    },
    isReady() {
      ensureLoaded();
      return ready;
    },
    subscribeReady: subscribeTo(readyListeners),
    async reset() {
      await storage.delete(key);
      snapshot = defaults;
      notify(listeners);
    },
    whenLoaded() {
      ensureLoaded();
      return loaded ?? Promise.resolve();
    },
  };
}
