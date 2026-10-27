import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isShareTargetRequest,
  receiveSharedBackup,
  SHARE_TARGET_FIELD,
  takeSharedBackup,
} from "../src/share-target";

const BASE = "/app/";
const ORIGIN = "https://example.test";
const OPTIONS = { baseUrl: BASE, cacheName: "app-shared-backup" };

// A Map keyed by URL is all share-target.ts uses of the Cache API.
function fakeCaches() {
  const entries = new Map<string, Response>();
  const cache = {
    put: vi.fn(async (url: string, response: Response) => {
      entries.set(url, response);
    }),
    match: vi.fn(async (url: string) => entries.get(url)),
    delete: vi.fn(async (url: string) => entries.delete(url)),
  };
  const open = vi.fn(async () => cache);
  vi.stubGlobal("caches", { open });
  return { entries, open };
}

function shareRequest(body: FormData, path = `${BASE}share-target`) {
  return {
    method: "POST",
    url: `${ORIGIN}${path}`,
    formData: async () => body,
  } as unknown as Request;
}

afterEach(() => vi.unstubAllGlobals());

describe("isShareTargetRequest", () => {
  it("matches a POST to the share target path", () => {
    expect(isShareTargetRequest(shareRequest(new FormData()), BASE)).toBe(true);
  });

  it("ignores a GET to the same path", () => {
    const request = new Request(`${ORIGIN}${BASE}share-target`);
    expect(isShareTargetRequest(request, BASE)).toBe(false);
  });

  it("ignores a POST elsewhere", () => {
    const request = shareRequest(new FormData(), `${BASE}other`);
    expect(isShareTargetRequest(request, BASE)).toBe(false);
  });
});

describe("receiveSharedBackup / takeSharedBackup", () => {
  let cacheStorage: ReturnType<typeof fakeCaches>;

  beforeEach(() => {
    cacheStorage = fakeCaches();
  });

  it("parks the shared file in its cache and redirects home", async () => {
    const body = new FormData();
    body.append(SHARE_TARGET_FIELD, new File(['{"app":"x"}'], "backup.txt"));

    const response = await receiveSharedBackup(shareRequest(body), OPTIONS);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      `${ORIGIN}${BASE}?shared-backup`,
    );
    expect(cacheStorage.open).toHaveBeenCalledWith("app-shared-backup");
    expect(await takeSharedBackup(OPTIONS)).toBe('{"app":"x"}');
  });

  it("offers a shared file only once", async () => {
    cacheStorage.entries.set(`${BASE}shared-backup`, new Response("backup"));

    expect(await takeSharedBackup(OPTIONS)).toBe("backup");
    expect(await takeSharedBackup(OPTIONS)).toBeNull();
  });

  it("still redirects when the share carries no file", async () => {
    const body = new FormData();
    body.append(SHARE_TARGET_FIELD, "not a file");

    const response = await receiveSharedBackup(shareRequest(body), OPTIONS);

    expect(response.status).toBe(303);
    expect(cacheStorage.entries.size).toBe(0);
  });
});

describe("takeSharedBackup", () => {
  it("returns null without the Cache API", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await takeSharedBackup(OPTIONS)).toBeNull();
  });
});
