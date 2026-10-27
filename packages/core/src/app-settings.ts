import {
  DEFAULT_RELOCK_AFTER_MS,
  parseLockEnrolment,
  type LockEnrolment,
} from "./lock";
import { createPersistedStore, type PersistedStore } from "./persisted";
import type { KeyValueStore } from "./storage";

// The settings every app keeps outside its data (and its backups): the app
// lock's enrolment, how soon the lock comes back, and whether this browser
// has installed the app. A `persisted` store, so in memory once loaded and
// IndexedDB behind it; an app adds its own preferences through `extra`.

/** Right away, after 30 seconds in the background, or only once closed. */
export const RELOCK_CHOICES = ["now", "30s", "close"] as const;
export type RelockAfter = (typeof RELOCK_CHOICES)[number];

export const DEFAULT_RELOCK_AFTER: RelockAfter = "30s";

const RELOCK_AFTER_MS: Record<RelockAfter, number | null> = {
  now: 0,
  "30s": DEFAULT_RELOCK_AFTER_MS,
  close: null,
};

/** A choice as the lock's `relockAfterMs` takes it (`null`: once closed). */
export function relockAfterMsFor(choice: RelockAfter): number | null {
  return RELOCK_AFTER_MS[choice];
}

/** A stored choice, or the default for anything unrecognised. */
export function parseRelockAfter(value: unknown): RelockAfter {
  return (
    RELOCK_CHOICES.find((choice) => choice === value) ?? DEFAULT_RELOCK_AFTER
  );
}

export type BaseAppSettings = {
  /** The app lock's enrolment (./lock), `null` when off. */
  lock: LockEnrolment | null;
  /** How soon the lock comes back once the app is left. */
  relockAfter: RelockAfter;
  /**
   * Whether this browser has ever reported the app as installed. Chrome
   * stops offering the install prompt once installed, even to a plain
   * browser tab, so this flag is the only record of it (./install).
   */
  installed: boolean;
};

export type AppSettingsOptions<Extra extends object> = {
  storage: KeyValueStore;
  key: string;
  /**
   * The app's own preferences. `parse` reads them back from the stored
   * record — validate each field and fall back on its own.
   */
  extra?: {
    defaults: Extra;
    parse: (stored: Record<string, unknown>) => Extra;
  };
};

export type AppSettings<Extra extends object = Record<never, never>> =
  PersistedStore<BaseAppSettings & Extra> & {
    /** For useSyncExternalStore's server snapshot: never ready there. */
    isReadyOnServer(): boolean;
    setLockEnrolment(lock: LockEnrolment | null): void;
    setRelockAfter(relockAfter: RelockAfter): void;
    /** The lock's `relockAfterMs`: read on every hide, so a change applies at once. */
    relockAfterMs(): number | null;
    markInstalled(): void;
  };

const BASE_DEFAULTS: BaseAppSettings = {
  lock: null,
  relockAfter: DEFAULT_RELOCK_AFTER,
  installed: false,
};

/**
 * The app's settings store. Its "ready" signal is load-bearing: the lock
 * gate must not treat "not loaded yet" as "no lock enrolled", or a locked
 * device would flash its data on every cold start.
 */
export function createAppSettings<Extra extends object = Record<never, never>>({
  storage,
  key,
  extra,
}: AppSettingsOptions<Extra>): AppSettings<Extra> {
  type Settings = BaseAppSettings & Extra;
  const store = createPersistedStore<Settings>({
    storage,
    key,
    defaults: { ...BASE_DEFAULTS, ...extra?.defaults } as Settings,
    parse: (stored) => {
      const value = (
        typeof stored === "object" && stored !== null ? stored : {}
      ) as Record<string, unknown>;
      return {
        lock: parseLockEnrolment(value.lock),
        relockAfter: parseRelockAfter(value.relockAfter),
        installed: value.installed === true,
        ...extra?.parse(value),
      } as Settings;
    },
  });

  return {
    ...store,
    isReadyOnServer: () => false,
    setLockEnrolment(lock) {
      store.set({ lock } as Partial<Settings>);
    },
    setRelockAfter(relockAfter) {
      store.set({ relockAfter } as Partial<Settings>);
    },
    relockAfterMs: () => relockAfterMsFor(store.getSnapshot().relockAfter),
    markInstalled() {
      if (store.getSnapshot().installed) return;
      store.set({ installed: true } as Partial<Settings>);
    },
  };
}
