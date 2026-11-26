import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupError } from "../src/backup";
import {
  deriveKey,
  encryptJson,
  isEncryptedBlob,
  randomBytes,
} from "../src/crypto";
import {
  createLocalBackup,
  createLocalStore,
  type LocalStore,
  lockData,
  unreadableKeyFor,
} from "../src/local";
import { createKeyHolder } from "../src/lock";
import type { KeyValueStore } from "../src/storage";
import { memoryStorage } from "./memory-storage";

const KEY = "test-data";
const SNAPSHOT_KEY = "test-snapshot";
const UNREADABLE_KEY = unreadableKeyFor(KEY);

type Data = { items: string[] };

function parse(stored: unknown): string[] {
  const items = (stored as Partial<Data>).items;
  if (!Array.isArray(items)) throw new Error("not data");
  return items.filter((item): item is string => typeof item === "string");
}

function itemsStore(
  storage: KeyValueStore,
  encryption?: Parameters<
    typeof createLocalStore<string[], Data>
  >[0]["encryption"],
) {
  return createLocalStore<string[], Data>({
    storage,
    key: KEY,
    empty: [],
    parse,
    serialize: (items) => ({ items }),
    encryption,
  });
}

function testKey() {
  return deriveKey(randomBytes(32), randomBytes(16), "test-data-v1");
}

beforeEach(() => vi.stubGlobal("window", {}));
afterEach(() => vi.unstubAllGlobals());

