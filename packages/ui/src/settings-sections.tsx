import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "./button";
import { ConfirmDrawer } from "./confirm-drawer";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "./drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { SettingsRow, SettingsSection } from "./settings-primitives";
import { Switch } from "./switch";

// The settings every app shares — the drawer they live in, and the language,
// security, app and data sections. Wired to @maat-apps/core's lock, app
// settings, install prompt and backup kit, typed structurally so this
// package doesn't depend on core; every string comes from the app.

const actionClassName = "min-h-10.5 px-4";
const selectTriggerClassName = "w-auto min-w-26 text-sm";

/** Reports a result under the panel; `null` clears it. */
type OnStatus = (message: string | null) => void;

/** Settings as a bottom drawer over the screen that opened it. */
export function SettingsDrawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent
        // `--popover` and `--card` are the same colour, so on the default
        // drawer surface the settings rows would lose their card edges.
        className="bg-background [--drawer-bleed-background:var(--color-background)]"
      >
        <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// --- Language -----------------------------------------------------------------

/** The language picker: `languages` maps each locale to its own name. */
export function LanguageSection<Locale extends string>({
  title,
  locale,
  languages,
  onLocaleChange,
}: {
  title: string;
  locale: NoInfer<Locale>;
  languages: Record<Locale, string>;
  onLocaleChange: (locale: NoInfer<Locale>) => void;
}) {
  const locales = Object.keys(languages) as Locale[];
  return (
    <SettingsSection title={title}>
      <SettingsRow
        title={title}
        description={languages[locale]}
        action={
          <Select
            value={locale}
            onValueChange={(value) => {
              const choice = locales.find((option) => option === value);
              if (choice) onLocaleChange(choice);
            }}
          >
            <SelectTrigger
              className={selectTriggerClassName}
              aria-label={title}
            >
              <SelectValue>{(value: Locale) => languages[value]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {locales.map((option) => (
                <SelectItem key={option} value={option}>
                  {languages[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </SettingsSection>
  );
}

// --- Security -----------------------------------------------------------------

/** @maat-apps/core/app-settings' `RELOCK_CHOICES`. */
const RELOCK_CHOICES = ["now", "30s", "close"] as const;
export type RelockChoice = (typeof RELOCK_CHOICES)[number];

/** The parts of core's `AppLock` the section drives. */
export type SecuritySectionLock = {
  isSupported: () => Promise<boolean>;
  enrol: () => Promise<unknown>;
  disable: () => void;
};

/** The parts of core's `AppSettings` the section reads and writes. */
export type SecuritySectionSettings = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => {
    lock: { encryptionSupported: boolean } | null;
    relockAfter: RelockChoice;
  };
  getServerSnapshot: () => {
    lock: { encryptionSupported: boolean } | null;
    relockAfter: RelockChoice;
  };
  setRelockAfter: (relockAfter: RelockChoice) => void;
};

export type SecuritySectionLabels = {
  title: string;
  appLock: string;
  appLockDescription: string;
  appLockUnsupported: string;
  appLockFailed: string;
  relockAfter: string;
  relockAfterDescription: string;
  relockNow: string;
  relock30s: string;
  relockClose: string;
  /** Under the switch while a lock that doesn't encrypt is on. */
  appLockNotice: string;
  /** While a lock that encrypts is on; without it, `appLockNotice` shows. */
  appLockEncryptedNotice?: string;
};

const RELOCK_LABELS = {
  now: "relockNow",
  "30s": "relock30s",
  close: "relockClose",
} as const satisfies Record<RelockChoice, keyof SecuritySectionLabels>;

/** The app lock switch, how soon it relocks, and what it protects. */
export function SecuritySection({
  lock,
  settings,
  labels,
}: {
  lock: SecuritySectionLock;
  settings: SecuritySectionSettings;
  labels: SecuritySectionLabels;
}) {
  const { lock: enrolment, relockAfter } = useSyncExternalStore(
    settings.subscribe,
    settings.getSnapshot,
    settings.getServerSnapshot,
  );
  const [lockSupported, setLockSupported] = useState(false);
  const [lockError, setLockError] = useState(false);

  useEffect(() => {
    let active = true;
    void lock.isSupported().then((supported) => {
      if (active) setLockSupported(supported);
    });
    return () => {
      active = false;
    };
  }, [lock]);

  async function toggleAppLock(enabled: boolean) {
    setLockError(false);
    if (!enabled) {
      lock.disable();
      return;
    }
    try {
      await lock.enrol();
    } catch {
      // Cancelling the platform prompt lands here too; leave the lock off.
      setLockError(true);
    }
  }

  return (
    <SettingsSection title={labels.title}>
      <SettingsRow
        title={labels.appLock}
        description={
          lockSupported ? labels.appLockDescription : labels.appLockUnsupported
        }
        action={
          <Switch
            checked={enrolment !== null}
            disabled={!lockSupported}
            aria-label={labels.appLock}
            onCheckedChange={(checked) => void toggleAppLock(checked)}
          />
        }
      />
      {enrolment !== null && (
        <SettingsRow
          title={labels.relockAfter}
          description={labels.relockAfterDescription}
          action={
            <Select
              value={relockAfter}
              onValueChange={(value) => {
                const choice = RELOCK_CHOICES.find(
                  (option) => option === value,
                );
                if (choice) settings.setRelockAfter(choice);
              }}
            >
              <SelectTrigger
                className={selectTriggerClassName}
                aria-label={labels.relockAfter}
              >
                <SelectValue>
                  {(value: RelockChoice) => labels[RELOCK_LABELS[value]]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RELOCK_CHOICES.map((choice) => (
                  <SelectItem key={choice} value={choice}>
                    {labels[RELOCK_LABELS[choice]]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      )}
      {lockError && (
        <p role="alert" className="text-destructive px-1 text-xs">
          {labels.appLockFailed}
        </p>
      )}
      {enrolment !== null && (
        <p className="text-muted-foreground px-1 text-xs">
          {enrolment.encryptionSupported && labels.appLockEncryptedNotice
            ? labels.appLockEncryptedNotice
            : labels.appLockNotice}
        </p>
      )}
    </SettingsSection>
  );
}

// --- App ----------------------------------------------------------------------

/** What core's `useInstallPrompt` returns. */
export type AppSectionInstall = {
  state: "unavailable" | "available" | "installed";
  install: () => Promise<void>;
};

/** The parts of core's `UpdateSnapshot` the restore row uses. */
export type AppSectionSnapshot = {
  has: () => boolean;
  hasOnServer: () => boolean;
  subscribe: (listener: () => void) => () => void;
  restore: () => Promise<boolean>;
  discard: () => Promise<void>;
};

export type AppSectionLabels = {
  title: string;
  installApp: string;
  installAppDescription: string;
  installAppInstalled: string;
  installAppUnavailable: string;
  installAppAction: string;
  updateApp: string;
  updateAppDescription: string;
  updateAppAction: string;
  updateAppBusy: string;
  updateConfirmTitle: string;
  updateConfirmDescription: string;
  cancel: string;
};

export type RestoreSnapshotLabels = {
  title: string;
  description: string;
  action: string;
  done: string;
};

function hasNoSnapshot(): boolean {
  return false;
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

/**
 * Install, update (after a confirmation) and — for an app whose update keeps
 * a pre-update snapshot — restoring that snapshot.
 */
export function AppSection({
  install,
  updateApp,
  restore,
  onStatus,
  labels,
}: {
  install: AppSectionInstall;
  updateApp: () => Promise<void>;
  restore?: { snapshot: AppSectionSnapshot; labels: RestoreSnapshotLabels };
  onStatus: OnStatus;
  labels: AppSectionLabels;
}) {
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const snapshot = restore?.snapshot;
  const hasSnapshot = useSyncExternalStore(
    snapshot?.subscribe ?? subscribeToNothing,
    snapshot?.has ?? hasNoSnapshot,
    snapshot?.hasOnServer ?? hasNoSnapshot,
  );

  async function restoreSnapshot() {
    if (!restore) return;
    if (await restore.snapshot.restore()) {
      onStatus(restore.labels.done);
      await restore.snapshot.discard();
    }
  }

  return (
    <>
      <SettingsSection title={labels.title}>
        <SettingsRow
          title={labels.installApp}
          description={
            install.state === "installed"
              ? labels.installAppInstalled
              : install.state === "available"
                ? labels.installAppDescription
                : labels.installAppUnavailable
          }
          action={
            <Button
              variant="outline"
              className={actionClassName}
              disabled={install.state !== "available"}
              onClick={() => void install.install()}
            >
              {labels.installAppAction}
            </Button>
          }
        />
        <SettingsRow
          title={labels.updateApp}
          description={labels.updateAppDescription}
          action={
            <Button
              variant="outline"
              className={actionClassName}
              disabled={updating}
              onClick={() => setConfirmUpdate(true)}
            >
              {updating ? labels.updateAppBusy : labels.updateAppAction}
            </Button>
          }
        />
        {restore && hasSnapshot && (
          <SettingsRow
            title={restore.labels.title}
            description={restore.labels.description}
            action={
              <Button
                variant="outline"
                className={actionClassName}
                onClick={() => void restoreSnapshot()}
              >
                {restore.labels.action}
              </Button>
            }
          />
        )}
      </SettingsSection>
      <ConfirmDrawer
        open={confirmUpdate}
        onOpenChange={setConfirmUpdate}
        title={labels.updateConfirmTitle}
        description={labels.updateConfirmDescription}
        cancelLabel={labels.cancel}
        confirmLabel={labels.updateAppAction}
        onConfirm={() => {
          setConfirmUpdate(false);
          setUpdating(true);
          void updateApp();
        }}
      />
    </>
  );
}

// --- Data ---------------------------------------------------------------------

/** The parts of core's `LocalBackupKit` the section uses. */
export type DataSectionBackups<Backup> = {
  /** `"unavailable"`: no share sheet here, so the file is downloaded. */
  share: () => Promise<"shared" | "cancelled" | "unavailable">;
  download: () => void;
  /** Throws for a file that isn't this app's backup. */
  parse: (text: string) => Backup;
};

export type DataSectionLabels = {
  title: string;
  exportData: string;
  exportDataDescription: string;
  exportAction: string;
  exportShared: string;
  exportDone: string;
  importData: string;
  importDataDescription: string;
  importAction: string;
  importFailed: string;
  importTitle: string;
  importDescription: string;
  importConfirm: string;
  importDone: string;
  cancel: string;
};

/**
 * Export a backup (share sheet, else a download) and import one, after a
 * confirmation. `children` are the app's own rows, after these.
 */
export function DataSection<Backup>({
  backups,
  onImport,
  onStatus,
  labels,
  children,
}: {
  backups: DataSectionBackups<Backup>;
  /** Called once the user confirms — an app merges, it doesn't replace. */
  onImport: (backup: Backup) => void;
  onStatus: OnStatus;
  labels: DataSectionLabels;
  children?: ReactNode;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{
    backup: Backup;
  } | null>(null);

  async function exportBackup() {
    onStatus(null);
    const result = await backups.share();
    if (result === "shared") {
      onStatus(labels.exportShared);
    } else if (result === "unavailable") {
      backups.download();
      onStatus(labels.exportDone);
    }
    // "cancelled" — the user dismissed the share sheet; nothing to report.
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    onStatus(null);
    try {
      setPendingImport({ backup: backups.parse(await file.text()) });
    } catch {
      onStatus(labels.importFailed);
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    onImport(pendingImport.backup);
    setPendingImport(null);
    onStatus(labels.importDone);
  }

  return (
    <>
      <SettingsSection title={labels.title}>
        <SettingsRow
          title={labels.exportData}
          description={labels.exportDataDescription}
          action={
            <Button
              variant="outline"
              className={actionClassName}
              onClick={() => void exportBackup()}
            >
              {labels.exportAction}
            </Button>
          }
        />
        <SettingsRow
          title={labels.importData}
          description={labels.importDataDescription}
          action={
            <Button
              variant="outline"
              className={actionClassName}
              onClick={() => fileInput.current?.click()}
            >
              {labels.importAction}
            </Button>
          }
        />
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json,text/plain,.txt"
          className="hidden"
          aria-label={labels.importData}
          onChange={(event) => {
            void chooseFile(event.target.files?.[0]);
            // Allow re-picking the same file after a failed attempt.
            event.target.value = "";
          }}
        />
        {children}
      </SettingsSection>
      <ConfirmDrawer
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
        title={labels.importTitle}
        description={labels.importDescription}
        cancelLabel={labels.cancel}
        confirmLabel={labels.importConfirm}
        onConfirm={confirmImport}
      />
    </>
  );
}
