import { type FormEvent, useState } from "react";

import { Button } from "./button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./drawer";
import { Input } from "./input";

/** Shorter passwords are refused when one is chosen for a new backup. */
export const MIN_BACKUP_PASSWORD_LENGTH = 8;

export type BackupPasswordLabels = {
  exportTitle: string;
  /** Should say the backup can't be opened without the password. */
  exportDescription: string;
  exportConfirm: string;
  importTitle: string;
  importDescription: string;
  importConfirm: string;
  password: string;
  repeatPassword: string;
  /** Shown for a new password under `MIN_BACKUP_PASSWORD_LENGTH`. */
  tooShort: string;
  mismatch: string;
  /** The password doesn't open the file, or it's damaged. */
  wrongPassword: string;
  cancel: string;
};

/**
 * What a backup's password unlocks — core's `LocalBackupKit` methods of the
 * same names, typed structurally so this package doesn't depend on core.
 */
export type BackupPasswords<Backup> = {
  isEncrypted: (text: string) => boolean;
  /** Rejects when the password doesn't open the file. */
  parseWithPassword: (text: string, password: string) => Promise<Backup>;
  labels: BackupPasswordLabels;
};

/**
 * Asks for a backup's password: `"choose"` a new one, typed twice, for an
 * export; `"enter"` the one a file was saved with, to import it.
 * `onSubmit` resolves `false` when the password didn't work.
 */
export function BackupPasswordDrawer({
  mode,
  open,
  onOpenChange,
  labels,
  onSubmit,
}: {
  mode: "choose" | "enter";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: BackupPasswordLabels;
  onSubmit: (password: string) => Promise<boolean>;
}) {
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choosing = mode === "choose";

  function changeOpen(next: boolean) {
    if (!next) {
      setPassword("");
      setRepeated("");
      setError(null);
    }
    onOpenChange(next);
  }

  function problem(): string | null {
    if (!choosing) return null;
    if (password.length < MIN_BACKUP_PASSWORD_LENGTH) return labels.tooShort;
    return password === repeated ? null : labels.mismatch;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = problem();
    setError(found);
    if (found || busy || password.length === 0) return;
    setBusy(true);
    try {
      const worked = await onSubmit(password);
      if (worked) changeOpen(false);
      else setError(labels.wrongPassword);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer showSwipeHandle open={open} onOpenChange={changeOpen}>
      <DrawerContent>
        <form onSubmit={(event) => void submit(event)}>
          <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
            <DrawerTitle>
              {choosing ? labels.exportTitle : labels.importTitle}
            </DrawerTitle>
            <DrawerDescription>
              {choosing ? labels.exportDescription : labels.importDescription}
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-3 px-4">
            <Input
              type="password"
              aria-label={labels.password}
              placeholder={labels.password}
              autoComplete={choosing ? "new-password" : "current-password"}
              value={password}
              aria-invalid={error !== null}
              onChange={(event) => setPassword(event.target.value)}
            />
            {choosing && (
              <Input
                type="password"
                aria-label={labels.repeatPassword}
                placeholder={labels.repeatPassword}
                autoComplete="new-password"
                value={repeated}
                aria-invalid={error !== null}
                onChange={(event) => setRepeated(event.target.value)}
              />
            )}
            {error && (
              <p role="alert" className="text-destructive m-0 text-sm">
                {error}
              </p>
            )}
          </div>
          <DrawerFooter className="pb-[calc(16px+env(safe-area-inset-bottom))]">
            <Button
              type="button"
              className="min-h-12.5 text-base"
              variant="outline"
              onClick={() => changeOpen(false)}
            >
              {labels.cancel}
            </Button>
            <Button
              type="submit"
              className="min-h-12.5 text-base"
              disabled={busy}
            >
              {choosing ? labels.exportConfirm : labels.importConfirm}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
