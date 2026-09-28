import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyValueStore } from "../src/storage";

const DB_NAME = "core-storage-test";

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  await deleteDatabase(DB_NAME);
});

describe("createKeyValueStore", () => {
  it("returns undefined for a key that was never set", async () => {
    const store = createKeyValueStore({ name: DB_NAME });

    await expect(store.get("missing")).resolves.toBeUndefined();
  });

  it("round-trips a value", async () => {
    const store = createKeyValueStore({ name: DB_NAME });

    await store.set("k", { a: 1 });

    await expect(store.get("k")).resolves.toEqual({ a: 1 });
  });

  it("overwrites an existing value", async () => {
    const store = createKeyValueStore({ name: DB_NAME });

    await store.set("k", "first");
    await store.set("k", "second");

    await expect(store.get("k")).resolves.toBe("second");
  });

  it("deletes a value", async () => {
    const store = createKeyValueStore({ name: DB_NAME });
    await store.set("k", "v");

    await store.delete("k");

    await expect(store.get("k")).resolves.toBeUndefined();
  });

  it("treats deleting a missing key as a no-op", async () => {
    const store = createKeyValueStore({ name: DB_NAME });

    await expect(store.delete("missing")).resolves.toBeUndefined();
  });

  it("persists across store instances for the same database", async () => {
    await createKeyValueStore({ name: DB_NAME }).set("k", "kept");

    const reopened = createKeyValueStore({ name: DB_NAME });

    await expect(reopened.get("k")).resolves.toBe("kept");
  });

  it("keeps databases with different names separate", async () => {
    const other = `${DB_NAME}-other`;
    await deleteDatabase(other);
    await createKeyValueStore({ name: DB_NAME }).set("k", "a");

    await expect(
      createKeyValueStore({ name: other }).get("k"),
    ).resolves.toBeUndefined();
  });
});

describe("onCreate", () => {
  it("can seed the new store, and the seed is readable", async () => {
    const store = createKeyValueStore({
      name: DB_NAME,
      onCreate: (objectStore) => {
        objectStore.put("migrated", "legacy");
      },
    });

    await expect(store.get("legacy")).resolves.toBe("migrated");
  });

  it("runs only when the database is first created", async () => {
    const onCreate = vi.fn();
    await createKeyValueStore({ name: DB_NAME, onCreate }).get("k");

    await createKeyValueStore({ name: DB_NAME, onCreate }).get("k");

    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("runs the returned callback once the database has opened", async () => {
    const afterOpen = vi.fn();
    const store = createKeyValueStore({
      name: DB_NAME,
      onCreate: () => afterOpen,
    });

    await store.get("k");

    expect(afterOpen).toHaveBeenCalledTimes(1);
  });
});
