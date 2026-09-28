// Manual "force update" for the PWA — the service worker (src/sw.ts)
// deliberately never calls skipWaiting() on its own, so a new deploy just
// sits waiting until this is called (e.g. from a Settings screen's "Update"
// button). See trainer's or routines' own app-update.ts for the fuller
// version of this once this app has its own local data worth snapshotting
// before an update: wrap this in a step that backs up that data first (an
// export/import format is a good place to start) and expose a matching
// restore path, the same way those two apps do.

/**
 * Drops every cache, lets a waiting worker take over, and reloads. Cached
 * responses are what make an installed PWA go stale, so clearing them is
 * the part that actually does the work.
 */
export async function updateApp(): Promise<void> {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    } catch {
      // An unregistrable worker should not block the reload below.
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // Same again: fall through to the reload.
    }
  }

  window.location.reload();
}
