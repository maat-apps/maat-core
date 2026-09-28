import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveKey, isEncryptedBlob, randomBytes } from "../src/crypto";
import type { KeyValueStore } from "../src/storage";
import { SKIP_WAITING_MESSAGE } from "../src/sw";
import { createUpdateSnapshot, updateApp } from "../src/update";
import { memoryStorage } from "./memory-storage";

type Backup = { app: "test"; items: string[] };

const KEY = "test-update-snapshot";

function backupAdapter(current: string[] = ["a"]) {
  let data = current;
  return {
    get data() {
      return data;
    },
    create: (): Backup => ({ app: "test", items: data }),
    parse(value: unknown): Backup {
      if ((value as Backup)?.app !== "test") throw new Error("not a backup");
      return value as Backup;
    },
    apply(backup: Backup) {
      data = backup.items;
    },
  };
}

function snapshotFor(
  storage: KeyValueStore,
  backup = backupAdapter(),
  key: CryptoKey | null = null,
) {
  return createUpdateSnapshot({
    storage,
    key: KEY,
    backup,
    encryption: { getKey: () => key },
  });
}

beforeEach(() => vi.stubGlobal("window", {}));
afterEach(() => vi.unstubAllGlobals());

describe("createUpdateSnapshot", () => {
  it("reports no snapshot when nothing is stored", async () => {
    const snapshot = snapshotFor(memoryStorage().storage);

    await snapshot.whenLoaded();

    expect(snapshot.has()).toBe(false);
    expect(snapshot.hasOnServer()).toBe(false);
  });

  it("reports an existing snapshot after loading", async () => {
    const snapshot = snapshotFor(
      memoryStorage({ [KEY]: { app: "test", items: [] } }).storage,
    );
    const onChange = vi.fn();
    snapshot.subscribe(onChange);

    await snapshot.whenLoaded();

    expect(snapshot.has()).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it("saves the current data, notifies and reads it back", async () => {
    const { storage } = memoryStorage();
    const snapshot = snapshotFor(storage, backupAdapter(["x", "y"]));
    const onChange = vi.fn();
    snapshot.subscribe(onChange);

    const saved = await snapshot.save();

    expect(saved).toEqual({ app: "test", items: ["x", "y"] });
    expect(snapshot.has()).toBe(true);
    expect(onChange).toHaveBeenCalled();
    await expect(snapshot.read()).resolves.toEqual(saved);
  });

  it("returns null instead of throwing when saving fails", async () => {
    const { storage } = memoryStorage();
    storage.set = () => Promise.reject(new Error("quota"));

    await expect(snapshotFor(storage).save()).resolves.toBeNull();
  });

  it("reads null for a missing or invalid snapshot", async () => {
    await expect(snapshotFor(memoryStorage().storage).read()).resolves.toBe(
      null,
    );
    await expect(
      snapshotFor(memoryStorage({ [KEY]: { app: "other" } }).storage).read(),
    ).resolves.toBeNull();
  });

  it("restores the stored snapshot through the adapter", async () => {
    const backup = backupAdapter(["before"]);
    const snapshot = snapshotFor(memoryStorage().storage, backup);
    await snapshot.save();
    backup.apply({ app: "test", items: ["changed"] });

    await expect(snapshot.restore()).resolves.toBe(true);

    expect(backup.data).toEqual(["before"]);
  });

  it("restores nothing when there's no snapshot", async () => {
    await expect(snapshotFor(memoryStorage().storage).restore()).resolves.toBe(
      false,
    );
  });

  it("discards the snapshot and notifies", async () => {
    const { storage, data } = memoryStorage();
    const snapshot = snapshotFor(storage);
    await snapshot.save();
    const onChange = vi.fn();
    snapshot.subscribe(onChange);

    await snapshot.discard();

    expect(data.has(KEY)).toBe(false);
    expect(snapshot.has()).toBe(false);
    expect(onChange).toHaveBeenCalled();
  });

  describe("with an encryption key", () => {
    async function testKey() {
      return deriveKey(randomBytes(32), randomBytes(16), "test-data-v1");
    }

    it("stores the snapshot encrypted and reads it back", async () => {
      const { storage, data } = memoryStorage();
      const snapshot = snapshotFor(storage, backupAdapter(), await testKey());

      const saved = await snapshot.save();

      expect(isEncryptedBlob(data.get(KEY))).toBe(true);
      await expect(snapshot.read()).resolves.toEqual(saved);
    });

    it("can't read an encrypted snapshot with another key", async () => {
      const { storage } = memoryStorage();
      await snapshotFor(storage, backupAdapter(), await testKey()).save();

      const other = snapshotFor(storage, backupAdapter(), await testKey());

      await expect(other.read()).resolves.toBeNull();
    });
  });
});

describe("updateApp", () => {
  function stubBrowser({
    registration,
    cacheKeys = [],
  }: {
    registration?: unknown;
    cacheKeys?: string[];
  } = {}) {
    const reload = vi.fn();
    const deleted: string[] = [];
    vi.stubGlobal("window", { caches: {}, location: { reload } });
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistration: async () => registration },
    });
    vi.stubGlobal("caches", {
      keys: async () => cacheKeys,
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    });
    return { reload, deleted };
  }

  it("snapshots, activates the waiting worker, clears caches and reloads", async () => {
    const postMessage = vi.fn();
    const update = vi.fn(async () => {});
    const { reload, deleted } = stubBrowser({
      registration: { update, waiting: { postMessage } },
      cacheKeys: ["app-v1", "app-v2"],
    });
    const save = vi.fn(async () => null);

    await updateApp({ save });

    expect(save).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
    expect(deleted).toEqual(["app-v1", "app-v2"]);
    expect(reload).toHaveBeenCalled();
  });

  it("still reloads when the worker and cache steps fail", async () => {
    const { reload } = stubBrowser();
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: () => Promise.reject(new Error("no")),
      },
    });
    vi.stubGlobal("caches", {
      keys: () => Promise.reject(new Error("no")),
    });

    await updateApp();

    expect(reload).toHaveBeenCalled();
  });
});
