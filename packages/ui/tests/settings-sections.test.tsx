import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AppSection,
  type AppSectionLabels,
  DataSection,
  type DataSectionLabels,
  LanguageSection,
  type RelockChoice,
  SecuritySection,
  type SecuritySectionLabels,
} from "../src/settings-sections";

afterEach(() => vi.restoreAllMocks());

const securityLabels: SecuritySectionLabels = {
  title: "Security",
  appLock: "App lock",
  appLockDescription: "Ask for your fingerprint.",
  appLockUnsupported: "No fingerprint unlock here.",
  appLockFailed: "That did not work.",
  relockAfter: "Lock again",
  relockAfterDescription: "After leaving the app.",
  relockNow: "Right away",
  relock30s: "After 30 s",
  relockClose: "When closed",
  appLockNotice: "Not encrypted.",
  appLockEncryptedNotice: "Encrypted.",
};

const appLabels: AppSectionLabels = {
  title: "App",
  installApp: "Install app",
  installAppDescription: "Add it to your home screen.",
  installAppInstalled: "Already installed.",
  installAppUnavailable: "Use your browser menu.",
  installAppAction: "Install",
  updateApp: "Update app",
  updateAppDescription: "Fetch the newest version.",
  updateAppAction: "Update",
  updateAppBusy: "Updating…",
  updateConfirmTitle: "Update now?",
  updateConfirmDescription: "The app reloads.",
  cancel: "Cancel",
};

const dataLabels: DataSectionLabels = {
  title: "Data",
  exportData: "Export",
  exportDataDescription: "Save a backup.",
  exportAction: "Save",
  exportShared: "Backup shared.",
  exportDone: "Backup downloaded.",
  importData: "Import",
  importDataDescription: "Add from a backup.",
  importAction: "Choose file",
  importFailed: "Not a backup.",
  importTitle: "Add from the backup?",
  importDescription: "Nothing is deleted.",
  importConfirm: "Import",
  importDone: "Imported.",
  cancel: "Cancel",
};

function settingsSource(
  lock: { encryptionSupported: boolean } | null,
  relockAfter: RelockChoice = "30s",
) {
  const snapshot = { lock, relockAfter };
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => snapshot,
    setRelockAfter: vi.fn(),
  };
}

function fakeLock(supported = true) {
  return {
    isSupported: vi.fn(() => Promise.resolve(supported)),
    enrol: vi.fn(() => Promise.resolve()),
    disable: vi.fn(),
  };
}

describe("LanguageSection", () => {
  it("names the current language", () => {
    render(
      <LanguageSection
        title="Language"
        locale="pl"
        languages={{ pl: "Polski", en: "English" }}
        onLocaleChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Polski").length).toBeGreaterThan(0);
  });
});

describe("SecuritySection", () => {
  it("turns the lock on through the authenticator", async () => {
    const lock = fakeLock();
    render(
      <SecuritySection
        lock={lock}
        settings={settingsSource(null)}
        labels={securityLabels}
      />,
    );
    const toggle = screen.getByRole("switch", { name: "App lock" });
    await waitFor(() =>
      expect(toggle.hasAttribute("data-disabled")).toBe(false),
    );

    fireEvent.click(toggle);

    expect(lock.enrol).toHaveBeenCalled();
  });

  it("says so when enrolling fails", async () => {
    const lock = fakeLock();
    lock.enrol.mockRejectedValue(new Error("cancelled"));
    render(
      <SecuritySection
        lock={lock}
        settings={settingsSource(null)}
        labels={securityLabels}
      />,
    );
    const toggle = screen.getByRole("switch", { name: "App lock" });
    await waitFor(() =>
      expect(toggle.hasAttribute("data-disabled")).toBe(false),
    );

    fireEvent.click(toggle);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That did not work.",
    );
  });

  it("keeps the switch off where there's no authenticator", async () => {
    render(
      <SecuritySection
        lock={fakeLock(false)}
        settings={settingsSource(null)}
        labels={securityLabels}
      />,
    );

    expect(await screen.findByText("No fingerprint unlock here.")).toBeTruthy();
    expect(screen.queryByText("Lock again")).toBeNull();
  });

  it("shows the relock choice and the encrypted notice while on", () => {
    render(
      <SecuritySection
        lock={fakeLock()}
        settings={settingsSource({ encryptionSupported: true }, "close")}
        labels={securityLabels}
      />,
    );

    expect(screen.getByText("Lock again")).toBeTruthy();
    expect(screen.getByText("When closed")).toBeTruthy();
    expect(screen.getByText("Encrypted.")).toBeTruthy();
  });

  it("falls back to the plain notice without an encrypted one", () => {
    render(
      <SecuritySection
        lock={fakeLock()}
        settings={settingsSource({ encryptionSupported: true })}
        labels={{ ...securityLabels, appLockEncryptedNotice: undefined }}
      />,
    );

    expect(screen.getByText("Not encrypted.")).toBeTruthy();
  });
});

