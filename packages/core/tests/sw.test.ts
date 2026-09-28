import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerAppWorker,
  SKIP_WAITING_MESSAGE,
  type WorkerScope,
} from "../src/sw";

const ORIGIN = "https://example.test";
const BASE = "/app/";

// --- A minimal service-worker environment ----------------------------------

class FakeCache {
  entries = new Map<string, Response>();

  async addAll(urls: string[]) {
    for (const url of urls)
      this.entries.set(url, new Response(`cached ${url}`));
  }

  async put(request: Request, response: Response) {
    this.entries.set(new URL(request.url).pathname, response);
  }
}

function fakeCaches() {
  const stores = new Map<string, FakeCache>();
  return {
    stores,
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name)!;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
    async match(request: Request | string) {
      const path =
        typeof request === "string" ? request : new URL(request.url).pathname;
      for (const cache of stores.values()) {
        const hit = cache.entries.get(path);
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
}

type Listener = (event: never) => void;

function fakeScope() {
  const listeners = new Map<string, Listener>();
  const scope = {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, listener);
    },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };
  return { scope: scope as unknown as WorkerScope, listeners, raw: scope };
}

async function dispatchExtendable(
  listeners: Map<string, Listener>,
  type: "install" | "activate",
) {
  const pending: Promise<unknown>[] = [];
  (listeners.get(type) as (event: unknown) => void)({
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  });
  await Promise.all(pending);
}

function dispatchFetch(
  listeners: Map<string, Listener>,
  path: string,
  init: { mode?: RequestMode; method?: string } = {},
): Promise<Response> | undefined {
  let responded: Promise<Response> | undefined;
  const request = new Request(`${ORIGIN}${path}`, { method: init.method });
  Object.defineProperty(request, "mode", { value: init.mode ?? "cors" });
  (listeners.get("fetch") as (event: unknown) => void)({
    request,
    respondWith: (response: Promise<Response>) => {
      responded = response;
    },
    waitUntil: () => {},
  });
  return responded;
}

let cacheStorage: ReturnType<typeof fakeCaches>;
let network: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cacheStorage = fakeCaches();
  network = vi.fn(
    async (request: Request) =>
      new Response(`network ${new URL(request.url).pathname}`),
  );
  vi.stubGlobal("caches", cacheStorage);
  vi.stubGlobal("fetch", network);
});

afterEach(() => vi.unstubAllGlobals());

function setup(cacheName = "app-v2") {
  const { scope, listeners, raw } = fakeScope();
  registerAppWorker(scope, {
    cacheName,
    baseUrl: BASE,
    manifest: [
      { url: `${BASE}assets/index-abc.js`, revision: null },
      `${BASE}index.html`,
    ],
  });
  return { listeners, raw };
}

// --- Tests -------------------------------------------------------------------

describe("install", () => {
  it("precaches the shell and every manifest entry", async () => {
    const { listeners } = setup();

    await dispatchExtendable(listeners, "install");

    expect([...cacheStorage.stores.get("app-v2")!.entries.keys()]).toEqual([
      BASE,
      `${BASE}assets/index-abc.js`,
      `${BASE}index.html`,
    ]);
  });
});

describe("activate", () => {
  it("deletes every other cache and claims clients", async () => {
    await cacheStorage.open("app-v1");
    await cacheStorage.open("app-v2");
    const { listeners, raw } = setup("app-v2");

    await dispatchExtendable(listeners, "activate");

    expect([...cacheStorage.stores.keys()]).toEqual(["app-v2"]);
    expect(raw.clients.claim).toHaveBeenCalled();
  });
});

describe("fetch", () => {
  it("serves assets cache-first", async () => {
    const { listeners } = setup();
    await dispatchExtendable(listeners, "install");

    const response = await dispatchFetch(
      listeners,
      `${BASE}assets/index-abc.js`,
    );

    expect(await response!.text()).toBe(`cached ${BASE}assets/index-abc.js`);
    expect(network).not.toHaveBeenCalled();
  });

  it("fetches and caches an asset that isn't cached yet", async () => {
    const { listeners } = setup();

    const response = await dispatchFetch(listeners, `${BASE}late.js`);

    expect(await response!.text()).toBe(`network ${BASE}late.js`);
    await vi.waitFor(async () =>
      expect(await cacheStorage.match(`${BASE}late.js`)).toBeDefined(),
    );
  });

  it("serves navigations network-first", async () => {
    const { listeners } = setup();
    await dispatchExtendable(listeners, "install");

    const response = await dispatchFetch(listeners, BASE, {
      mode: "navigate",
    });

    expect(await response!.text()).toBe(`network ${BASE}`);
  });

  it("serves manifest.json network-first", async () => {
    const { listeners } = setup();

    const response = await dispatchFetch(listeners, `${BASE}manifest.json`);

    expect(network).toHaveBeenCalled();
    expect(await response!.text()).toBe(`network ${BASE}manifest.json`);
  });

  it("falls back to the cached shell for an offline navigation", async () => {
    const { listeners } = setup();
    await dispatchExtendable(listeners, "install");
    network.mockRejectedValue(new TypeError("offline"));

    const response = await dispatchFetch(listeners, `${BASE}some/route`, {
      mode: "navigate",
    });

    expect(await response!.text()).toBe(`cached ${BASE}`);
  });

  it("doesn't cache a failed response", async () => {
    const { listeners } = setup();
    network.mockResolvedValue(new Response("nope", { status: 500 }));

    await dispatchFetch(listeners, `${BASE}broken.js`);

    expect(await cacheStorage.match(`${BASE}broken.js`)).toBeUndefined();
  });

  it("ignores non-GET requests", () => {
    const { listeners } = setup();

    expect(
      dispatchFetch(listeners, `${BASE}api`, { method: "POST" }),
    ).toBeUndefined();
  });
});

describe("message", () => {
  it("takes over only on the skip-waiting message", () => {
    const { listeners, raw } = setup();
    const onMessage = listeners.get("message") as (event: unknown) => void;

    onMessage({ data: { type: "SOMETHING_ELSE" } });
    onMessage({ data: null });
    expect(raw.skipWaiting).not.toHaveBeenCalled();

    onMessage({ data: SKIP_WAITING_MESSAGE });
    expect(raw.skipWaiting).toHaveBeenCalledTimes(1);
  });
});
