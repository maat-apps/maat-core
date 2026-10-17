import { decryptJson, encryptJson, isEncryptedBlob } from "./crypto";
import type { LocalStore, LockDataPart } from "./local";
import type { KeyHolder } from "./lock";
import type { KeyValueStore } from "./storage";

// The GitHub repository storage pattern (maat-core/docs/storage-github.md):
// an app's data as one JSON file in the user's own repository, on top of
// the local pattern (`/local`) — the local copy stays, so the app works
// offline. One file over the REST contents API, straight from the browser
// (api.github.com allows cross-origin requests), with a fine-grained token
// the user pastes in: GitHub's sign-in flows need a server-side secret no
// app here has. The connection holding that token is only ever stored
// encrypted with the app lock's key.

// --- Client -------------------------------------------------------------------

export type RepoLocation = {
  owner: string;
  repo: string;
  /** Empty for the repository's default branch. */
  branch: string;
  /** The file's path inside the repository. */
  path: string;
  token: string;
};

export type RepoFile = { text: string; sha: string };

export type GitHubErrorKind =
  | "unauthorized"
  | "notFound"
  /** The file changed since it was read (a stale `sha`). */
  | "conflict"
  | "rateLimited"
  | "server"
  | "network"
  /** The file isn't what the app expects (`RepoFileError` from its parser). */
  | "invalid";

export class GitHubError extends Error {
  readonly kind: GitHubErrorKind;

  constructor(
    kind: GitHubErrorKind,
    message = `GitHub request failed: ${kind}`,
  ) {
    super(message);
    this.kind = kind;
  }
}

/** Thrown by a file parser for a file it can't read; `kind` is "invalid". */
export class RepoFileError extends GitHubError {
  constructor(message: string) {
    super("invalid", message);
  }
}

const API = "https://api.github.com";
const REPO_PATTERN = /^([\w.-]+)\/([\w.-]+)$/;

/** `"owner/repo"` → its parts, or null when it isn't one. */
export function parseRepo(
  value: string,
): Pick<RepoLocation, "owner" | "repo"> | null {
  const match = REPO_PATTERN.exec(value.trim());
  return match ? { owner: match[1], repo: match[2] } : null;
}

