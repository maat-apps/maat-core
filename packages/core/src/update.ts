import { decryptJson, encryptJson, isEncryptedBlob } from "./crypto";
import type { KeyValueStore } from "./storage";
import { SKIP_WAITING_MESSAGE } from "./sw";

// "Update app": take a snapshot of the app's data, drop every cache, let a
// waiting service worker take over, reload. Updating can't lose data on its
// own (IndexedDB outlives a worker swap); the snapshot is cheap insurance
// against the update going wrong, and a one-tap way back. The app plugs in
// its own backup format through `BackupAdapter`.

export type BackupAdapter<B> = {
  /** A backup of the app's current data. */
  create(): B;
  /** Validates a stored value back into a backup; throws when it isn't one. */
  parse(value: unknown): B;
  /** Replaces the app's data with the backup's. */
  apply(backup: B): void;
};

export type UpdateSnapshot<B> = {
  /** Cheap existence check — doesn't read (or decrypt) the snapshot. */
  has(): boolean;
  /** For useSyncExternalStore's server snapshot. */
  hasOnServer(): boolean;
  subscribe(listener: () => void): () => void;
  /** Stores a snapshot of the current data; null if that failed. */
  save(): Promise<B | null>;
  /** The stored snapshot, or null if there's none or it's unreadable. */
  read(): Promise<B | null>;
  /** Applies the stored snapshot; false if there was none to apply. */
  restore(): Promise<boolean>;
  discard(): Promise<void>;
  /** Resolves once the initial existence check has finished. Mainly for tests. */
  whenLoaded(): Promise<void>;
};

export type UpdateSnapshotOptions<B> = {
  storage: KeyValueStore;
  /** The key the snapshot is stored under, e.g. `"my-app-update-snapshot"`. */
  key: string;
  backup: BackupAdapter<B>;
  /**
   * When the app encrypts its data, the snapshot must be encrypted too.
   * `getKey` returns the current key, or null while there's none.
   */
  encryption?: { getKey(): CryptoKey | null };
};

export function createUpdateSnapshot<B>({
  storage,
  key,
  backup,
  encryption,
}: UpdateSnapshotOptions<B>): UpdateSnapshot<B> {
  const listeners = new Set<() => void>();
  let exists = false;
  let loaded: Promise<void> | null = null;

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function ensureLoaded(): void {
    if (loaded || typeof window === "undefined") return;
    loaded = storage
      .get<unknown>(key)
      .then((stored) => {
        exists = stored != null;
      })
      .catch(() => {
        // Keep "no snapshot".
      })
      .finally(notify);
  }

  async function read(): Promise<B | null> {
    try {
      const stored = await storage.get<unknown>(key);
      if (!stored) return null;
      const encryptionKey = encryption?.getKey() ?? null;
      const raw =
        encryptionKey && isEncryptedBlob(stored)
          ? await decryptJson<unknown>(encryptionKey, stored)
          : stored;
      return backup.parse(raw);
    } catch {
      return null;
    }
  }

  return {
    has() {
      ensureLoaded();
      return exists;
    },
    hasOnServer() {
      return false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async save() {
      try {
        const data = backup.create();
        const encryptionKey = encryption?.getKey() ?? null;
        await storage.set(
          key,
          encryptionKey ? await encryptJson(encryptionKey, data) : data,
        );
        exists = true;
        notify();
        return data;
      } catch {
        return null;
      }
    },
    read,
    async restore() {
      const snapshot = await read();
      if (!snapshot) return false;
      backup.apply(snapshot);
      return true;
    },
    async discard() {
      try {
        await storage.delete(key);
        exists = false;
        notify();
      } catch {
        // The snapshot is only ever a convenience.
      }
    },
    whenLoaded() {
      ensureLoaded();
      return loaded ?? Promise.resolve();
    },
  };
}

/**
 * Snapshots the data, asks a waiting service worker to take over, drops
 * every cache and reloads. Cached responses are what make an installed PWA
 * go stale, so clearing them is what actually does the work; a failing step
 * never blocks the reload.
 */
export async function updateApp(snapshot?: {
  save(): Promise<unknown>;
}): Promise<void> {
  await snapshot?.save();

  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
      registration?.waiting?.postMessage(SKIP_WAITING_MESSAGE);
    } catch {
      // Fall through to the reload.
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((cacheKey) => caches.delete(cacheKey)));
    } catch {
      // Fall through to the reload.
    }
  }

  window.location.reload();
}
