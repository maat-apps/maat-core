import type { KeyValueStore } from "../src/storage";

/** An in-memory KeyValueStore, with the backing map exposed for assertions. */
export function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: KeyValueStore = {
    get: async <T>(key: string) => data.get(key) as T | undefined,
    set: async (key, value) => {
      data.set(key, value);
    },
    delete: async (key) => {
      data.delete(key);
    },
  };
  return { storage, data };
}
