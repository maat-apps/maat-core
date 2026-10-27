import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAppSettings,
  parseRelockAfter,
  relockAfterMsFor,
} from "../src/app-settings";
import { DEFAULT_RELOCK_AFTER_MS } from "../src/lock";
import { memoryStorage } from "./memory-storage";

const KEY = "test-settings";

const ENROLMENT = {
  credentialId: "cred",
  userId: "user",
  createdAt: "2026-01-01T00:00:00.000Z",
  encryptionSupported: false,
};

beforeEach(() => vi.stubGlobal("window", {}));
afterEach(() => vi.unstubAllGlobals());

function plainSettings(initial: Record<string, unknown> = {}) {
  const { storage, data } = memoryStorage(initial);
  return { settings: createAppSettings({ storage, key: KEY }), data };
}

describe("relock choices", () => {
  it("maps each choice to the lock's delay", () => {
    expect(relockAfterMsFor("now")).toBe(0);
    expect(relockAfterMsFor("30s")).toBe(DEFAULT_RELOCK_AFTER_MS);
    expect(relockAfterMsFor("close")).toBeNull();
  });

  it("falls back to 30 s for anything unrecognised", () => {
    expect(parseRelockAfter("close")).toBe("close");
    expect(parseRelockAfter("1h")).toBe("30s");
    expect(parseRelockAfter(undefined)).toBe("30s");
  });
});

describe("createAppSettings", () => {
  it("starts from the defaults, not ready", () => {
    const { settings } = plainSettings();

    expect(settings.getSnapshot()).toEqual({
      lock: null,
      relockAfter: "30s",
      installed: false,
    });
    expect(settings.isReady()).toBe(false);
    expect(settings.isReadyOnServer()).toBe(false);
  });

  it("reads each stored field on its own", async () => {
    const { settings } = plainSettings({
      [KEY]: { lock: { broken: true }, relockAfter: "close", installed: 1 },
    });
    await settings.whenLoaded();

    expect(settings.getSnapshot()).toEqual({
      lock: null,
      relockAfter: "close",
      installed: false,
    });
    expect(settings.isReady()).toBe(true);
  });

  it("keeps the defaults for a stored value that isn't a record", async () => {
    const { settings } = plainSettings({ [KEY]: "nonsense" });
    await settings.whenLoaded();

    expect(settings.getSnapshot().relockAfter).toBe("30s");
  });

  it("stores the lock enrolment and the relock choice", async () => {
    const { settings, data } = plainSettings();
    await settings.whenLoaded();

    settings.setLockEnrolment(ENROLMENT);
    settings.setRelockAfter("now");

    expect(data.get(KEY)).toMatchObject({
      lock: ENROLMENT,
      relockAfter: "now",
    });
    expect(settings.relockAfterMs()).toBe(0);
  });

  it("marks the app installed once", async () => {
    const { settings } = plainSettings();
    await settings.whenLoaded();
    let changes = 0;
    settings.subscribe(() => (changes += 1));

    settings.markInstalled();
    settings.markInstalled();

    expect(settings.getSnapshot().installed).toBe(true);
    expect(changes).toBe(1);
  });

  it("adds the app's own preferences", async () => {
    const { storage } = memoryStorage({
      [KEY]: { installed: true, theme: 42 },
    });
    const settings = createAppSettings({
      storage,
      key: KEY,
      extra: {
        defaults: { theme: "dark" },
        parse: (stored) => ({
          theme: typeof stored.theme === "string" ? stored.theme : "dark",
        }),
      },
    });
    await settings.whenLoaded();

    expect(settings.getSnapshot()).toEqual({
      lock: null,
      relockAfter: "30s",
      installed: true,
      theme: "dark",
    });
    settings.set({ theme: "light" });
    expect(settings.getSnapshot().theme).toBe("light");
  });
});
