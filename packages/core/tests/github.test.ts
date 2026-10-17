import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveKey, isEncryptedBlob, randomBytes } from "../src/crypto";
import {
  createRepoConnection,
  createRepoMirror,
  createRepoSync,
  formatJsonFile,
  GitHubError,
  mergeById,
  type MirrorCopy,
  parseJsonFile,
  parseRepo,
  readRepoFile,
  type RepoConnection,
  RepoConnectionError,
  RepoFileError,
  type RepoLocation,
  type SyncedIds,
  syncedIdsExtra,
  writeRepoFile,
} from "../src/github";
import { createLocalStore } from "../src/local";
import { createKeyHolder, type KeyHolder } from "../src/lock";
import { memoryStorage } from "./memory-storage";

const LOCATION: RepoLocation = {
  owner: "me",
  repo: "data",
  branch: "main",
  path: "dir/items.json",
  token: "secret",
};
const REPO = "https://api.github.com/repos/me/data";
const CONTENTS = `${REPO}/contents/dir/items.json`;

function base64(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

function decode(content: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(content), (char) => char.charCodeAt(0)),
  );
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function mockFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("Unexpected request");
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A repository with one file, answering the contents API like GitHub. */
function fakeRepo(initial: string | null) {
  const repo = {
    text: initial,
    sha: initial === null ? null : "v0",
    version: 0,
  };
  const puts: { message: string; sha?: string; branch?: string }[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).startsWith(CONTENTS) && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as {
        message: string;
        content: string;
        sha?: string;
        branch?: string;
      };
      puts.push(body);
      if ((body.sha ?? null) !== repo.sha) return json({}, 409);
      repo.version += 1;
      repo.text = decode(body.content);
      repo.sha = `v${repo.version}`;
      return json({});
    }
    if (String(url).startsWith(CONTENTS)) {
      return repo.text === null
        ? json({}, 404)
        : json({
            sha: repo.sha,
            encoding: "base64",
            content: base64(repo.text),
          });
    }
    if (String(url) === REPO) return json({});
    throw new Error(`Unexpected request ${String(url)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { repo, puts, fetchMock };
}

function testKey() {
  return deriveKey(randomBytes(32), randomBytes(16), "test-data-v1");
}

beforeEach(() => vi.stubGlobal("window", {}));
afterEach(() => vi.unstubAllGlobals());

describe("parseRepo", () => {
  it("splits owner/repo", () => {
    expect(parseRepo(" me/data ")).toEqual({ owner: "me", repo: "data" });
  });

  it("refuses anything else", () => {
    expect(parseRepo("me")).toBeNull();
    expect(parseRepo("me/data/more")).toBeNull();
  });
});

describe("readRepoFile", () => {
  it("reads the file's text and version from the branch", async () => {
    const fetchMock = mockFetch(
      json({ sha: "s1", encoding: "base64", content: base64("[]\nżółw") }),
    );

    await expect(readRepoFile(LOCATION)).resolves.toEqual({
      text: "[]\nżółw",
      sha: "s1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${CONTENTS}?ref=main`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
  });

  it("reads the default branch when none is set", async () => {
    const fetchMock = mockFetch(
      json({ sha: "s1", encoding: "base64", content: base64("x") }),
    );

    await readRepoFile({ ...LOCATION, branch: "" });

    expect(fetchMock).toHaveBeenCalledWith(CONTENTS, expect.anything());
  });

  it("reads a file over 1 MB from its blob", async () => {
    mockFetch(json({ sha: "big" }), json({ content: base64("large") }));

    await expect(readRepoFile(LOCATION)).resolves.toEqual({
      text: "large",
      sha: "big",
    });
  });

  it("returns null for a missing file in a readable repository", async () => {
    mockFetch(json({}, 404), json({}));

    await expect(readRepoFile(LOCATION)).resolves.toBeNull();
  });

  it("throws notFound for a repository the token can't see", async () => {
    mockFetch(json({}, 404), json({}, 404));

    await expect(readRepoFile(LOCATION)).rejects.toMatchObject({
      kind: "notFound",
    });
  });

  it.each([
    [json({}, 401), "unauthorized"],
    [json({}, 403), "unauthorized"],
    [json({}, 403, { "x-ratelimit-remaining": "0" }), "rateLimited"],
    [json({}, 429), "rateLimited"],
    [json({}, 500), "server"],
    [new TypeError("offline"), "network"],
  ] as const)("maps a failure to its kind (%#)", async (response, kind) => {
    mockFetch(response);

    await expect(readRepoFile(LOCATION)).rejects.toMatchObject({ kind });
  });
});

