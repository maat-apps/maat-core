// Backup files: the envelope every app's backup shares ({ app, version,
// exportedAt, data, ... }), turning a backup into a file, and getting that
// file to the user — the OS share sheet (e.g. straight to a cloud drive)
// with a plain download as the fallback. Parsing `data` stays in the app:
// only it knows its own schemas.

/** Thrown for a file that can't be restored; `message` is shown to the user. */
export class BackupError extends Error {}

/** The fields every backup has; apps add their own (e.g. a locale). */
export type BackupEnvelope = {
  app: string;
  version: number;
  exportedAt: string;
  data: unknown;
};

/** User-facing messages, in the app's own language. */
export type BackupMessages = {
  notJson: string;
  wrongApp: string;
  /** Only needed when `readBackupEnvelope` is given a `version`. */
  wrongVersion?: string;
};

/** Parses a backup file's text; throws `BackupError` if it isn't JSON. */
export function readBackupJson(
  text: string,
  messages: BackupMessages,
): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new BackupError(messages.notJson);
  }
}

/**
 * Checks that `value` is a backup of `app` (and of exactly `version`, when
 * given) and returns it with `exportedAt` defaulted to now if missing. Every
 * other field is returned as-is, unvalidated, for the app to parse.
 */
export function readBackupEnvelope(
  value: unknown,
  {
    app,
    version,
    messages,
  }: { app: string; version?: number; messages: BackupMessages },
): BackupEnvelope & Record<string, unknown> {
  // Not /validation's isRecord: that would make /backup depend on the
  // optional valibot peer.
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BackupError(messages.wrongApp);
  }
  const record = value as Record<string, unknown>;
  if (record.app !== app) {
    throw new BackupError(messages.wrongApp);
  }
  if (version !== undefined && record.version !== version) {
    throw new BackupError(messages.wrongVersion ?? messages.wrongApp);
  }
  return {
    ...record,
    app,
    version: typeof record.version === "number" ? record.version : 0,
    exportedAt:
      typeof record.exportedAt === "string"
        ? record.exportedAt
        : new Date().toISOString(),
    data: record.data,
  };
}

function localDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * `<app>-backup-YYYY-MM-DD.txt` (local date). `.txt`/`text/plain`, not JSON:
 * Chromium's Web Share file allow-list excludes JSON (`canShare` silently
 * returns false), and download uses the same format. Import only reads the
 * text, so the extension doesn't matter there.
 */
export function backupFileName(app: string, date = new Date()): string {
  return `${app}-backup-${localDateStamp(date)}.txt`;
}

/** The backup as a pretty-printed plain-text file named for its export date. */
export function backupFile(backup: BackupEnvelope): File {
  return new File(
    [JSON.stringify(backup, null, 2)],
    backupFileName(backup.app, new Date(backup.exportedAt)),
    { type: "text/plain" },
  );
}

/** Hands the browser a file to save. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * - `"shared"`: the user picked a target and the share succeeded.
 * - `"cancelled"`: the user dismissed the share sheet — a normal outcome,
 *   not a failure to fall back from.
 * - `"unavailable"`: file sharing isn't supported (or not for this file
 *   type), or the share failed; fall back to `downloadFile`.
 */
export type ShareResult = "shared" | "cancelled" | "unavailable";

/** Offers `file` to the OS share sheet. */
export async function shareFile(file: File): Promise<ShareResult> {
  if (!navigator.canShare || !navigator.share) return "unavailable";
  if (!navigator.canShare({ files: [file] })) return "unavailable";
  try {
    await navigator.share({ files: [file] });
    return "shared";
  } catch (error) {
    // navigator.share rejects with a DOMException, which doesn't reliably
    // extend Error across environments — check `name` directly.
    const cancelled =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError";
    return cancelled ? "cancelled" : "unavailable";
  }
}

/** Downloads the backup as a file. */
export function downloadBackup(backup: BackupEnvelope): void {
  downloadFile(backupFile(backup));
}

/** Offers the backup to the share sheet; on `"unavailable"`, download it. */
export function shareBackup(backup: BackupEnvelope): Promise<ShareResult> {
  return shareFile(backupFile(backup));
}

/** Shares `file`, downloading it instead when sharing isn't available. */
export async function shareOrDownloadFile(
  file: File,
): Promise<"shared" | "cancelled" | "downloaded"> {
  const result = await shareFile(file);
  if (result !== "unavailable") return result;
  downloadFile(file);
  return "downloaded";
}
