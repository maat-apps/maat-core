// The service worker every maat app runs, as a factory. Each app keeps a
// tiny `src/sw.ts` entry — vite-plugin-pwa's injectManifest needs a file to
// compile and substitute `self.__WB_MANIFEST` into — that just calls
// `registerAppWorker(self, { ... })`.
//
// Strategy: precache the app shell and every build asset on install;
// network-first for navigations and manifest.json (a deploy or manifest edit
// lands on the next launch), cache-first for everything else (Vite's assets
// are content-hashed). Only the app's own origin: a request to another
// server (a cover image, a search API) goes straight to the network — the
// app decides what of it to keep, and cache-first would freeze API answers
// and fill the cache with images forever. A new worker waits until the app sends
// SKIP_WAITING_MESSAGE, so an open tab never loses its loaded chunks.

/** What vite-plugin-pwa's injectManifest puts in `self.__WB_MANIFEST`. */
export type PrecacheManifest = Array<
  { url: string; revision: string | null } | string
>;

/** The message an app posts to a waiting worker to make it take over. */
export const SKIP_WAITING_MESSAGE = { type: "SKIP_WAITING" } as const;

// The slice of ServiceWorkerGlobalScope this uses. Structural so the package
// compiles against DOM types; an app's worker passes its real `self`.
type ExtendableEventLike = { waitUntil(promise: Promise<unknown>): void };
type FetchEventLike = ExtendableEventLike & {
  request: Request;
  respondWith(response: Promise<Response>): void;
};
type MessageEventLike = { data: unknown };

export type WorkerScope = {
  addEventListener(
    type: "install" | "activate",
    listener: (event: ExtendableEventLike) => void,
  ): void;
  addEventListener(
    type: "fetch",
    listener: (event: FetchEventLike) => void,
  ): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEventLike) => void,
  ): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: { origin: string };
};

export type AppWorkerOptions = {
  /**
   * Bump it whenever the app shell changes (e.g. `"my-app-v2"`): activating
   * a worker deletes every cache with a different name.
   */
  cacheName: string;
  /** `self.__WB_MANIFEST`. */
  manifest: PrecacheManifest;
  /**
   * `import.meta.env.BASE_URL` — never hardcoded, so a build under another
   * base path (e.g. a PR preview) caches and falls back to its own shell.
   */
  baseUrl: string;
};

function isSkipWaiting(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === SKIP_WAITING_MESSAGE.type
  );
}

export function registerAppWorker(
  scope: WorkerScope,
  { cacheName, manifest, baseUrl }: AppWorkerOptions,
): void {
  const precacheUrls = manifest.map((entry) =>
    typeof entry === "string" ? entry : entry.url,
  );

  function putInCache(request: Request, response: Response): void {
    const copy = response.clone();
    caches
      .open(cacheName)
      .then((cache) => cache.put(request, copy))
      .catch(() => undefined);
  }

  function networkFirst(request: Request): Promise<Response> {
    return fetch(request)
      .then((response) => {
        if (response.ok) putInCache(request, response);
        return response;
      })
      .catch(
        () =>
          caches
            .match(request)
            .then(
              (cached) => cached ?? caches.match(baseUrl),
            ) as Promise<Response>,
      );
  }

  function cacheFirst(request: Request): Promise<Response> {
    return caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) putInCache(request, response);
          return response;
        }),
    );
  }

  scope.addEventListener("install", (event) => {
    event.waitUntil(
      caches
        .open(cacheName)
        .then((cache) => cache.addAll([baseUrl, ...precacheUrls])),
    );
    // Deliberately no skipWaiting() here — see SKIP_WAITING_MESSAGE.
  });

  scope.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== cacheName)
              .map((key) => caches.delete(key)),
          ),
        ),
    );
    // Safe because skipWaiting is gated: activation only happens once this
    // worker has actually won, so claiming doesn't yank a mid-session tab.
    void scope.clients.claim();
  });

  scope.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const url = new URL(event.request.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.origin !== scope.location.origin) return;

    // manifest.json never changes URL when its content does, so cache-first
    // would serve a stale name/icon until the next cacheName bump.
    event.respondWith(
      event.request.mode === "navigate" ||
        url.pathname === `${baseUrl}manifest.json`
        ? networkFirst(event.request)
        : cacheFirst(event.request),
    );
  });

  scope.addEventListener("message", (event) => {
    if (isSkipWaiting(event.data)) void scope.skipWaiting();
  });
}