describe("writeRepoFile", () => {
  it("commits the text over the version it replaces", async () => {
    const fetchMock = mockFetch(json({}));

    await writeRepoFile(LOCATION, "żółw", "s1", "Update");

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("PUT");
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    expect(decode(body.content)).toBe("żółw");
    expect(body).toMatchObject({
      message: "Update",
      branch: "main",
      sha: "s1",
    });
  });

  it("creates a new file on the default branch", async () => {
    const fetchMock = mockFetch(json({}));

    await writeRepoFile({ ...LOCATION, branch: "" }, "x", null, "Create");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as object;
    expect(body).not.toHaveProperty("sha");
    expect(body).not.toHaveProperty("branch");
  });

  it("reports a stale version as a conflict", async () => {
    mockFetch(json({}, 409));

    await expect(
      writeRepoFile(LOCATION, "x", "old", "m"),
    ).rejects.toMatchObject({ kind: "conflict" });
  });
});

type Item = { id: string; updatedAt: string; name: string; note?: string };

const FORMAT = {
  compare: (a: Item, b: Item) =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  fields: ["id", "name", "note", "updatedAt"] as const,
};

const FILE_MESSAGES = {
  notJson: "not json",
  notList: "not a list",
  unreadable: (count: number) => `${count} unreadable`,
};

function parseItems(values: unknown[]): Item[] {
  return values.filter(
    (value): value is Item =>
      typeof (value as Item).id === "string" &&
      typeof (value as Item).name === "string",
  );
}

const parseFile = (text: string) =>
  parseJsonFile(text, parseItems, FILE_MESSAGES);
const formatFile = (items: Item[]) => formatJsonFile(items, FORMAT);

function item(
  id: string,
  name: string,
  updatedAt = "2026-10-01T00:00:00.000Z",
): Item {
  return { id, name, updatedAt };
}

describe("formatJsonFile / parseJsonFile", () => {
  it("writes sorted items with fixed fields, two-space indented, ending in a newline", () => {
    const text = formatFile([
      { ...item("2", "b"), note: undefined },
      { updatedAt: "t", note: "n", name: "a", id: "1" },
    ]);

    expect(text).toBe(
      '[\n  {\n    "id": "1",\n    "name": "a",\n    "note": "n",\n    "updatedAt": "t"\n  },\n' +
        '  {\n    "id": "2",\n    "name": "b",\n    "updatedAt": "2026-10-01T00:00:00.000Z"\n  }\n]\n',
    );
  });

  it("reads back what it wrote", () => {
    const items = [item("1", "a"), item("2", "b")];

    expect(parseFile(formatFile(items))).toEqual(items);
  });

  it.each([
    ["{", "not json"],
    ["{}", "not a list"],
    ['[{"id":"1","name":"a"},{"id":2}]', "1 unreadable"],
  ])("refuses a file it can't fully read: %s", (text, message) => {
    expect(() => parseFile(text)).toThrow(new RepoFileError(message));
  });
});

