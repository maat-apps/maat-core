import { Gear } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@maat-apps/ui/button";
import { PageHeader, PageTitle } from "@maat-apps/ui/page-header";
import {
  AppSection,
  SecuritySection,
  SettingsDrawer,
} from "@maat-apps/ui/settings-sections";
import { useInstallPrompt } from "../../hooks/use-install-prompt";
import { useTranslation } from "../../i18n/use-translation";
import { appLock } from "../../lib/app-lock";
import { appSettings } from "../../lib/app-settings";
import { updateApp } from "../../lib/app-update";

// A starting point, not a destination: a header with the settings gear and
// the settings every app shares (@maat-apps/ui/settings-sections). Add
// LanguageSection with a second locale, and DataSection (plus the update
// snapshot's restore row) once the app keeps data — see notes'
// settings-panel.tsx.
export function HomeView() {
  const { t } = useTranslation();
  const install = useInstallPrompt();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="mx-auto flex min-h-dvh w-[min(100%,480px)] flex-col gap-4 px-5 pt-28">
      <PageHeader>
        <PageTitle>{t("welcome")}</PageTitle>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={t("settings")}
          onClick={() => setSettingsOpen(true)}
        >
          <Gear className="size-6" />
        </Button>
      </PageHeader>
      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={t("settings")}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
          <SecuritySection
            lock={appLock}
            settings={appSettings}
            labels={{
              title: t("sectionSecurity"),
              appLock: t("appLock"),
              appLockDescription: t("appLockDescription"),
              appLockUnsupported: t("appLockUnsupported"),
              appLockFailed: t("appLockFailed"),
              relockAfter: t("relockAfter"),
              relockAfterDescription: t("relockAfterDescription"),
              relockNow: t("relockNow"),
              relock30s: t("relock30s"),
              relockClose: t("relockClose"),
              appLockNotice: t("appLockNotice"),
              appLockEncryptedNotice: t("appLockEncryptedNotice"),
            }}
          />
          <AppSection
            install={install}
            updateApp={updateApp}
            onStatus={() => undefined}
            labels={{
              title: t("sectionApp"),
              installApp: t("installApp"),
              installAppDescription: t("installAppDescription"),
              installAppInstalled: t("installAppInstalled"),
              installAppUnavailable: t("installAppUnavailable"),
              installAppAction: t("installAppAction"),
              updateApp: t("updateApp"),
              updateAppDescription: t("updateAppDescription"),
              updateAppAction: t("updateAppAction"),
              updateAppBusy: t("updateAppBusy"),
              updateConfirmTitle: t("updateConfirmTitle"),
              updateConfirmDescription: t("updateConfirmDescription"),
              cancel: t("cancel"),
            }}
          />
        </div>
      </SettingsDrawer>
    </div>
  );
}
