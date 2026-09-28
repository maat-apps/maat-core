import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleStore, detectLocale } from "../src/locale";
import type { KeyValueStore } from "../src/storage";

const KEY = "test-locale";

function memoryStorage(initial: Record<string, unknown> = {}) {
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

function useDeviceLanguage(language: string) {
  vi.stubGlobal("window", { navigator: { language } });
}

function localeStore(storage: KeyValueStore) {
  return createLocaleStore({
    locales: ["en", "pl"] as const,
    fallbackLocale: "en",
    storage,
    storageKey: KEY,
  });
}

beforeEach(() => useDeviceLanguage("en-US"));
afterEach(() => vi.unstubAllGlobals());

describe("detectLocale", () => {
  it("matches the device language's prefix", () => {
    expect(detectLocale(["en", "pl"], "en", "pl-PL")).toBe("pl");
  });

  it("ignores case", () => {
    expect(detectLocale(["en", "pl"], "en", "PL")).toBe("pl");
  });

  it("falls back for an unsupported or missing language", () => {
    expect(detectLocale(["en", "pl"], "en", "de-DE")).toBe("en");
    expect(detectLocale(["en", "pl"], "en", undefined)).toBe("en");
  });
});

describe("createLocaleStore", () => {
  it("starts from the device language before anything is stored", () => {
    useDeviceLanguage("pl-PL");
    const store = localeStore(memoryStorage().storage);

    expect(store.getSnapshot()).toBe("pl");
  });

  it("persists the detected locale on the first run", async () => {
    useDeviceLanguage("pl-PL");
    const { storage, data } = memoryStorage();
    const store = localeStore(storage);

    await store.whenLoaded();

    expect(data.get(KEY)).toBe("pl");
  });

  it("lets a stored choice win over the device language", async () => {
    useDeviceLanguage("pl-PL");
    const store = localeStore(memoryStorage({ [KEY]: "en" }).storage);
    const listener = vi.fn();
    store.subscribe(listener);

    await store.whenLoaded();

    expect(store.getSnapshot()).toBe("en");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores an unsupported stored value", async () => {
    const store = localeStore(memoryStorage({ [KEY]: "xx" }).storage);

    await store.whenLoaded();

    expect(store.getSnapshot()).toBe("en");
  });

  it("keeps the guess when storage fails", async () => {
    useDeviceLanguage("pl-PL");
    const { storage } = memoryStorage();
    storage.get = () => Promise.reject(new Error("blocked"));
    const store = localeStore(storage);

    await store.whenLoaded();

    expect(store.getSnapshot()).toBe("pl");
  });

  it("stores and announces a new locale", async () => {
    const { storage, data } = memoryStorage();
    const store = localeStore(storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setLocale("pl");
    unsubscribe();
    store.setLocale("en");

    expect(store.getSnapshot()).toBe("en");
    expect(listener).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(data.get(KEY)).toBe("en"));
  });

  it("uses the fallback on the server", () => {
    vi.stubGlobal("window", undefined);
    const store = localeStore(memoryStorage().storage);

    expect(store.getSnapshot()).toBe("en");
    expect(store.getServerSnapshot()).toBe("en");
  });

  it("recognizes only supported locales", () => {
    const store = localeStore(memoryStorage().storage);

    expect(store.isLocale("pl")).toBe(true);
    expect(store.isLocale("de")).toBe(false);
    expect(store.isLocale(1)).toBe(false);
  });
});
