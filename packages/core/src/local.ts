import {
  type BackupEnvelope,
  BackupError,
  type BackupMessages,
  type ShareResult,
  backupFile,
  backupFileName,
  downloadBackup,
  readBackupEnvelope,
  readBackupJson,
  shareBackup,
  shareOrDownloadFile,
} from "./backup";
import {
  decryptJson,
  decryptJsonWithPassword,
  encryptJson,
  encryptJsonWithPassword,
  isEncryptedBlob,
  isPasswordEncryptedBlob,
} from "./crypto";
import type { KeyHolder, LockEnrolment } from "./lock";
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
  /**
   * Moves the data aside, still in its stored (encrypted) form, with the
   * lock it was encrypted under, and starts over empty — instead of erasing
   * it when the lock is turned off without its key. Parts without this are
   * erased.
   */
  setAside?: (lock: LockEnrolment | null) => void | Promise<void>;
  /**
   * Writes the data back under the key holder's current key (or none).
   * `previousKey` is the key it was under until now, for data that isn't
   * held in memory and has to be read back first (the update snapshot).
   */
  rewrite: (previousKey?: CryptoKey | null) => void | Promise<void>;
  /** Deletes the data for good. */
  erase: () => void | Promise<void>;
};

/** Why a store couldn't read what it had stored (`getUnreadable`). */
export type UnreadableReason =
  /** Encrypted, but there's no key — e.g. the lock's enrolment was lost. */
  | "no-key"
  /** Encrypted, and the key doesn't open it, or the ciphertext is damaged. */
  | "decrypt-failed"
  /** Readable, but the app's `parse` refused it. */
  | "invalid"
  /** The storage itself failed, so what's stored is unknown. */
  | "storage-error";

export type UnreadableStoredValue = {
  reason: UnreadableReason;
  /**
   * The storage key the unread value was moved to, untouched, so the store
   * could carry on (`unreadableKeyFor`). `null` when it was left where it
   * was: then nothing is written this session, so it can't be overwritten.
   */
  movedTo: string | null;
};

/** Where a store moves a stored value it can't read, rather than lose it. */
export function unreadableKeyFor(key: string): string {
  return `${key}-unreadable`;
}

/** One value a store moved aside, with what may open it again. */
export type SetAsideEntry = {
  /** As it was stored — still encrypted, if it was. */
  value: unknown;
  /** The lock it was encrypted under, when known. */
  lock: LockEnrolment | null;
  setAsideAt: string | null;
};

function isSetAsideList(value: unknown): value is { setAside: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { setAside?: unknown }).setAside)
  );
}

function toEntry(value: unknown): SetAsideEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Partial<SetAsideEntry>;
  if (!("value" in entry) || entry.value == null) return null;
  return {
    value: entry.value,
    lock: (entry.lock as LockEnrolment | null | undefined) ?? null,
    setAsideAt: typeof entry.setAsideAt === "string" ? entry.setAsideAt : null,
  };
}

/**
 * The entries stored under `unreadableKeyFor`: a `{ setAside: [...] }`
 * list, or — as the first version wrote it — the bare value on its own.
 */
