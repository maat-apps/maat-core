// A tiny promise wrapper around raw IndexedDB: one database, one key-value
// object store. The surface area an app needs (get/set/delete) is too small
// to justify a dependency. See maat-core/docs/storage.md for the pattern
// apps build on top of it (an in-memory copy as the source of truth, this
// store as the write-through backing store).

const STORE_NAME = "kv";
const DB_VERSION = 1;

export type KeyValueStore = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

export type KeyValueStoreOptions = {
  /** The IndexedDB database name — one per app, e.g. its package name. */
  name: string;
  /**
   * Runs only when the database is first created, inside the upgrade
   * transaction, with the new (empty) object store — e.g. to carry over data
   * from an older storage layer. May return a callback that runs once the
   * database has opened successfully, e.g. to clean up what was migrated.
   */
  onCreate?: (store: IDBObjectStore) => void | (() => void);
};

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function whenComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * A key-value store backed by the IndexedDB database `name`. The database is
 * opened lazily on first use and the connection is reused afterwards.
 */
export function createKeyValueStore({
  name,
  onCreate,
}: KeyValueStoreOptions): KeyValueStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function openDatabase(): Promise<IDBDatabase> {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION);
      let afterCreate: (() => void) | undefined;

      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE_NAME);
        afterCreate = onCreate?.(store) ?? undefined;
      };
      request.onsuccess = () => {
        afterCreate?.();
        // Without this, another tab (or a version bump) trying to open a
        // newer version — or delete the database outright — would hang
        // forever waiting for this connection to close.
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      const db = await openDatabase();
      const transaction = db.transaction(STORE_NAME, "readonly");
      return promisifyRequest(
        transaction.objectStore(STORE_NAME).get(key) as IDBRequest<
          T | undefined
        >,
      );
    },
    async set(key: string, value: unknown): Promise<void> {
      const db = await openDatabase();
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, key);
      await whenComplete(transaction);
    },
    async delete(key: string): Promise<void> {
      const db = await openDatabase();
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(key);
      await whenComplete(transaction);
    },
  };
}