describe("AppSection", () => {
  const install = { state: "available" as const, install: vi.fn() };

  it("updates only once confirmed", async () => {
    const updateApp = vi.fn(() => new Promise<void>(() => undefined));
    render(
      <AppSection
        install={install}
        updateApp={updateApp}
        onStatus={vi.fn()}
        labels={appLabels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(updateApp).not.toHaveBeenCalled();
    const confirm = await screen.findAllByRole("button", { name: "Update" });
    fireEvent.click(confirm[confirm.length - 1]);

    expect(updateApp).toHaveBeenCalled();
  });

  it("restores the pre-update snapshot and reports it", async () => {
    const snapshot = {
      has: () => true,
      hasOnServer: () => false,
      subscribe: () => () => undefined,
      restore: vi.fn(() => Promise.resolve(true)),
      discard: vi.fn(() => Promise.resolve()),
    };
    const onStatus = vi.fn();
    render(
      <AppSection
        install={install}
        updateApp={vi.fn()}
        restore={{
          snapshot,
          labels: {
            title: "Restore last backup",
            description: "From before the update.",
            action: "Restore",
            done: "Restored.",
          },
        }}
        onStatus={onStatus}
        labels={appLabels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(onStatus).toHaveBeenCalledWith("Restored."));
    expect(snapshot.discard).toHaveBeenCalled();
  });

  it("has no restore row without a snapshot", () => {
    render(
      <AppSection
        install={install}
        updateApp={vi.fn()}
        onStatus={vi.fn()}
        labels={appLabels}
      />,
    );

    expect(screen.queryByText("Restore")).toBeNull();
  });
});

describe("DataSection", () => {
  function renderData(
    backups: Parameters<typeof DataSection<string>>[0]["backups"],
  ) {
    const onImport = vi.fn();
    const onStatus = vi.fn();
    render(
      <DataSection
        backups={backups}
        onImport={onImport}
        onStatus={onStatus}
        labels={dataLabels}
      >
        <p>Own row</p>
      </DataSection>,
    );
    return { onImport, onStatus };
  }

  function chooseFile(text: string) {
    fireEvent.change(screen.getByLabelText("Import"), {
      target: { files: [new File([text], "backup.txt")] },
    });
  }

  it("downloads the backup where there's no share sheet", async () => {
    const download = vi.fn();
    const { onStatus } = renderData({
      share: () => Promise.resolve("unavailable"),
      download,
      parse: (text) => text,
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onStatus).toHaveBeenCalledWith("Backup downloaded."),
    );
    expect(download).toHaveBeenCalled();
  });

  it("imports a backup once confirmed", async () => {
    const { onImport, onStatus } = renderData({
      share: () => Promise.resolve("shared"),
      download: vi.fn(),
      parse: (text) => `parsed:${text}`,
    });

    chooseFile("data");
    fireEvent.click(
      await screen.findByRole("button", { name: "Import", hidden: false }),
    );

    await waitFor(() => expect(onImport).toHaveBeenCalledWith("parsed:data"));
    expect(onStatus).toHaveBeenLastCalledWith("Imported.");
  });

  it("reports a file that isn't a backup", async () => {
    const { onImport, onStatus } = renderData({
      share: () => Promise.resolve("shared"),
      download: vi.fn(),
      parse: () => {
        throw new Error("nope");
      },
    });

    chooseFile("junk");

    await waitFor(() => expect(onStatus).toHaveBeenCalledWith("Not a backup."));
    expect(onImport).not.toHaveBeenCalled();
  });

  it("keeps the app's own rows in the section", () => {
    renderData({
      share: () => Promise.resolve("shared"),
      download: vi.fn(),
      parse: (text) => text,
    });

    expect(screen.getByText("Own row")).toBeTruthy();
  });
});