function repoUrl({ owner, repo }: RepoLocation): string {
  return `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function contentsUrl(location: RepoLocation): string {
  const path = location.path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `${repoUrl(location)}/contents/${path}`;
}

function errorKind(response: Response): GitHubErrorKind {
  const { status } = response;
  if (status === 429) return "rateLimited";
  if (status === 403) {
    return response.headers.get("x-ratelimit-remaining") === "0"
      ? "rateLimited"
      : "unauthorized";
  }
  if (status === 401) return "unauthorized";
  // Also what a token without access to a private repository gets.
  if (status === 404) return "notFound";
  if (status === 409) return "conflict";
  return "server";
}

async function request(
  location: RepoLocation,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${location.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch {
    throw new GitHubError("network");
  }
  if (!response.ok) throw new GitHubError(errorKind(response));
  return response;
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  // In chunks: spreading a whole large file into one call overflows the stack.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

type ContentsResponse = { sha: string; content?: string; encoding?: string };

/**
 * The file, or `null` when the repository is readable but the file isn't
 * there. Throws `GitHubError` otherwise.
 */
export async function readRepoFile(
  location: RepoLocation,
): Promise<RepoFile | null> {
  let response: Response;
  try {
    const ref = location.branch
      ? `?ref=${encodeURIComponent(location.branch)}`
      : "";
    response = await request(location, `${contentsUrl(location)}${ref}`);
  } catch (error) {
    if (!(error instanceof GitHubError) || error.kind !== "notFound") {
      throw error;
    }
    // Tell a missing file from a repository the token can't see.
    await request(location, repoUrl(location));
    return null;
  }
  const file = (await response.json()) as ContentsResponse;
  if (file.encoding === "base64" && file.content !== undefined) {
    return { text: decodeBase64(file.content), sha: file.sha };
  }
  // Over 1 MB the contents API leaves the content out; the blob has it.
  const blob = (await (
    await request(location, `${repoUrl(location)}/git/blobs/${file.sha}`)
  ).json()) as { content: string };
  return { text: decodeBase64(blob.content), sha: file.sha };
}

/** Commits `text` as the file; `sha` is the version it replaces (`null`: a new file). */
export async function writeRepoFile(
  location: RepoLocation,
  text: string,
  sha: string | null,
  message: string,
): Promise<void> {
  await request(location, contentsUrl(location), {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: encodeBase64(text),
      ...(location.branch && { branch: location.branch }),
      ...(sha !== null && { sha }),
    }),
  });
}

// --- File format --------------------------------------------------------------

export type JsonFileFormat<I> = {
  /** The file's order — make it total (end on an id), so it never flips. */
  compare: (a: I, b: I) => number;
  /** Which fields go in the file, in this order; empty ones are left out. */
  fields: readonly (keyof I)[];
};

/** `item` as the file holds it: `fields` in order, `undefined` ones left out. */
export function pickFields<I>(
  item: I,
  fields: readonly (keyof I)[],
): Partial<I> {
  const picked: Partial<I> = {};
  for (const field of fields) {
    if (item[field] !== undefined) picked[field] = item[field];
  }
  return picked;
}

/**
 * The deterministic file: sorted, fixed field order, two-space indented,
 * ending in a newline — so a commit's diff shows exactly what changed.
 */
export function formatJsonFile<I>(
  items: I[],
  format: JsonFileFormat<I>,
): string {
  const sorted = [...items]
    .sort(format.compare)
    .map((item) => pickFields(item, format.fields));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/**
 * The file's items. Throws `RepoFileError` rather than dropping an item it
 * can't read: a two-way sync writes the file back and would delete it.
 */
export function parseJsonFile<I>(
  text: string,
  parseItems: (values: unknown[]) => I[],
  messages: {
    notJson: string;
    notList: string;
    unreadable: (count: number) => string;
  },
): I[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RepoFileError(messages.notJson);
  }
  if (!Array.isArray(value)) throw new RepoFileError(messages.notList);
  const items = parseItems(value);
  if (items.length !== value.length) {
    throw new RepoFileError(messages.unreadable(value.length - items.length));
  }
  return items;
}

// --- Connection ---------------------------------------------------------------

export type RepoConnectionOptions<E extends object> = {
  storage: KeyValueStore;
  key: string;
  keyHolder: KeyHolder;
  /** Whether the enrolled lock encrypts (the connection waits for its key). */
  encrypts: () => Promise<boolean>;
  /** What the app keeps with the connection (e.g. the ids last synced). */
  extra: { initial: E; parse: (stored: Record<string, unknown>) => E | null };
};

export type RepoConnectionState<E extends object> = RepoLocation & E;

export type RepoConnection<E extends object> = LockDataPart & {
  get(): RepoConnectionState<E> | null;
  getServerSnapshot(): null;
  subscribe(listener: () => void): () => void;
  whenLoaded(): Promise<void>;
  /** A token may only be stored encrypted: the lock is on, encrypts and is unlocked. */
  canConnect(): boolean;
  /**
   * Checks the token can read the repository, then stores the connection.
   * The file may not exist yet (a two-way sync creates it).
   */
  connect(location: RepoLocation): Promise<void>;
  /** Stores a changed connection (e.g. after a sync). */
  save(next: RepoConnectionState<E>): Promise<void>;
  disconnect(): Promise<void>;
};

export class RepoConnectionError extends Error {}

function isStringField(record: Record<string, unknown>, field: string) {
  return typeof record[field] === "string";
}

export function createRepoConnection<E extends object>({
  storage,
  key,
  keyHolder,
  encrypts,
  extra,
}: RepoConnectionOptions<E>): RepoConnection<E> {
  const listeners = new Set<() => void>();
  let connection: RepoConnectionState<E> | null = null;
  let loaded: Promise<void> | null = null;

  function emitChange(): void {
    for (const listener of listeners) listener();
  }

  function canConnect(): boolean {
    // The key holder only ever holds a key when the lock encrypts.
    return keyHolder.get() !== null;
  }

  function parse(value: unknown): RepoConnectionState<E> | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const fields = ["owner", "repo", "branch", "path", "token"];
    if (!fields.every((field) => isStringField(record, field))) return null;
    const parsedExtra = extra.parse(record);
    if (!parsedExtra) return null;
    const { owner, repo, branch, path, token } = record as RepoLocation;
    return { owner, repo, branch, path, token, ...parsedExtra };
  }

  async function load(): Promise<void> {
    // Never stored without an encrypting lock: nothing to read then.
    if (!(await encrypts())) return;
    await keyHolder.whenSet();
    try {
      const stored = await storage.get<unknown>(key);
      const cryptoKey = keyHolder.get();
      if (cryptoKey && isEncryptedBlob(stored)) {
        const read = parse(await decryptJson<unknown>(cryptoKey, stored));
        // The lock may have been turned off (deleting it) meanwhile.
        if (canConnect() && connection === null) connection = read;
      }
    } catch {
      // Unreadable: the user connects again.
    } finally {
      emitChange();
    }
  }

  function whenLoaded(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    loaded ??= load();
    return loaded;
  }

  async function save(next: RepoConnectionState<E>): Promise<void> {
    const cryptoKey = keyHolder.get();
    if (!cryptoKey) {
      throw new RepoConnectionError("No encryption key to store the token.");
    }
    connection = next;
    emitChange();
    await storage.set(key, await encryptJson(cryptoKey, next));
  }

  async function disconnect(): Promise<void> {
    connection = null;
    emitChange();
    await storage.delete(key);
  }

  return {
    get() {
      void whenLoaded();
      return connection;
    },
    getServerSnapshot: () => null,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    whenLoaded,
    canConnect,
    async connect(location) {
      if (!canConnect()) {
        throw new RepoConnectionError(
          "The app lock must encrypt to store a token.",
        );
      }
      await readRepoFile(location);
      await save({ ...location, ...extra.initial });
    },
    save,
    disconnect,
    /** Re-encrypt under the new key, or delete when there's none. */
    async rewrite() {
      const current = connection;
      if (current && canConnect()) await save(current);
      else await disconnect();
    },
    erase: disconnect,
  };
}

// --- Read-only mirror -----------------------------------------------------------

/** What a mirror keeps in its local store: the last copy and when it came. */
export type MirrorCopy<T> = { data: T | null; syncedAt: string | null };

export type MirrorStatus = {
  syncing: boolean;
  /** Why the last download failed; cleared by the next success. */
  error: GitHubErrorKind | null;
};

export type RepoMirror = {
  /** Downloads the file; a failure keeps the last copy and sets `error`. */
  sync(): Promise<void>;
  /** The first call per app run syncs; later ones don't. */
  syncOnStart(): Promise<void>;
  getStatus(): MirrorStatus;
  getServerStatus(): MirrorStatus;
  subscribeStatus(listener: () => void): () => void;
};

const IDLE: MirrorStatus = { syncing: false, error: null };

/**
 * Read-only mode: the repository is the source of truth and the backup; the
 * app downloads it on start and on demand and keeps the last copy locally.
 */
export function createRepoMirror<T, E extends object>({
  connection,
  store,
  parseFile,
  now = () => new Date(),
}: {
  connection: RepoConnection<E>;
  store: LocalStore<MirrorCopy<T>>;
  /** Throw `RepoFileError` (or anything) for a file the app can't read. */
  parseFile: (text: string) => T;
  now?: () => Date;
}): RepoMirror {
  const listeners = new Set<() => void>();
  let status = IDLE;
  let syncedThisRun = false;

  function setStatus(next: MirrorStatus): void {
    status = next;
    for (const listener of listeners) listener();
  }

  async function sync(): Promise<void> {
    await Promise.all([connection.whenLoaded(), store.whenLoaded()]);
    const location = connection.get();
    if (!location || status.syncing) return;
    setStatus({ syncing: true, error: status.error });
    try {
      const file = await readRepoFile(location);
      if (!file) throw new GitHubError("notFound");
      let data: T;
      try {
        data = parseFile(file.text);
      } catch {
        throw new GitHubError("invalid");
      }
      await store.replace({ data, syncedAt: now().toISOString() });
      setStatus(IDLE);
    } catch (error) {
      setStatus({
        syncing: false,
        error: error instanceof GitHubError ? error.kind : "server",
      });
    }
  }

  return {
    sync,
    syncOnStart() {
      if (syncedThisRun) return Promise.resolve();
      syncedThisRun = true;
      return sync();
    },
    getStatus: () => status,
    getServerStatus: () => IDLE,
    subscribeStatus(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// --- Two-way sync ---------------------------------------------------------------

export type SyncItem = { id: string; updatedAt: string };

export type MergeOptions<I extends SyncItem> = {
  /**
   * Before an item was ever synced, whether a local one is the same record
   * as one the file has under another id (it takes the file's id).
   */
  pair?: (local: I, remote: I) => boolean;
  /** One item edited on both sides; the newer edit, with the file's id, by default. */
  combine?: (local: I, remote: I) => I;
  /** Whether a merged item differs from this device's; JSON equality by default. */
  same?: (a: I, b: I) => boolean;
};

export type MergeResult<I> = {
  items: I[];
  /** Changes to this device's data. */
  added: number;
  updated: number;
  removed: number;
};

function newerWins<I extends SyncItem>(local: I, remote: I): I {
  const localIsNewer =
    Date.parse(local.updatedAt) > Date.parse(remote.updatedAt);
  return { ...(localIsNewer ? local : remote), id: remote.id };
}

/**
 * Merges this device's items with the file's, by id. `syncedIds` — the ids
 * both sides had after the last sync — tells a deletion from an addition:
 * an item missing on one side that was synced before was deleted there.
 */
export function mergeById<I extends SyncItem>(
  local: I[],
  remote: I[],
  syncedIds: ReadonlySet<string>,
  {
    pair = () => false,
    combine = newerWins,
    same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  }: MergeOptions<I> = {},
): MergeResult<I> {
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteIds = new Set(remote.map((item) => item.id));
  // Never synced and not in the file by id: may be in it under another id.
  const unpaired = local.filter(
    (item) => !remoteIds.has(item.id) && !syncedIds.has(item.id),
  );
  const consumed = new Set<string>();
  const result: MergeResult<I> = {
    items: [],
    added: 0,
    updated: 0,
    removed: 0,
  };

  for (const remoteItem of remote) {
    const localItem =
      localById.get(remoteItem.id) ??
      unpaired.find((item) => !consumed.has(item.id) && pair(item, remoteItem));
    if (!localItem) {
      // Deleted here since the last sync, or new in the file.
      if (syncedIds.has(remoteItem.id)) continue;
      result.items.push(remoteItem);
      result.added++;
      continue;
    }
    consumed.add(localItem.id);
    const merged = combine(localItem, remoteItem);
    if (!same(merged, localItem)) result.updated++;
    result.items.push(merged);
  }

  for (const item of local) {
    if (consumed.has(item.id)) continue;
    // Deleted in the file since the last sync, or new here.
    if (syncedIds.has(item.id)) {
      result.removed++;
      continue;
    }
    result.items.push(item);
  }
  return result;
}

/** What a two-way connection keeps: the ids both sides had after the last sync. */
export type SyncedIds = { syncedIds: string[] };

/** `extra` for `createRepoConnection` in two-way mode. */
export const syncedIdsExtra: RepoConnectionOptions<SyncedIds>["extra"] = {
  initial: { syncedIds: [] },
  parse: ({ syncedIds }) =>
    Array.isArray(syncedIds) && syncedIds.every((id) => typeof id === "string")
      ? { syncedIds: syncedIds as string[] }
      : null,
};

export type SyncResult = {
  added: number;
  updated: number;
  removed: number;
  /** Whether the file on GitHub was changed. */
  pushed: boolean;
};

/**
 * Two-way mode: merges this device's items with the file's, writes the
 * result to both and remembers what was synced. If the file changes on
 * GitHub meanwhile (e.g. a workflow in the repository), starts over once.
 */
export function createRepoSync<I extends SyncItem>({
  connection,
  store,
  file,
  merge,
  commitMessage,
}: {
  connection: RepoConnection<SyncedIds>;
  store: LocalStore<I[]>;
  file: { format: (items: I[]) => string; parse: (text: string) => I[] };
  merge?: MergeOptions<I>;
  commitMessage: string;
}): { sync(): Promise<SyncResult> } {
  return {
    async sync() {
      await Promise.all([connection.whenLoaded(), store.whenLoaded()]);
      const current = connection.get();
      if (!current) throw new RepoConnectionError("Not connected to GitHub.");
      for (let attempt = 0; ; attempt++) {
        const remote = await readRepoFile(current);
        const { items, added, updated, removed } = mergeById(
          store.getSnapshot(),
          remote ? file.parse(remote.text) : [],
          new Set(current.syncedIds),
          merge,
        );
        const text = file.format(items);
        const pushed = text !== remote?.text;
        if (pushed) {
          try {
            await writeRepoFile(
              current,
              text,
              remote?.sha ?? null,
              commitMessage,
            );
          } catch (error) {
            if (
              attempt === 0 &&
              error instanceof GitHubError &&
              error.kind === "conflict"
            ) {
              continue;
            }
            throw error;
          }
        }
        if (added + updated + removed > 0) void store.replace(items);
        await connection.save({
          ...current,
          syncedIds: items.map((item) => item.id),
        });
        return { added, updated, removed, pushed };
      }
    },
  };
}
