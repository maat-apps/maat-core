import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetIndexedDb } from "../reset-indexeddb";

// idb-store.ts caches its DB connection at module scope, so each test needs
// a fresh module instance — otherwise a connection closed by one test leaks
// into the next.
async function freshIdbStore() {
  vi.resetModules();
  return import("@/lib/idb-store");
}

beforeEach(async () => {
  await resetIndexedDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// A minimal fake IDBOpenDBRequest whose onsuccess/onupgradeneeded/onerror
// handlers this test drives by hand, to reach idb-store.ts's own error
// paths (its request.onerror / transaction.onerror / .onabort closures)
// without needing a real IndexedDB failure, which fake-indexeddb doesn't
// make easy to force on demand.
function fakeOpenRequest() {
  return {
    onupgradeneeded: null as (() => void) | null,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
    result: undefined as unknown,
    error: new Error("open failed"),
  };
}

describe("kvGet / kvSet", () => {
  it("returns undefined for a missing key", async () => {
    const idbStore = await freshIdbStore();
    await expect(idbStore.kvGet("missing")).resolves.toBeUndefined();
  });

  it("round-trips a value", async () => {
    const idbStore = await freshIdbStore();
    await idbStore.kvSet("key", { value: 1 });
    await expect(idbStore.kvGet("key")).resolves.toEqual({ value: 1 });
  });

  it("overwrites an existing value", async () => {
    const idbStore = await freshIdbStore();
    await idbStore.kvSet("key", "first");
    await idbStore.kvSet("key", "second");
    await expect(idbStore.kvGet("key")).resolves.toBe("second");
  });

  it("rejects when opening the database itself fails", async () => {
    const idbStore = await freshIdbStore();
    const request = fakeOpenRequest();
    vi.stubGlobal("indexedDB", { open: vi.fn(() => request) });

    const pending = idbStore.kvGet("key");
    request.onerror?.();

    await expect(pending).rejects.toBe(request.error);
  });

  it("closes the connection on a version change from another tab", async () => {
    const idbStore = await freshIdbStore();
    const close = vi.fn();
    const request = fakeOpenRequest();
    request.result = { onversionchange: null as (() => void) | null, close };
    vi.stubGlobal("indexedDB", { open: vi.fn(() => request) });

    const pending = idbStore.kvGet("key");
    request.onsuccess?.();
    await pending.catch(() => undefined);

    (
      request.result as { onversionchange: (() => void) | null }
    ).onversionchange?.();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