describe("mergeById", () => {
  const old = "2026-10-01T00:00:00.000Z";
  const newer = "2026-10-02T00:00:00.000Z";

  it("adds items new in the file and keeps items new here", () => {
    const result = mergeById(
      [item("here", "h")],
      [item("there", "t")],
      new Set(),
    );

    expect(result.items.map((i) => i.id).sort()).toEqual(["here", "there"]);
    expect(result).toMatchObject({ added: 1, updated: 0, removed: 0 });
  });

  it("drops items deleted on either side since the last sync", () => {
    const result = mergeById(
      [item("kept", "k"), item("gone-there", "g")],
      [item("kept", "k"), item("gone-here", "h")],
      new Set(["kept", "gone-there", "gone-here"]),
    );

    expect(result.items.map((i) => i.id)).toEqual(["kept"]);
    expect(result).toMatchObject({ added: 0, removed: 1 });
  });

  it("keeps the newer edit of an item changed on both sides", () => {
    const local = { ...item("1", "local", newer) };
    const remote = { ...item("1", "remote", old) };

    expect(mergeById([local], [remote], new Set(["1"])).items).toEqual([local]);
    const flipped = mergeById(
      [{ ...local, updatedAt: old }],
      [{ ...remote, updatedAt: newer }],
      new Set(["1"]),
    );
    expect(flipped.items[0].name).toBe("remote");
    expect(flipped.updated).toBe(1);
  });

  it("pairs an unsynced item with the file's under another id, taking its id", () => {
    const result = mergeById(
      [item("local-id", "same")],
      [item("file-id", "same")],
      new Set(),
      { pair: (a, b) => a.name === b.name },
    );

    expect(result.items.map((i) => i.id)).toEqual(["file-id"]);
    expect(result).toMatchObject({ added: 0, updated: 1 });
  });

  it("uses the app's combine and sameness", () => {
    const result = mergeById(
      [item("1", "a")],
      [item("1", "b")],
      new Set(["1"]),
      {
        combine: (local) => ({ ...local, note: "combined" }),
        same: () => true,
      },
    );

    expect(result.items[0].note).toBe("combined");
    expect(result.updated).toBe(0);
  });
});

async function unlockedConnection(storage = memoryStorage().storage) {
  const keyHolder = createKeyHolder();
  keyHolder.set(await testKey());
  const connection = createRepoConnection<SyncedIds>({
    storage,
    key: "github",
    keyHolder,
    encrypts: async () => true,
    extra: syncedIdsExtra,
  });
  return { connection, keyHolder, storage };
}

