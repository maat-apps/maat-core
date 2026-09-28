import { createPersistedStore } from "@maat-apps/core/persisted";

import { keyValueStore } from "./idb-store";
import { SETTINGS_KEY } from "./storage-keys";

// Browser/install state that isn't part of the app's data (or a backup):
// @maat-apps/core/persisted keeps it in memory, backed by IndexedDB.
export type AppSettings = {
  installed: boolean;
};

const settingsStore = createPersistedStore<AppSettings>({
  storage: keyValueStore,
  key: SETTINGS_KEY,
  defaults: { installed: false },
  parse: (stored) => {
    const installed = (stored as Partial<AppSettings>).installed;
    if (typeof installed !== "boolean") throw new Error("Invalid settings");
    return { installed };
  },
});

/** Test-only: resolves once the initial background read has finished. */
export const whenLoaded = settingsStore.whenLoaded;
export const subscribeToSettings = settingsStore.subscribe;
export const getSettingsSnapshot = settingsStore.getSnapshot;
export const getServerSettingsSnapshot = settingsStore.getServerSnapshot;

/** Chrome stops offering the install prompt once installed, even to a plain
 * browser tab — this flag is the only record of it. */
export function markInstalled(): void {
  if (getSettingsSnapshot().installed) return;
  settingsStore.set({ installed: true });
}
