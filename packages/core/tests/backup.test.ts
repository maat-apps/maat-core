// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BackupError,
  backupFile,
  backupFileName,
  downloadBackup,
  readBackupEnvelope,
  readBackupJson,
  shareBackup,
  shareFile,
  shareOrDownloadFile,
} from "../src/backup";

const messages = {
  notJson: "Not JSON",
  wrongApp: "Not a test backup",
  wrongVersion: "Wrong version",
};

const backup = {
  app: "test",
  version: 1,
  exportedAt: new Date(2026, 8, 28, 12).toISOString(),
  data: { items: [1, 2] },
};

afterEach(() => vi.unstubAllGlobals());

describe("readBackupJson", () => {
  it("parses JSON text", () => {
    expect(readBackupJson('{"a":1}', messages)).toEqual({ a: 1 });
  });

  it("throws a BackupError with the app's message for non-JSON", () => {
    expect(() => readBackupJson("nope", messages)).toThrow(
      new BackupError("Not JSON"),
    );
  });
});

describe("readBackupEnvelope", () => {
  it("returns a matching backup with its extra fields", () => {
    const envelope = readBackupEnvelope(
      { ...backup, locale: "pl" },
      { app: "test", version: 1, messages },
    );

    expect(envelope).toEqual({ ...backup, locale: "pl" });
  });

  it("rejects another app's backup or a non-object", () => {
    for (const value of [{ ...backup, app: "other" }, "text", null]) {
      expect(() =>
        readBackupEnvelope(value, { app: "test", messages }),
      ).toThrow("Not a test backup");
    }
  });

  it("rejects another version only when a version is required", () => {
    const old = { ...backup, version: 0 };

    expect(() =>
      readBackupEnvelope(old, { app: "test", version: 1, messages }),
    ).toThrow("Wrong version");
    expect(readBackupEnvelope(old, { app: "test", messages }).version).toBe(0);
  });

  it("falls back to the wrong-app message without a version message", () => {
    expect(() =>
      readBackupEnvelope(
        { ...backup, version: 2 },
        {
          app: "test",
          version: 1,
          messages: { ...messages, wrongVersion: undefined },
        },
      ),
    ).toThrow("Not a test backup");
  });

  it("defaults a missing exportedAt and version", () => {
    const envelope = readBackupEnvelope(
      { app: "test", data: null },
      { app: "test", messages },
    );

    expect(envelope.version).toBe(0);
    expect(Number.isNaN(Date.parse(envelope.exportedAt))).toBe(false);
  });
});

describe("backupFileName / backupFile", () => {
  it("names the file after the app and the local export date", () => {
    expect(backupFileName("test", new Date(2026, 0, 5, 23, 30))).toBe(
      "test-backup-2026-01-05.txt",
    );
  });

  it("writes the backup as pretty-printed plain text", async () => {
    const file = backupFile(backup);

    expect(file.name).toBe("test-backup-2026-09-28.txt");
    expect(file.type).toBe("text/plain");
    expect(JSON.parse(await file.text())).toEqual(backup);
  });
});

describe("downloading", () => {
  let clicked: string[];

  beforeEach(() => {
    clicked = [];
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:test",
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("downloads the backup under its file name and cleans up the link", () => {
    downloadBackup(backup);

    expect(clicked).toEqual(["test-backup-2026-09-28.txt"]);
    expect(document.querySelector("a")).toBeNull();
  });

  it("downloads when sharing is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    const result = await shareOrDownloadFile(new File(["x"], "chart.png"));

    expect(result).toBe("downloaded");
    expect(clicked).toEqual(["chart.png"]);
  });
});

describe("sharing", () => {
  function stubShare(share: () => Promise<void>, canShare = true) {
    const shareSpy = vi.fn(share);
    vi.stubGlobal("navigator", { canShare: () => canShare, share: shareSpy });
    return shareSpy;
  }

  it("shares a file", async () => {
    const share = stubShare(async () => {});

    await expect(shareBackup(backup)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
  });

  it("reports a dismissed share sheet as cancelled", async () => {
    stubShare(() =>
      Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })),
    );

    await expect(shareFile(new File(["x"], "a.txt"))).resolves.toBe(
      "cancelled",
    );
  });

  it("reports any other failure as unavailable", async () => {
    stubShare(() => Promise.reject(new Error("NotAllowedError")));

    await expect(shareFile(new File(["x"], "a.txt"))).resolves.toBe(
      "unavailable",
    );
  });

  it("is unavailable without the API or for an unshareable file", async () => {
    vi.stubGlobal("navigator", {});
    await expect(shareFile(new File(["x"], "a.txt"))).resolves.toBe(
      "unavailable",
    );

    stubShare(async () => {}, false);
    await expect(shareFile(new File(["x"], "a.txt"))).resolves.toBe(
      "unavailable",
    );
  });

  it("doesn't download after a cancelled share", async () => {
    stubShare(() =>
      Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })),
    );

    await expect(
      shareOrDownloadFile(new File(["x"], "chart.png")),
    ).resolves.toBe("cancelled");
  });
});
