import {
  type BackupEnvelope,
  type BackupMessages,
  type ShareResult,
  backupFileName,
  downloadBackup,
  readBackupEnvelope,
  readBackupJson,
  shareBackup,
} from "./backup";
import { decryptJson, encryptJson, isEncryptedBlob } from "./crypto";
import type { KeyHolder } from "./lock";
import type { KeyValueStore } from "./storage";
import { type UpdateSnapshot, createUpdateSnapshot, updateApp } from "./update";

// The local storage pattern (maat-core/docs/storage.md) with its logic
// included, so an app only supplies its data's schema: an in-memory value
// is the source of truth once loaded, the key-value store is read once in
// the background and written through on every change, encrypted with the
// app lock's key whenever one is set. `createLocalBackup` adds the JSON
// backup and the pre-update snapshot on top; `lockData` hands both to the
// app lock's rewrite/erase.

export { BackupError } from "./backup";

/** What the app lock needs from each piece of stored data. */
export type LockDataPart = {
  /** Writes the data back under the key holder's current key (or none). */
  rewrite: () => void | Promise<void>;
  /** Deletes the data for good. */
  erase: () => void | Promise<void>;
};

export type LocalStoreOptions<T, S = unknown> = {
  storage: KeyValueStore;
  key: string;
  /** The value before anything is loaded, and after an erase. */
  empty: T;
  /**
   * Turns the stored (decrypted) value into `T` — the app's schema. Stored
   * data is a trust boundary: validate here. Throwing keeps `empty`.
   */
  parse: (stored: unknown) => T;
  /** What's stored for a value; the value itself by default. */
  serialize?: (value: T) => S;
  encryption?: {
    keyHolder: KeyHolder;
    /**
     * Whether the enrolled lock encrypts. When it does, the first read waits
     * for the key: the data is unreadable (and behind the lock screen) until
     * then.
     */
    encrypts: () => Promise<boolean>;
  };
};

export type LocalStore<T, S = unknown> = LockDataPart & {
  getSnapshot(): T;
  /** For useSyncExternalStore's server snapshot: always `empty`. */
  getServerSnapshot(): T;
  subscribe(listener: () => void): () => void;
  /**
   * Whether the initial read has finished — until then "nothing stored" can't
   * be told apart from "not loaded yet" (e.g. a deep link on a cold start).
   */
  isReady(): boolean;
  isReadyOnServer(): boolean;
  /** Starts the background read on first use; resolves once it's done. */
  whenLoaded(): Promise<void>;
  /** Replaces the value; resolves once it's written (callers needn't wait). */
  replace(next: T): Promise<void>;
  /** Replaces the value with `change(current)`. */
  update(change: (current: T) => T): Promise<void>;
  /** The stored form of `value` (the current one by default), e.g. for a backup. */
  serialize(value?: T): S;
  /** The app's `parse` (e.g. for a backup's data). */
  parse(stored: unknown): T;
};

export function createLocalStore<T, S = T>({
  storage,
  key,
  empty,
  parse,
  serialize = (value) => value as unknown as S,
  encryption,
}: LocalStoreOptions<T, S>): LocalStore<T, S> {
  const listeners = new Set<() => void>();
  let value = empty;
  let ready = false;
  let loaded: Promise<void> | null = null;
  // A change made before the first read finished is newer than anything
  // stored, so that read mustn't overwrite it.
  let changedBeforeLoad = false;
  // Writes run one after another, each storing the value current when it
  // runs: encrypting is async, so two overlapping writes could otherwise
  // land out of order and leave the older value stored.
  let writes: Promise<void> = Promise.resolve();

  function emitChange(): void {
    for (const listener of listeners) listener();
  }

  async function load(): Promise<void> {
    if (encryption && (await encryption.encrypts())) {
      await encryption.keyHolder.whenSet();
    }
    try {
      const stored = await storage.get<unknown>(key);
      const cryptoKey = encryption?.keyHolder.get() ?? null;
      const raw =
        cryptoKey && isEncryptedBlob(stored)
          ? await decryptJson<unknown>(cryptoKey, stored)
          : stored;
      if (raw != null && !changedBeforeLoad) value = parse(raw);
    } catch {
      // Keep what's in memory — same as a corrupt or missing value.
    } finally {
      ready = true;
      emitChange();
    }
  }

  function whenLoaded(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    loaded ??= load();
    return loaded;
  }

  async function write(): Promise<void> {
    try {
      const stored = serialize(value);
      const cryptoKey = encryption?.keyHolder.get() ?? null;
      await storage.set(
        key,
        cryptoKey ? await encryptJson(cryptoKey, stored) : stored,
      );
    } catch {
      // Best-effort — the in-memory copy (and this tab) already reflects it.
    }
  }

  function persist(): Promise<void> {
    writes = writes.then(write);
    return writes;
  }

  function replace(next: T): Promise<void> {
    if (!ready) changedBeforeLoad = true;
    value = next;
    emitChange();
    return persist();
  }

  return {
    getSnapshot() {
      void whenLoaded();
      return value;
    },
    getServerSnapshot: () => empty,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isReady() {
      void whenLoaded();
      return ready;
    },
    isReadyOnServer: () => false,
    whenLoaded,
    replace,
    update(change) {
      void whenLoaded();
      return replace(change(value));
    },
    serialize: (of = value) => serialize(of),
    parse,
    rewrite: persist,
    erase: () => replace(empty),
  };
}

