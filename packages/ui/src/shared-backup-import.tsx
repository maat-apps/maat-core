import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { Button } from "./button";
import { ConfirmDrawer } from "./confirm-drawer";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./drawer";

/** @maat-apps/core/share-target's `SHARED_BACKUP_PARAM`. */
const SHARED_BACKUP_PARAM = "shared-backup";

export type SharedBackupImportLabels = {
  importTitle: string;
  importDescription: string;
  importConfirm: string;
  importFailed: string;
  cancel: string;
  done: string;
};

/**
 * A backup shared to the app from another one (@maat-apps/core/share-target)
 * lands on home with `?shared-backup`; render this there. It takes the
 * parked file and imports it only after the same confirmation as Settings
 * → Import, or says the file isn't a backup.
 */
export function SharedBackupImport<Backup>({
  take,
  parse,
  onImport,
  labels,
}: {
  /** core's `takeSharedBackup`, bound to the app's base URL and cache. */
  take: () => Promise<string | null>;
  /** Throws for a file that isn't this app's backup. */
  parse: (text: string) => Backup;
  /** Called once the user confirms — an app merges, it doesn't replace. */
  onImport: (backup: Backup) => void;
  labels: SharedBackupImportLabels;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const shared = searchParams.has(SHARED_BACKUP_PARAM);
  const [pendingImport, setPendingImport] = useState<{
    backup: Backup;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!shared) return;
    // Dropped right away so a reload or Back doesn't ask again.
    setSearchParams({}, { replace: true });
    void take().then((text) => {
      if (text === null) return;
      try {
        setPendingImport({ backup: parse(text) });
      } catch {
        setFailed(true);
      }
    });
  }, [shared, setSearchParams, take, parse]);

  function confirmImport() {
    if (!pendingImport) return;
    onImport(pendingImport.backup);
    setPendingImport(null);
  }

  return (
    <>
      <ConfirmDrawer
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
        title={labels.importTitle}
        description={labels.importDescription}
        cancelLabel={labels.cancel}
        confirmLabel={labels.importConfirm}
        onConfirm={confirmImport}
      />
      <Drawer showSwipeHandle open={failed} onOpenChange={setFailed}>
        <DrawerContent>
          <DrawerHeader className="group-data-[swipe-axis=y]/drawer-popup:text-left">
            <DrawerTitle>{labels.importFailed}</DrawerTitle>
          </DrawerHeader>
          <DrawerFooter className="pb-[calc(16px+env(safe-area-inset-bottom))]">
            <Button
              className="min-h-12.5 text-base"
              variant="outline"
              onClick={() => setFailed(false)}
            >
              {labels.done}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
