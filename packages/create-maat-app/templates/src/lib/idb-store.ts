// A tiny hand-rolled promise wrapper around raw IndexedDB, in the same
// spirit as src/i18n/use-translation.ts being a custom hook instead of a
// library — the surface area needed here (get/set/delete on one key-value
// store) is too small to justify a dependency.

const DB_NAME = "{{APP_NAME}}";
const DB_VERSION = 1;
const STORE_NAME = "kv";

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

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      // Without this, another tab (or a version bump) trying to open a newer
      // version — or delete the database outright — would hang forever
      // waiting for this connection to close.
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readonly");
  return promisifyRequest(
    transaction.objectStore(STORE_NAME).get(key) as IDBRequest<T | undefined>,
  );
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(value, key);
  await whenComplete(transaction);
}

// No kvDelete here — nothing in this scaffold needs it yet. Add it (see
// trainer's or routines' own idb-store.ts) once this app has something to
// delete, e.g. discarding an update snapshot.
