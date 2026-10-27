// Web Share Target for backups: an installed app shows up in Android's share
// sheet (public/manifest.json's `share_target`), so a backup can be sent
// straight from a cloud drive app the file picker can't reach (e.g. Proton
// Drive). The share arrives as a POST the static host can't answer, so the
// service worker (./sw's `shareTarget` option) parks the file in a cache and
// redirects home with `?shared-backup`, where the app takes it and asks
// before importing (@maat-apps/ui/shared-backup-import).
//
// The manifest's part, with the app's base path:
//
//   "share_target": {
//     "action": "/my-app/share-target",
//     "method": "POST",
//     "enctype": "multipart/form-data",
//     "params": { "files": [{ "name": "backup",
//       "accept": ["application/json", ".json", "text/plain", ".txt"] }] }
//   }

/** Under the app's base URL; must match `share_target.action`. */
export const SHARE_TARGET_PATH = "share-target";
/** Must match `share_target.params.files[0].name`. */
export const SHARE_TARGET_FIELD = "backup";
/** The query parameter home is opened with once a file is parked. */
export const SHARED_BACKUP_PARAM = "shared-backup";

export type SharedBackupOptions = {
  /** `import.meta.env.BASE_URL`. */
  baseUrl: string;
  /**
   * Where the file waits, e.g. `"my-app-shared-backup"` — the worker's
   * activation keeps this cache (./sw), so an update doesn't lose a share.
   */
  cacheName: string;
};

function entryUrl(baseUrl: string): string {
  return `${baseUrl}${SHARED_BACKUP_PARAM}`;
}

export function isShareTargetRequest(
  request: Request,
  baseUrl: string,
): boolean {
  return (
    request.method === "POST" &&
    new URL(request.url).pathname === `${baseUrl}${SHARE_TARGET_PATH}`
  );
}

/** The service worker's answer to the share: park the file, go home. */
export async function receiveSharedBackup(
  request: Request,
  { baseUrl, cacheName }: SharedBackupOptions,
): Promise<Response> {
  // A malformed share still goes home rather than to a failed response.
  const form = await request.formData().catch(() => null);
  const file = form?.get(SHARE_TARGET_FIELD) ?? null;
  if (file !== null && typeof file !== "string") {
    const cache = await caches.open(cacheName);
    await cache.put(entryUrl(baseUrl), new Response(await file.text()));
  }
  return Response.redirect(
    new URL(`${baseUrl}?${SHARED_BACKUP_PARAM}`, request.url).href,
    303,
  );
}

/** The shared file's text, removed so it's offered only once; or null. */
export async function takeSharedBackup({
  baseUrl,
  cacheName,
}: SharedBackupOptions): Promise<string | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(cacheName);
  const response = await cache.match(entryUrl(baseUrl));
  if (!response) return null;
  await cache.delete(entryUrl(baseUrl));
  return response.text();
}