describe("createRepoConnection", () => {
  it("connects after checking access, storing the connection encrypted", async () => {
    const { storage, data } = memoryStorage();
    fakeRepo(null);
    const { connection } = await unlockedConnection(storage);
    const onChange = vi.fn();
    connection.subscribe(onChange);

    await connection.connect(LOCATION);

    expect(connection.get()).toEqual({ ...LOCATION, syncedIds: [] });
    expect(isEncryptedBlob(data.get("github"))).toBe(true);
    expect(onChange).toHaveBeenCalled();
    expect(connection.getServerSnapshot()).toBeNull();
  });

  it("refuses a token the repository doesn't accept", async () => {
    mockFetch(json({}, 401));
    const { connection } = await unlockedConnection();

    await expect(connection.connect(LOCATION)).rejects.toBeInstanceOf(
      GitHubError,
    );
    expect(connection.get()).toBeNull();
  });

  it("refuses to store a token without an encrypting lock", async () => {
    const connection = createRepoConnection({
      storage: memoryStorage().storage,
      key: "github",
      keyHolder: createKeyHolder(),
      encrypts: async () => false,
      extra: syncedIdsExtra,
    });

    expect(connection.canConnect()).toBe(false);
    expect(connection.isReady()).toBe(false);
    await expect(connection.connect(LOCATION)).rejects.toBeInstanceOf(
      RepoConnectionError,
    );
    await connection.whenLoaded();
    expect(connection.get()).toBeNull();
    expect(connection.isReady()).toBe(true);
  });

  it("loads a stored connection once the key is set", async () => {
    const { storage } = memoryStorage();
    const first = await unlockedConnection(storage);
    fakeRepo(null);
    await first.connection.connect(LOCATION);

    const keyHolder: KeyHolder = createKeyHolder();
    const again = createRepoConnection({
      storage,
      key: "github",
      keyHolder,
      encrypts: async () => true,
      extra: syncedIdsExtra,
    });
    const loading = again.whenLoaded();
    keyHolder.set(first.keyHolder.get());
    await loading;

    expect(again.get()).toEqual({ ...LOCATION, syncedIds: [] });
  });

  it("ignores a stored connection it can't read", async () => {
    const { storage } = memoryStorage({ github: { owner: "plain" } });
    const { connection } = await unlockedConnection(storage);

    await connection.whenLoaded();

    expect(connection.get()).toBeNull();
  });

  it("re-encrypts on rewrite, and deletes once the key is gone", async () => {
    const { storage, data } = memoryStorage();
    fakeRepo(null);
    const { connection, keyHolder } = await unlockedConnection(storage);
    await connection.connect(LOCATION);
    const before = data.get("github");

    keyHolder.set(await testKey());
    await connection.rewrite();
    expect(data.get("github")).not.toEqual(before);

    keyHolder.set(null);
    await connection.rewrite();
    expect(connection.get()).toBeNull();
    expect(data.has("github")).toBe(false);
  });

  it("erases the connection", async () => {
    const { storage, data } = memoryStorage();
    fakeRepo(null);
    const { connection } = await unlockedConnection(storage);
    await connection.connect(LOCATION);

    await connection.erase();

    expect(data.has("github")).toBe(false);
  });

  it("can't save without a key", async () => {
    const connection = createRepoConnection({
      storage: memoryStorage().storage,
      key: "github",
      keyHolder: createKeyHolder(),
      encrypts: async () => false,
      extra: syncedIdsExtra,
    });

    await expect(
      connection.save({ ...LOCATION, syncedIds: [] }),
    ).rejects.toBeInstanceOf(RepoConnectionError);
  });
});

function mirrorStore() {
  return createLocalStore<MirrorCopy<Item[]>>({
    storage: memoryStorage().storage,
    key: "copy",
    empty: { data: null, syncedAt: null },
    parse: (stored) => stored as MirrorCopy<Item[]>,
  });
}

async function connected(): Promise<RepoConnection<SyncedIds>> {
  const { connection } = await unlockedConnection();
  await connection.connect(LOCATION);
  return connection;
}

