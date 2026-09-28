import { kvGet, kvSet } from "@/lib/idb-store";
import { SETTINGS_KEY } from "@/lib/storage-keys";

// A tiny persisted-flags store for browser/install state that isn't part of
// this app's own data (once it has some) — same split routines' own
// settings.ts makes.
export type AppSettings = {
  installed: boolean;
};

const defaultSettings: AppSettings = { installed: false };

const listeners = new Set<() => void>();
let settings: AppSettings = defaultSettings;
let loaded: Promise<void> | null = null;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function isAppSettings(value: unknown): value is AppSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AppSettings).installed === "boolean"
  );
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = kvGet<unknown>(SETTINGS_KEY)
    .then((stored) => {
      if (isAppSettings(stored)) settings = stored;
    })
    .catch(() => {
      // Keep the default settings.
    })
    .finally(() => {
      notify();
    });
}

/**
 * Resolves once the initial background read from IndexedDB has finished —
 * test-only.
 */
export function whenLoaded(): Promise<void> {
  ensureLoaded();
  return loaded ?? Promise.resolve();
}

export function subscribeToSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSettingsSnapshot(): AppSettings {
  ensureLoaded();
  return settings;
}

export function getServerSettingsSnapshot(): AppSettings {
  return defaultSettings;
}

function write(next: AppSettings): void {
  settings = next;
  notify();
  void kvSet(SETTINGS_KEY, next);
}

/** Chrome stops re-offering the install prompt once it considers the app
 * installed, even from a plain browser tab that never sees `standalone`
 * become true again — this is the only record of that fact surviving here. */
export function markInstalled(): void {
  if (getSettingsSnapshot().installed) return;
  write({ ...getSettingsSnapshot(), installed: true });
}