/** A backup: the envelope, the app's `extras`, and its stored data as `data`. */
export type LocalBackup<S = unknown> = BackupEnvelope &
  Record<string, unknown> & { data: S };

export type LocalBackupOptions<T, S> = {
  /** The app's id in the backup file, e.g. `"notes"`. */
  app: string;
  version: number;
  store: LocalStore<T, S>;
  messages: BackupMessages;
  /** Refuse a backup of another `version` (`messages.wrongVersion`). */
  exactVersion?: boolean;
  /**
   * Turns the backup's `data` into a value; the store's own `parse` by
   * default. Throw a `BackupError` to refuse the file.
   */
  parseData?: (data: unknown) => T;
  /** Fields a backup carries next to `data` (e.g. the language). */
  extras?: {
    create: () => Record<string, unknown>;
    /** Validates them from an imported file; only what it returns is kept. */
    parse: (backup: Record<string, unknown>) => Record<string, unknown>;
    apply: (backup: LocalBackup<S>) => void;
  };
  /** Runs after a backup replaced the data (e.g. to drop a derived cache). */
  afterApply?: () => void;
  /** The pre-update snapshot: a backup kept in the store before an update. */
  snapshot: {
    storage: KeyValueStore;
    key: string;
    /** Encrypts the snapshot like the data itself. */
    keyHolder?: KeyHolder;
  };
};

export type LocalBackupKit<S> = {
  create(): LocalBackup<S>;
  /** Validates a backup file's text; throws `BackupError` with a message. */
  parse(text: string): LocalBackup<S>;
  /** The same for an already-parsed value (e.g. read back from storage). */
  parseValue(value: unknown): LocalBackup<S>;
  /** Replaces the data with the backup's. */
  apply(backup: LocalBackup<S>): void;
  fileName(date?: Date): string;
  download(backup?: LocalBackup<S>): void;
  share(backup?: LocalBackup<S>): Promise<ShareResult>;
  snapshot: UpdateSnapshot<LocalBackup<S>>;
  /** Snapshots, activates the waiting worker, drops the caches, reloads. */
  updateApp(): Promise<void>;
  /** For `lockData`: the snapshot is deleted on erase. */
  lockPart: LockDataPart;
};

/** The JSON backup and pre-update snapshot of a `LocalStore`. */
export function createLocalBackup<T, S>({
  app,
  version,
  store,
  messages,
  exactVersion = false,
  parseData = store.parse,
  extras,
  afterApply,
  snapshot: snapshotOptions,
}: LocalBackupOptions<T, S>): LocalBackupKit<S> {
  function create(): LocalBackup<S> {
    return {
      app,
      version,
      exportedAt: new Date().toISOString(),
      ...extras?.create(),
      data: store.serialize(),
    };
  }

  function parseValue(value: unknown): LocalBackup<S> {
    const envelope = readBackupEnvelope(value, {
      app,
      version: exactVersion ? version : undefined,
      messages,
    });
    const data = parseData(envelope.data);
    // Rebuilt and re-serialized, so only what the schemas accepted is kept.
    return {
      app,
      version,
      exportedAt: envelope.exportedAt,
      ...extras?.parse(envelope),
      data: store.serialize(data),
    };
  }

  function apply(backup: LocalBackup<S>): void {
    void store.replace(store.parse(backup.data));
    extras?.apply(backup);
    afterApply?.();
  }

  const snapshot = createUpdateSnapshot<LocalBackup<S>>({
    storage: snapshotOptions.storage,
    key: snapshotOptions.key,
    backup: { create, parse: parseValue, apply },
    encryption: snapshotOptions.keyHolder && {
      getKey: snapshotOptions.keyHolder.get,
    },
  });

  return {
    create,
    parse: (text) => parseValue(readBackupJson(text, messages)),
    parseValue,
    apply,
    fileName: (date) => backupFileName(app, date),
    download: (backup = create()) => downloadBackup(backup),
    share: (backup = create()) => shareBackup(backup),
    snapshot,
    updateApp: () => updateApp(snapshot),
    lockPart: { rewrite: () => undefined, erase: () => snapshot.discard() },
  };
}

/**
 * The app lock's `data` (`createAppLock`) for every piece of stored data:
 * rewrite each under the new key, erase them all.
 */
export function lockData(...parts: LockDataPart[]): {
  rewrite: () => void;
  erase: () => Promise<void>;
} {
  return {
    rewrite() {
      for (const part of parts) {
        void Promise.resolve()
          .then(part.rewrite)
          .catch(() => undefined);
      }
    },
    async erase() {
      await Promise.all(parts.map((part) => part.erase()));
    },
  };
}
