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
} from "../src/local";
import { createKeyHolder } from "../src/lock";
import type { KeyValueStore } from "../src/storage";
import { memoryStorage } from "./memory-storage";

const KEY = "test-data";
const SNAPSHOT_KEY = "test-snapshot";

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