describe("createRepoMirror", () => {
  const now = () => new Date("2026-10-17T10:00:00.000Z");

  it("downloads the file into the local copy", async () => {
    fakeRepo(formatFile([item("1", "a")]));
    const store = mirrorStore();
    const mirror = createRepoMirror({
      connection: await connected(),
      store,
      parseFile,
      now,
    });
    const onStatus = vi.fn();
    mirror.subscribeStatus(onStatus);

    await mirror.sync();

    expect(store.getSnapshot()).toEqual({
      data: [item("1", "a")],
      syncedAt: "2026-10-17T10:00:00.000Z",
    });
    expect(mirror.getStatus()).toEqual({ syncing: false, error: null });
    expect(onStatus).toHaveBeenCalledTimes(2);
    expect(mirror.getServerStatus()).toEqual({ syncing: false, error: null });
  });

  it("keeps the last copy and says why a download failed", async () => {
    const { repo } = fakeRepo(formatFile([item("1", "a")]));
    const store = mirrorStore();
    const mirror = createRepoMirror({
      connection: await connected(),
      store,
      parseFile,
      now,
    });
    await mirror.sync();

    repo.text = "{";
    await mirror.sync();
    expect(mirror.getStatus().error).toBe("invalid");

    repo.text = null;
    await mirror.sync();
    expect(mirror.getStatus().error).toBe("notFound");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );
    await mirror.sync();
    expect(mirror.getStatus().error).toBe("network");

    expect(store.getSnapshot().data).toEqual([item("1", "a")]);
  });

  it("reports anything else as a server error", async () => {
    fakeRepo(formatFile([item("1", "a")]));
    const store = mirrorStore();
    vi.spyOn(store, "replace").mockRejectedValue(new Error("odd"));
    const mirror = createRepoMirror({
      connection: await connected(),
      store,
      parseFile,
    });

    await mirror.sync();

    expect(mirror.getStatus().error).toBe("server");
  });

  it("does nothing without a connection", async () => {
    const fetchMock = mockFetch();
    const { connection } = await unlockedConnection();
    const mirror = createRepoMirror({
      connection,
      store: mirrorStore(),
      parseFile,
    });

    await mirror.sync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("syncs on start once per run", async () => {
    const { fetchMock } = fakeRepo(formatFile([]));
    const mirror = createRepoMirror({
      connection: await connected(),
      store: mirrorStore(),
      parseFile,
    });
    fetchMock.mockClear();

    await mirror.syncOnStart();
    await mirror.syncOnStart();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createRepoSync", () => {
  function itemsStore() {
    return createLocalStore<Item[]>({
      storage: memoryStorage().storage,
      key: "items",
      empty: [],
      parse: (stored) => stored as Item[],
    });
  }

  async function setUp(initial: string | null, local: Item[] = []) {
    const fake = fakeRepo(initial);
    const connection = await connected();
    const store = itemsStore();
    await store.replace(local);
    const sync = createRepoSync({
      connection,
      store,
      file: { format: formatFile, parse: parseFile },
      commitMessage: "Update from the app",
    });
    return { ...fake, connection, store, sync };
  }

  it("creates the file from this device's items", async () => {
    const { repo, connection, sync } = await setUp(null, [item("1", "a")]);

    await expect(sync.sync()).resolves.toEqual({
      added: 0,
      updated: 0,
      removed: 0,
      pushed: true,
    });

    expect(repo.text).toBe(formatFile([item("1", "a")]));
    expect(connection.get()?.syncedIds).toEqual(["1"]);
  });

  it("takes the file's items without pushing an unchanged file", async () => {
    const text = formatFile([item("1", "a")]);
    const { puts, store, sync } = await setUp(text);

    await expect(sync.sync()).resolves.toMatchObject({
      added: 1,
      pushed: false,
    });

    expect(puts).toEqual([]);
    expect(store.getSnapshot()).toEqual([item("1", "a")]);
  });

  it("starts over once when the file changes meanwhile", async () => {
    const { repo, puts, sync } = await setUp(formatFile([]), [item("1", "a")]);
    const realFetch = globalThis.fetch;
    let raced = false;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        if (init?.method === "PUT" && !raced) {
          raced = true;
          repo.text = formatFile([item("2", "b")]);
          repo.sha = "elsewhere";
        }
        return realFetch(url, init);
      }),
    );

    await expect(sync.sync()).resolves.toMatchObject({
      added: 1,
      pushed: true,
    });

    expect(puts).toHaveLength(2);
    expect(parseFile(repo.text ?? "").map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("gives up after a second conflict", async () => {
    const { repo, sync } = await setUp(formatFile([]), [item("1", "a")]);
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        if (init?.method === "PUT") repo.sha = `moved-${Math.random()}`;
        return realFetch(url, init);
      }),
    );

    await expect(sync.sync()).rejects.toMatchObject({ kind: "conflict" });
  });

  it("throws without a connection", async () => {
    const { connection } = await unlockedConnection();
    const sync = createRepoSync({
      connection,
      store: itemsStore(),
      file: { format: formatFile, parse: parseFile },
      commitMessage: "m",
    });

    await expect(sync.sync()).rejects.toBeInstanceOf(RepoConnectionError);
  });

  it("passes other write failures on", async () => {
    const { sync } = await setUp(null, [item("1", "a")]);
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) =>
        init?.method === "PUT" ? json({}, 401) : realFetch(url, init),
      ),
    );

    await expect(sync.sync()).rejects.toMatchObject({ kind: "unauthorized" });
  });
});
