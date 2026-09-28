import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPersistedStore } from "../src/persisted";
import type { KeyValueStore } from "../src/storage";
import { memoryStorage } from "./memory-storage";

type Settings = { installed: boolean; theme: string };

const KEY = "test-settings";
const DEFAULTS: Settings = { installed: false, theme: "dark" };

function parse(stored: unknown): Settings {
  const value = stored as Partial<Settings>;
  if (typeof value.installed !== "boolean") throw new Error("invalid");
  return { ...DEFAULTS, ...value };
}

function settingsStore(storage: KeyValueStore) {
  return createPersistedStore({ storage, key: KEY, defaults: DEFAULTS, parse });
}

beforeEach(() => vi.stubGlobal("window", {}));
afterEach(() => vi.unstubAllGlobals());

describe("createPersistedStore", () => {
  it("starts from the defaults, not ready", () => {
    const store = settingsStore(memoryStorage().storage);

    expect(store.getSnapshot()).toBe(DEFAULTS);
    expect(store.isReady()).toBe(false);
  });

  it("loads the stored value and becomes ready", async () => {
    const store = settingsStore(
      memoryStorage({ [KEY]: { installed: true } }).storage,
    );
    const onChange = vi.fn();
    const onReady = vi.fn();
    store.subscribe(onChange);
    store.subscribeReady(onReady);

    await store.whenLoaded();

    expect(store.getSnapshot()).toEqual({ installed: true, theme: "dark" });
    expect(store.isReady()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("keeps the defaults (and still becomes ready) for an invalid stored value", async () => {
    const store = settingsStore(
      memoryStorage({ [KEY]: { installed: "yes" } }).storage,
    );

    await store.whenLoaded();

    expect(store.getSnapshot()).toBe(DEFAULTS);
    expect(store.isReady()).toBe(true);
  });

  it("keeps the defaults when storage fails", async () => {
    const { storage } = memoryStorage();
    storage.get = () => Promise.reject(new Error("blocked"));
    const store = settingsStore(storage);

    await store.whenLoaded();

    expect(store.getSnapshot()).toBe(DEFAULTS);
    expect(store.isReady()).toBe(true);
  });

  it("merges a patch, notifies and persists", async () => {
    const { storage, data } = memoryStorage();
    const store = settingsStore(storage);
    const onChange = vi.fn();
    store.subscribe(onChange);

    store.set({ installed: true });

    expect(store.getSnapshot()).toEqual({ installed: true, theme: "dark" });
    expect(onChange).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(data.get(KEY)).toEqual({ installed: true, theme: "dark" }),
    );
  });

  it("stops notifying after unsubscribing", () => {
    const store = settingsStore(memoryStorage().storage);
    const onChange = vi.fn();
    store.subscribe(onChange)();

    store.set({ theme: "light" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("reset deletes the stored value and returns to the defaults", async () => {
    const { storage, data } = memoryStorage({ [KEY]: { installed: true } });
    const store = settingsStore(storage);
    await store.whenLoaded();

    await store.reset();

    expect(store.getSnapshot()).toBe(DEFAULTS);
    expect(data.has(KEY)).toBe(false);
  });

  it("uses the defaults on the server and never loads there", async () => {
    vi.stubGlobal("window", undefined);
    const { storage } = memoryStorage({ [KEY]: { installed: true } });
    const store = settingsStore(storage);

    await store.whenLoaded();

    expect(store.getSnapshot()).toBe(DEFAULTS);
    expect(store.getServerSnapshot()).toBe(DEFAULTS);
    expect(store.isReady()).toBe(false);
  });
});
