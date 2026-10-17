# GitHub repository storage pattern

How a `maat-apps` app keeps its data as one JSON file in the user's own
GitHub repository. It builds on the [local pattern](./storage.md): the
local, encrypted IndexedDB copy stays, so the app opens and works offline;
the repository is where the data also lives — with its commit history, the
user's own edits and the repository's workflows. The logic ships as
[`@maat-apps/core/github`](../packages/core) on top of `/local`.

## When to use it

Only for data that isn't sensitive. A private repository is not encrypted:
a leaked token, an accidental visibility flip or a compromised account
expose it. Encrypting the file in the repository is out — it would kill the
diffs, the editing by hand and the workflows, which are the whole point.
Sensitive data uses the local pattern alone (STRUCTURE.md's Conventions).

| App        | Mode         | Why                                                                 |
| ---------- | ------------ | ------------------------------------------------------------------- |
| albums     | two-way sync | Commit history; the data repo's workflows fill in covers and links. |
| gym-charts | read-only    | The repository is the source of truth and the backup.               |

## The pattern

- **One file over the REST contents API**, straight from the browser
  (api.github.com allows cross-origin requests). Files over 1 MB come from
  the blob API. An empty branch means the repository's default branch.
- **A fine-grained personal access token**, scoped to the one repository
  (read-only for a mirror; contents read/write for two-way sync), pasted
  into Settings: GitHub's sign-in flows need a server-side secret no app
  here has. It only ever goes to api.github.com.
- **The connection (repository, branch, path, token) is only ever stored
  encrypted** with the app lock's key (`createRepoConnection`): no
  connection without a lock that encrypts (WebAuthn PRF), the lock's
  rewrite re-encrypts it under a new key or deletes it when encryption
  stops, erase deletes it.
- **A deterministic file format** (`formatJsonFile`): items sorted by a
  total order, each with a fixed field order and empty fields left out,
  two-space indented, ending in a newline — so a commit's diff shows exactly
  what changed. If anything else writes the file (a script, a workflow), it
  must write byte for byte the same, or every sync rewrites the whole file.
  The parser (`parseJsonFile`) refuses a file it can't fully read rather
  than dropping items: a two-way sync would delete them from the file.
- **No backup file and no pre-update snapshot**: the repository is the
  backup.

## Two modes

- **Read-only** (`createRepoMirror`): download on start (once per app run)
  and on demand into a `/local` store of `{ data, syncedAt }`; a failed
  download keeps the last copy and says why (`GitHubError` kinds), so the
  app keeps working offline or with a revoked token.
- **Two-way sync** (`createRepoSync`, `mergeById`): read the file, merge
  it with this device's items, write the result to both and remember which
  ids both sides had (`syncedIds`, kept with the connection).
  - Items are matched by `id`; one edited on both sides keeps the newer
    edit (`updatedAt`) — an app's `combine` can refine that (albums keeps
    covers and links the other side filled in).
  - `syncedIds` tells a deletion from an addition: an item missing on one
    side that was synced before was deleted there.
  - Before an item's first sync, `pair` may match it with one the file has
    under another id (albums: the same artist, title and year), so it isn't
    kept twice.
  - If the file changed on GitHub between the read and the write (a 409),
    the sync starts over once.