describe("createLocalStore", () => {
  it("starts empty and not ready, then loads what's stored", async () => {
    const store = itemsStore(
      memoryStorage({ [KEY]: { items: ["a"] } }).storage,
    );
    const onChange = vi.fn();
    store.subscribe(onChange);

    expect(store.getSnapshot()).toEqual([]);
    expect(store.isReady()).toBe(false);
    await store.whenLoaded();

    expect(store.getSnapshot()).toEqual(["a"]);
    expect(store.isReady()).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps the empty value when the stored one doesn't parse", async () => {
    const store = itemsStore(memoryStorage({ [KEY]: "junk" }).storage);

    await store.whenLoaded();

    expect(store.getSnapshot()).toEqual([]);
    expect(store.isReady()).toBe(true);
  });

  it("reports nothing unreadable after a normal read", async () => {
    const store = itemsStore(
      memoryStorage({ [KEY]: { items: ["a"] } }).storage,
    );

    await store.whenLoaded();

    expect(store.getUnreadable()).toBeNull();
  });

  it("serves the empty value on the server", () => {
    const store = itemsStore(memoryStorage().storage);

    expect(store.getServerSnapshot()).toEqual([]);
    expect(store.isReadyOnServer()).toBe(false);
  });

  it("doesn't load without a window", async () => {
    vi.unstubAllGlobals();
    const store = itemsStore(
      memoryStorage({ [KEY]: { items: ["a"] } }).storage,
    );

    await store.whenLoaded();

    expect(store.isReady()).toBe(false);
  });

  it("writes through on every change, in its stored form", async () => {
    const { storage, data } = memoryStorage();
    const store = itemsStore(storage);
    const onChange = vi.fn();
    store.subscribe(onChange);

    await store.replace(["a"]);
    await store.update((items) => [...items, "b"]);

    expect(store.getSnapshot()).toEqual(["a", "b"]);
    expect(data.get(KEY)).toEqual({ items: ["a", "b"] });
    // Two changes, plus the first read finishing.
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("stores the latest value when writes overlap", async () => {
    const { storage, data } = memoryStorage();
    const store = itemsStore(storage, {
      keyHolder: createKeyHolder(),
      encrypts: async () => false,
    });

    void store.replace(["first"]);
    await store.replace(["second"]);

    expect(data.get(KEY)).toEqual({ items: ["second"] });
  });

  it("keeps the in-memory value when a write fails", async () => {
    const { storage } = memoryStorage();
    vi.spyOn(storage, "set").mockRejectedValue(new Error("full"));
    const store = itemsStore(storage);

    await store.replace(["a"]);

    expect(store.getSnapshot()).toEqual(["a"]);
  });

  it("stops notifying an unsubscribed listener", async () => {
    const store = itemsStore(memoryStorage().storage);
    const onChange = vi.fn();
    store.subscribe(onChange)();

    await store.replace(["a"]);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("erases to the empty value", async () => {
    const { storage, data } = memoryStorage();
    const store = itemsStore(storage);
    await store.replace(["a"]);

    await store.erase();

    expect(store.getSnapshot()).toEqual([]);
    expect(data.get(KEY)).toEqual({ items: [] });
  });

  describe("with an encrypting lock", () => {
    it("waits for the key, then decrypts", async () => {
      const key = await testKey();
      const keyHolder = createKeyHolder();
      const store = itemsStore(
        memoryStorage({ [KEY]: await encryptJson(key, { items: ["secret"] }) })
          .storage,
        { keyHolder, encrypts: async () => true },
      );

      const loading = store.whenLoaded();
      await Promise.resolve();
      expect(store.isReady()).toBe(false);

      keyHolder.set(key);
      await loading;

      expect(store.getSnapshot()).toEqual(["secret"]);
    });

    it("encrypts what it writes, and rewrites in the clear once the key is gone", async () => {
      const keyHolder = createKeyHolder();
      keyHolder.set(await testKey());
      const { storage, data } = memoryStorage();
      const store = itemsStore(storage, {
        keyHolder,
        encrypts: async () => true,
      });

      await store.replace(["a"]);
      expect(isEncryptedBlob(data.get(KEY))).toBe(true);

      keyHolder.set(null);
      await store.rewrite();
      expect(data.get(KEY)).toEqual({ items: ["a"] });
    });

    it("keeps the empty value when the stored data can't be decrypted", async () => {
      const keyHolder = createKeyHolder();
      keyHolder.set(await testKey());
      const store = itemsStore(
        memoryStorage({
          [KEY]: await encryptJson(await testKey(), { items: ["a"] }),
        }).storage,
        { keyHolder, encrypts: async () => true },
      );

      await store.whenLoaded();

      expect(store.getSnapshot()).toEqual([]);
    });
  });
});

describe("createLocalStore with something it can't read", () => {
  async function encryptedItems(items: string[]) {
    const key = await testKey();
    return { key, blob: await encryptJson(key, { items }) };
  }

  it("moves encrypted data aside when there's no key to open it", async () => {
    const { blob } = await encryptedItems(["secret"]);
    const { storage, data } = memoryStorage({ [KEY]: blob });
    // The lock's enrolment was lost, so the store doesn't wait for a key.
    const store = itemsStore(storage, {
      keyHolder: createKeyHolder(),
      encrypts: async () => false,
    });

    await store.whenLoaded();

    expect(store.getSnapshot()).toEqual([]);
    expect(store.getUnreadable()).toEqual({
      reason: "no-key",
      movedTo: UNREADABLE_KEY,
    });
    expect(data.get(UNREADABLE_KEY)).toEqual(blob);
    expect(data.has(KEY)).toBe(false);
  });

  it("moves aside data the key doesn't open", async () => {
    const { blob } = await encryptedItems(["secret"]);
    const keyHolder = createKeyHolder();
    keyHolder.set(await testKey());
    const { storage, data } = memoryStorage({ [KEY]: blob });
    const store = itemsStore(storage, {
      keyHolder,
      encrypts: async () => true,
    });

    await store.whenLoaded();

    expect(store.getUnreadable()?.reason).toBe("decrypt-failed");
    expect(data.get(UNREADABLE_KEY)).toEqual(blob);
  });

  it("moves aside a value the app's parse refuses", async () => {
    const { storage, data } = memoryStorage({ [KEY]: "junk" });
    const store = itemsStore(storage);

    await store.whenLoaded();

    expect(store.getUnreadable()?.reason).toBe("invalid");
    expect(data.get(UNREADABLE_KEY)).toBe("junk");
  });

  it("never overwrites the moved value with new changes", async () => {
    const { blob } = await encryptedItems(["secret"]);
    const { storage, data } = memoryStorage({ [KEY]: blob });
    const store = itemsStore(storage, {
      keyHolder: createKeyHolder(),
      encrypts: async () => false,
    });
    await store.whenLoaded();

    await store.replace(["new"]);

    expect(data.get(KEY)).toEqual({ items: ["new"] });
    expect(data.get(UNREADABLE_KEY)).toEqual(blob);
  });

  it("moves the value aside before a change made during the first read lands", async () => {
    const { storage, data } = memoryStorage({ [KEY]: "junk" });
    const store = itemsStore(storage);

    await store.replace(["new"]);

    expect(data.get(UNREADABLE_KEY)).toBe("junk");
    expect(data.get(KEY)).toEqual({ items: ["new"] });
  });

  it("leaves it in place and stops writing when it can't be moved", async () => {
    const { storage, data } = memoryStorage({
      [KEY]: "junk",
      [UNREADABLE_KEY]: "moved earlier",
    });
    const store = itemsStore(storage);
    await store.whenLoaded();

    await store.replace(["new"]);

    expect(store.getUnreadable()).toEqual({ reason: "invalid", movedTo: null });
    expect(store.getSnapshot()).toEqual(["new"]);
    expect(data.get(KEY)).toBe("junk");
    expect(data.get(UNREADABLE_KEY)).toBe("moved earlier");
  });

  it("counts a value already moved on an earlier launch as moved", async () => {
    const { storage, data } = memoryStorage({
      [KEY]: "junk",
      [UNREADABLE_KEY]: "junk",
    });
    const store = itemsStore(storage);
    await store.whenLoaded();

    await store.replace(["new"]);

    expect(store.getUnreadable()?.movedTo).toBe(UNREADABLE_KEY);
    expect(data.get(KEY)).toEqual({ items: ["new"] });
  });

  it("stops writing when moving it aside fails", async () => {
    const { storage, data } = memoryStorage({ [KEY]: "junk" });
    vi.spyOn(storage, "set").mockRejectedValueOnce(new Error("full"));
    const store = itemsStore(storage);
    await store.whenLoaded();

    await store.replace(["new"]);

    expect(store.getUnreadable()?.movedTo).toBeNull();
    expect(data.get(KEY)).toBe("junk");
  });

  it("stops writing when the storage can't be read at all", async () => {
    const { storage } = memoryStorage();
    vi.spyOn(storage, "get").mockRejectedValue(new Error("broken"));
    const set = vi.spyOn(storage, "set");
    const store = itemsStore(storage);
    await store.whenLoaded();

    await store.replace(["new"]);

    expect(store.getUnreadable()).toEqual({
      reason: "storage-error",
      movedTo: null,
    });
    expect(set).not.toHaveBeenCalled();
  });

  it("notifies listeners once the unreadable value is reported", async () => {
    const store = itemsStore(memoryStorage({ [KEY]: "junk" }).storage);
    const reported = vi.fn(() => store.getUnreadable());
    store.subscribe(reported);

    await store.whenLoaded();

    expect(reported).toHaveLastReturnedWith(
      expect.objectContaining({ reason: "invalid" }),
    );
  });

  it("erases without waiting for a key that never comes", async () => {
    const { blob } = await encryptedItems(["secret"]);
    const { storage, data } = memoryStorage({
      [KEY]: blob,
      [UNREADABLE_KEY]: "moved earlier",
    });
    const store = itemsStore(storage, {
      keyHolder: createKeyHolder(),
      encrypts: async () => true,
    });
    void store.whenLoaded();

    await store.erase();

    expect(data.get(KEY)).toEqual({ items: [] });
    expect(data.has(UNREADABLE_KEY)).toBe(false);
    expect(store.getUnreadable()).toBeNull();
  });

  it("lets an erase write again after writes were stopped", async () => {
    const { storage, data } = memoryStorage({
      [KEY]: "junk",
      [UNREADABLE_KEY]: "moved earlier",
    });
    const store = itemsStore(storage);
    await store.whenLoaded();

    await store.erase();
    await store.replace(["new"]);

    expect(data.get(KEY)).toEqual({ items: ["new"] });
  });
});

describe("createLocalBackup", () => {
  const messages = {
    notJson: "not json",
    wrongApp: "wrong app",
    wrongVersion: "wrong version",
  };

  function kit(store: LocalStore<string[]>, storage: KeyValueStore) {
    return createLocalBackup({
      app: "test",
      version: 2,
      store,
      messages,
      snapshot: { storage, key: SNAPSHOT_KEY },
    });
  }

  it("creates a backup of the current data", async () => {
    const { storage } = memoryStorage();
    const store = itemsStore(storage);
    await store.replace(["a"]);

    expect(kit(store, storage).create()).toEqual({
      app: "test",
      version: 2,
      exportedAt: expect.any(String),
      data: { items: ["a"] },
    });
  });

  it("parses a backup file, keeping only what the schema accepts", () => {
    const { storage } = memoryStorage();
    const backup = kit(itemsStore(storage), storage).parse(
      JSON.stringify({
        app: "test",
        version: 1,
        exportedAt: "2026-10-01T00:00:00.000Z",
        data: { items: ["a", 3] },
      }),
    );

    expect(backup).toEqual({
      app: "test",
      version: 2,
      exportedAt: "2026-10-01T00:00:00.000Z",
      data: { items: ["a"] },
    });
  });

  it("refuses text that isn't JSON, or another app's backup", () => {
    const { storage } = memoryStorage();
    const backups = kit(itemsStore(storage), storage);

    expect(() => backups.parse("{")).toThrow(new BackupError("not json"));
    expect(() => backups.parse('{"app":"other"}')).toThrow(
      new BackupError("wrong app"),
    );
  });

  it("refuses another version only when asked to", () => {
    const { storage } = memoryStorage();
    const backups = createLocalBackup({
      app: "test",
      version: 2,
      store: itemsStore(storage),
      messages,
      exactVersion: true,
      snapshot: { storage, key: SNAPSHOT_KEY },
    });

    expect(() =>
      backups.parseValue({ app: "test", version: 1, data: { items: [] } }),
    ).toThrow(new BackupError("wrong version"));
  });

  it("lets the app refuse a backup's data", () => {
    const { storage } = memoryStorage();
    const backups = createLocalBackup({
      app: "test",
      version: 1,
      store: itemsStore(storage),
      messages,
      parseData: () => {
        throw new BackupError("empty");
      },
      snapshot: { storage, key: SNAPSHOT_KEY },
    });

    expect(() => backups.parseValue({ app: "test", data: {} })).toThrow(
      new BackupError("empty"),
    );
  });

  it("applies a backup, its extras and the after-apply step", async () => {
    const { storage, data } = memoryStorage();
    const store = itemsStore(storage);
    const applyExtras = vi.fn();
    const afterApply = vi.fn();
    const backups = createLocalBackup({
      app: "test",
      version: 1,
      store,
      messages,
      extras: {
        create: () => ({ locale: "pl" }),
        parse: ({ locale }) => ({
          locale: typeof locale === "string" ? locale : null,
        }),
        apply: applyExtras,
      },
      afterApply,
      snapshot: { storage, key: SNAPSHOT_KEY },
    });
    const backup = backups.create();
    expect(backup.locale).toBe("pl");
    expect(backups.parseValue({ ...backup, locale: 42, junk: true })).toEqual({
      ...backup,
      locale: null,
    });

    backups.apply({ ...backup, data: { items: ["b"] } });
    await store.whenLoaded();

    expect(store.getSnapshot()).toEqual(["b"]);
    await vi.waitFor(() => expect(data.get(KEY)).toEqual({ items: ["b"] }));
    expect(applyExtras).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "pl" }),
    );
    expect(afterApply).toHaveBeenCalled();
  });

  it("names the backup file after the app", () => {
    const { storage } = memoryStorage();
    expect(
      kit(itemsStore(storage), storage).fileName(new Date(2026, 9, 17)),
    ).toBe("test-backup-2026-10-17.txt");
  });

  it("keeps a pre-update snapshot, encrypted with the lock's key, and erases it", async () => {
    const { storage, data } = memoryStorage();
    const keyHolder = createKeyHolder();
    keyHolder.set(await testKey());
    const store = itemsStore(storage);
    await store.replace(["a"]);
    const backups = createLocalBackup({
      app: "test",
      version: 1,
      store,
      messages,
      snapshot: { storage, key: SNAPSHOT_KEY, keyHolder },
    });

    await backups.snapshot.save();
    expect(isEncryptedBlob(data.get(SNAPSHOT_KEY))).toBe(true);
    await store.replace([]);
    await expect(backups.snapshot.restore()).resolves.toBe(true);
    expect(store.getSnapshot()).toEqual(["a"]);

    await backups.lockPart.rewrite();
    await backups.lockPart.erase();
    expect(data.has(SNAPSHOT_KEY)).toBe(false);
  });

  it("encrypts a snapshot taken before the lock started encrypting", async () => {
    const { storage, data } = memoryStorage();
    const keyHolder = createKeyHolder();
    const store = itemsStore(storage);
    await store.replace(["a"]);
    const backups = createLocalBackup({
      app: "test",
      version: 1,
      store,
      messages,
      snapshot: { storage, key: SNAPSHOT_KEY, keyHolder },
    });
    await backups.snapshot.save();
    expect(isEncryptedBlob(data.get(SNAPSHOT_KEY))).toBe(false);

    keyHolder.set(await testKey());
    await backups.lockPart.rewrite(null);

    expect(isEncryptedBlob(data.get(SNAPSHOT_KEY))).toBe(true);
    await expect(backups.snapshot.read()).resolves.toMatchObject({
      data: { items: ["a"] },
    });
  });

  it("keeps the snapshot readable once the lock stops encrypting", async () => {
    const { storage, data } = memoryStorage();
    const keyHolder = createKeyHolder();
    const previousKey = await testKey();
    keyHolder.set(previousKey);
    const store = itemsStore(storage);
    await store.replace(["a"]);
    const backups = createLocalBackup({
      app: "test",
      version: 1,
      store,
      messages,
      snapshot: { storage, key: SNAPSHOT_KEY, keyHolder },
    });
    await backups.snapshot.save();

    keyHolder.set(null);
    await backups.lockPart.rewrite(previousKey);

    expect(isEncryptedBlob(data.get(SNAPSHOT_KEY))).toBe(false);
    await expect(backups.snapshot.read()).resolves.toMatchObject({
      data: { items: ["a"] },
    });
  });

  it("downloads and shares a fresh backup by default", async () => {
    const { storage } = memoryStorage();
    const backups = kit(itemsStore(storage), storage);
    const createObjectURL = vi.fn(() => "blob:x");
    const link = { click: vi.fn(), remove: vi.fn() } as unknown as HTMLElement;
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.stubGlobal("window", { setTimeout: vi.fn() });
    vi.stubGlobal("document", {
      createElement: () => link,
      body: { append: vi.fn() },
    });
    vi.stubGlobal("navigator", {});

    backups.download();
    await expect(backups.share()).resolves.toBe("unavailable");

    expect(createObjectURL).toHaveBeenCalled();
  });

  it("updates the app after taking a snapshot", async () => {
    const { storage, data } = memoryStorage();
    const backups = kit(itemsStore(storage), storage);
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    vi.stubGlobal("navigator", {});

    await backups.updateApp();

    expect(data.has(SNAPSHOT_KEY)).toBe(true);
    expect(reload).toHaveBeenCalled();
  });
});

describe("lockData", () => {
  it("passes the previous key on to every part", async () => {
    const part = { rewrite: vi.fn(), erase: vi.fn() };
    const previousKey = await testKey();

    lockData(part).rewrite(previousKey);

    await vi.waitFor(() =>
      expect(part.rewrite).toHaveBeenCalledWith(previousKey),
    );
  });

  it("rewrites every part, even past one that fails", async () => {
    const good = { rewrite: vi.fn(), erase: vi.fn() };
    const bad = {
      rewrite: vi.fn(() => Promise.reject(new Error("no"))),
      erase: vi.fn(),
    };

    lockData(bad, good).rewrite();
    await vi.waitFor(() => expect(good.rewrite).toHaveBeenCalled());

    expect(bad.rewrite).toHaveBeenCalled();
  });

  it("erases every part", async () => {
    const parts = [
      { rewrite: vi.fn(), erase: vi.fn() },
      { rewrite: vi.fn(), erase: vi.fn(async () => undefined) },
    ];

    await lockData(...parts).erase();

    for (const part of parts) expect(part.erase).toHaveBeenCalled();
  });
});

describe("createLocalStore before its first read finishes", () => {
  it("keeps a change made meanwhile rather than the stored value", async () => {
    const store = itemsStore(
      memoryStorage({ [KEY]: { items: ["stored"] } }).storage,
    );

    const loading = store.whenLoaded();
    await store.replace(["newer"]);
    await loading;

    expect(store.getSnapshot()).toEqual(["newer"]);
  });
});