export function readSetAsideEntries(stored: unknown): SetAsideEntry[] {
  if (stored == null) return [];
  if (!isSetAsideList(stored)) {
    return [{ value: stored, lock: null, setAsideAt: null }];
  }
  return stored.setAside.flatMap((item) => {
    const entry = toEntry(item);
    return entry ? [entry] : [];
  });
}

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
  /**
   * Set when the first read found something it couldn't read. The store
   * then starts from `empty`, but never by overwriting that value: it's
   * moved aside first, or — if that fails — left in place with writes
   * turned off for this session. Tell the user; listeners are notified.
   */
  getUnreadable(): UnreadableStoredValue | null;
  /**
   * Moves what's stored aside, untouched, with `lock` (the enrolment it was
   * encrypted under), and starts over empty — the lock's `setAside`. Doesn't
   * wait for the first read. If it can't be moved, nothing is written this
   * session instead (`getUnreadable`).
   */
  setAside(lock: LockEnrolment | null): Promise<void>;
  /** How many values are set aside; known once loaded, listeners notified. */
  getSetAsideCount(): number;
  /**
   * Opens what's set aside: `keyFor` gives the key for an entry's lock
   * (`null`: the current one), or `null` to skip it. Each entry that opens
   * and parses is removed and returned, for the app to merge in; the rest
   * stay set aside.
   */
  recoverSetAside(
    keyFor: (lock: LockEnrolment | null) => Promise<CryptoKey | null>,
  ): Promise<T[]>;
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
  // No write may land before the first read has looked at what's stored:
  // it could otherwise replace data the read would have found unreadable
  // and moved aside. Released by that read, or by an erase.
  let releaseWrites: () => void = () => undefined;
  const writesReleased = new Promise<void>((resolve) => {
    releaseWrites = resolve;
  });
  let unreadable: UnreadableStoredValue | null = null;
  // Set when an unreadable value had to stay where it is.
  let writesBlocked = false;
  // Set by an erase or a set-aside: a first read still running must then
  // leave what's stored alone.
  let firstReadOverruled = false;
  let setAsideCount = 0;
  const setAsideKey = unreadableKeyFor(key);

  function emitChange(): void {
    for (const listener of listeners) listener();
  }

  async function storeSetAside(entries: SetAsideEntry[]): Promise<void> {
    if (entries.length === 0) await storage.delete(setAsideKey);
    else await storage.set(setAsideKey, { setAside: entries });
    setAsideCount = entries.length;
  }

  /**
   * Adds `stored` to the set-aside list, then deletes it from `key`. False
   * when it couldn't be added; a value already in the list (moved on an
   * earlier launch whose delete failed) counts as added.
   */
  async function moveAside(
    stored: unknown,
    lock: LockEnrolment | null,
  ): Promise<boolean> {
    try {
      const entries = readSetAsideEntries(
        await storage.get<unknown>(setAsideKey),
      );
      const json = JSON.stringify(stored);
      if (!entries.some((entry) => JSON.stringify(entry.value) === json)) {
        entries.push({
          value: stored,
          lock,
          setAsideAt: new Date().toISOString(),
        });
        await storeSetAside(entries);
      }
      setAsideCount = entries.length;
    } catch {
      return false;
    }
    await storage.delete(key).catch(() => undefined);
    return true;
  }

  /** Moves an unreadable `stored` aside so a write can't destroy it. */
  async function setAsideUnreadable(
    stored: unknown,
    reason: UnreadableReason,
  ): Promise<void> {
    if (firstReadOverruled) return;
    const moved = await moveAside(stored, null);
    if (!moved) writesBlocked = true;
    unreadable = { reason, movedTo: moved ? setAsideKey : null };
  }

  async function read(stored: unknown): Promise<void> {
    if (firstReadOverruled) return;
    const cryptoKey = encryption?.keyHolder.get() ?? null;
    let raw = stored;
    if (encryption && isEncryptedBlob(stored)) {
      if (!cryptoKey) return setAsideUnreadable(stored, "no-key");
      try {
        raw = await decryptJson<unknown>(cryptoKey, stored);
      } catch {
        return setAsideUnreadable(stored, "decrypt-failed");
      }
    }
    let parsed: T;
    try {
      parsed = parse(raw);
    } catch {
      return setAsideUnreadable(stored, "invalid");
    }
    if (!changedBeforeLoad) value = parsed;
  }

  async function countSetAside(): Promise<void> {
    try {
      setAsideCount = readSetAsideEntries(
        await storage.get<unknown>(setAsideKey),
      ).length;
    } catch {
      // Unknown: nothing is offered for recovery this session.
    }
  }

  async function load(): Promise<void> {
    try {
      if (encryption && (await encryption.encrypts())) {
        await encryption.keyHolder.whenSet();
      }
      const stored = await storage.get<unknown>(key);
      if (stored != null) await read(stored);
      await countSetAside();
    } catch {
      // What's stored is unknown, so nothing may be written over it.
      writesBlocked = true;
      unreadable = { reason: "storage-error", movedTo: null };
    } finally {
      ready = true;
      releaseWrites();
      emitChange();
    }
  }

  function whenLoaded(): Promise<void> {
    if (typeof window === "undefined") {
      releaseWrites();
      return Promise.resolve();
    }
    loaded ??= load();
    return loaded;
  }

  async function write(): Promise<void> {
    if (writesBlocked) return;
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
    void whenLoaded();
    writes = writes.then(() => writesReleased).then(write);
    return writes;
  }

  /** Empties the store without waiting for the first read. */
  function startOver(): void {
    if (!ready) changedBeforeLoad = true;
    firstReadOverruled = true;
    value = empty;
    unreadable = null;
    writesBlocked = false;
  }

  // Deliberate, so it doesn't wait for the first read: with an encrypting
  // lock whose key is gone for good, that read never comes.
  async function erase(): Promise<void> {
    startOver();
    setAsideCount = 0;
    releaseWrites();
    emitChange();
    await persist();
    await storage.delete(setAsideKey).catch(() => undefined);
  }

  // Like erase, the first read isn't waited for; but what's stored is kept.
  async function setAside(lock: LockEnrolment | null): Promise<void> {
    startOver();
    let stored: unknown;
    try {
      stored = await storage.get<unknown>(key);
    } catch {
      stored = undefined;
      writesBlocked = true;
      unreadable = { reason: "storage-error", movedTo: null };
    }
    if (stored != null && !(await moveAside(stored, lock))) {
      writesBlocked = true;
      unreadable = { reason: "storage-error", movedTo: null };
    }
    if (!ready) await countSetAside();
    releaseWrites();
    emitChange();
    await persist();
  }

  async function openEntry(
    entry: SetAsideEntry,
    keyFor: (lock: LockEnrolment | null) => Promise<CryptoKey | null>,
  ): Promise<T | null> {
    try {
      let raw = entry.value;
      if (isEncryptedBlob(raw)) {
        const cryptoKey = await keyFor(entry.lock);
        if (!cryptoKey) return null;
        raw = await decryptJson<unknown>(cryptoKey, raw);
      }
      return parse(raw);
    } catch {
      return null;
    }
  }

  async function recoverSetAside(
    keyFor: (lock: LockEnrolment | null) => Promise<CryptoKey | null>,
  ): Promise<T[]> {
    const entries = readSetAsideEntries(
      await storage.get<unknown>(setAsideKey),
    );
    const recovered: T[] = [];
    const left: SetAsideEntry[] = [];
    for (const entry of entries) {
      const opened = await openEntry(entry, keyFor);
      if (opened === null) left.push(entry);
      else recovered.push(opened);
    }
    if (recovered.length > 0) {
      await storeSetAside(left);
      emitChange();
    }
    return recovered;
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
    getUnreadable: () => unreadable,
    setAside,
    getSetAsideCount() {
      void whenLoaded();
      return setAsideCount;
    },
    recoverSetAside,
    rewrite: () => persist(),
    erase,
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
  /**
   * The backup (a fresh one by default) as a file only `password` opens —
   * the envelope stays readable, everything else is encrypted.
   */
  encryptedFile(password: string, backup?: LocalBackup<S>): Promise<File>;
  /** Shares the password-protected backup, else downloads it. */
  exportWithPassword(
    password: string,
    backup?: LocalBackup<S>,
  ): Promise<"shared" | "cancelled" | "downloaded">;
  /** True for a password-protected backup file (`parseWithPassword`). */
  isEncrypted(text: string): boolean;
  /**
   * `parse` for a password-protected file (a plain one is parsed as is).
   * Throws `BackupError` with `messages.wrongPassword` when the password
   * doesn't open it.
   */
  parseWithPassword(text: string, password: string): Promise<LocalBackup<S>>;
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

  // Binds a file's ciphertext to this app's backups.
  const encryptedFor = `${app}-backup`;

  function readEnvelope(value: unknown) {
    return readBackupEnvelope(value, {
      app,
      version: exactVersion ? version : undefined,
      messages,
    });
  }

  function parseValue(value: unknown): LocalBackup<S> {
    const envelope = readEnvelope(value);
    // Without this, its missing `data` would parse as an empty backup.
    if (envelope.encrypted !== undefined) {
      throw new BackupError(messages.passwordRequired ?? messages.wrongApp);
    }
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

  async function encryptedFile(
    password: string,
    backup = create(),
  ): Promise<File> {
    return backupFile({
      app,
      version,
      exportedAt: backup.exportedAt,
      encrypted: await encryptJsonWithPassword(password, backup, {
        additionalData: encryptedFor,
      }),
    });
  }

  function isEncrypted(text: string): boolean {
    try {
      const value: unknown = JSON.parse(text);
      return (
        typeof value === "object" &&
        value !== null &&
        isPasswordEncryptedBlob((value as { encrypted?: unknown }).encrypted)
      );
    } catch {
      return false;
    }
  }

  async function parseWithPassword(
    text: string,
    password: string,
  ): Promise<LocalBackup<S>> {
    const envelope = readEnvelope(readBackupJson(text, messages));
    if (!isPasswordEncryptedBlob(envelope.encrypted)) {
      return parseValue(envelope);
    }
    let inner: unknown;
    try {
      inner = await decryptJsonWithPassword(
        password,
        envelope.encrypted,
        encryptedFor,
      );
    } catch {
      throw new BackupError(messages.wrongPassword ?? messages.notJson);
    }
    return parseValue(inner);
  }

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
    encryptedFile,
    exportWithPassword: async (password, backup) =>
      shareOrDownloadFile(await encryptedFile(password, backup)),
    isEncrypted,
    parseWithPassword,
    lockPart: {
      rewrite: (previousKey = null) => snapshot.reencrypt(previousKey),
      erase: () => snapshot.discard(),
    },
  };
}

/**
 * The app lock's `data` (`createAppLock`) for every piece of stored data:
 * rewrite each under the new key (passing on the previous one), erase them
 * all.
 */
export function lockData(...parts: LockDataPart[]): {
  rewrite: (previousKey?: CryptoKey | null) => void;
  erase: () => Promise<void>;
  setAside: (lock: LockEnrolment | null) => Promise<void>;
} {
  return {
    rewrite(previousKey = null) {
      for (const part of parts) {
        void Promise.resolve()
          .then(() => part.rewrite(previousKey))
          .catch(() => undefined);
      }
    },
    async erase() {
      await Promise.all(parts.map((part) => part.erase()));
    },
    async setAside(lock) {
      await Promise.all(
        parts.map((part) =>
          part.setAside ? part.setAside(lock) : part.erase(),
        ),
      );
    },
  };
}
