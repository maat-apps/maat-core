import type { BackupPasswordLabels } from "../src/backup-password-drawer";

/** The password drawer's labels, shared by the tests that open it. */
export const passwordLabels: BackupPasswordLabels = {
  exportTitle: "Protect the backup",
  exportDescription: "Without the password, the backup can't be opened.",
  exportConfirm: "Save backup",
  importTitle: "This backup has a password",
  importDescription: "Enter the password it was saved with.",
  importConfirm: "Open",
  password: "Password",
  repeatPassword: "Repeat password",
  tooShort: "At least 8 characters.",
  mismatch: "The passwords don't match.",
  wrongPassword: "Wrong password, or the file is damaged.",
  cancel: "Cancel",
};
