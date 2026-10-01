import { afterEach, describe, expect, it, vi } from "vitest";

import { decryptJson, encryptJson, randomBytes } from "../src/crypto";
import {
  createAppLock,
  createKeyHolder,
  parseLockEnrolment,
  type LockEnrolment,
} from "../src/lock";

const PRF_OUTPUT = randomBytes(32);

/** A fake credential/assertion; no `extensionResults` = no PRF support. */
function fakeCredential(
  extensionResults: AuthenticationExtensionsClientOutputs = {},
): PublicKeyCredential {
  return {
    rawId: new Uint8Array([1, 2, 3]).buffer,
    getClientExtensionResults: () => extensionResults,
  } as unknown as PublicKeyCredential;
}

const withPrfSecret = () =>
  fakeCredential({ prf: { results: { first: PRF_OUTPUT } } });

function stubCredentials(credentials: {
  create?: () => Promise<unknown>;
  get?: () => Promise<unknown>;
}) {
  const stubbed = {
    create: vi.fn(credentials.create ?? (() => Promise.resolve(null))),
    get: vi.fn(credentials.get ?? (() => Promise.resolve(null))),
  };
  vi.stubGlobal("navigator", { credentials: stubbed });
  return stubbed;
}

function setup() {
  let stored: LockEnrolment | null = null;
  const keyHolder = createKeyHolder();
  const data = { rewrite: vi.fn(), erase: vi.fn() };
  const lock = createAppLock({
    name: "Test",
    keyInfo: "test-data-v1",
    keyHolder,
    enrolment: {
      get: () => stored,
      set: (next) => {
        stored = next;
      },
    },
    data,
  });
  return { lock, keyHolder, data, getStored: () => stored };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseLockEnrolment", () => {
  const valid = {
    credentialId: "abc",
    userId: "def",
    createdAt: "2026-01-01T00:00:00.000Z",
    encryptionSupported: true,
    prfSalt: "salt",
  };

  it("keeps a valid encrypted enrolment", () => {
    expect(parseLockEnrolment(valid)).toEqual(valid);
  });

  it("drops prfSalt when encryption isn't supported", () => {
    expect(
      parseLockEnrolment({ ...valid, encryptionSupported: false }),
    ).not.toHaveProperty("prfSalt");
  });

  it("defaults a missing encryptionSupported to false", () => {
    expect(
      parseLockEnrolment({ credentialId: "abc", userId: "def" })
        ?.encryptionSupported,
    ).toBe(false);
  });

  it("is null for anything without a credential", () => {
    expect(parseLockEnrolment({ userId: "def" })).toBeNull();
  });
});

describe("createKeyHolder", () => {
  it("starts without a key", () => {
    expect(createKeyHolder().get()).toBeNull();
  });

  it("resolves whenSet once a key is set", async () => {
    const holder = createKeyHolder();
    const waiting = holder.whenSet();
    holder.set(
      await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ]),
    );

    await expect(waiting).resolves.toBeUndefined();
  });

  it("resolves whenSet immediately after a key was already set", async () => {
    const holder = createKeyHolder();
    holder.set(
      await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ]),
    );
    holder.set(null);

    await expect(holder.whenSet()).resolves.toBeUndefined();
  });

  it("doesn't resolve whenSet on a null key", async () => {
    const holder = createKeyHolder();
    const settled = vi.fn();
    void holder.whenSet().then(settled);
    holder.set(null);
    await Promise.resolve();

    expect(settled).not.toHaveBeenCalled();
  });
});

describe("isSupported", () => {
  it("is false outside a browser", async () => {
    await expect(setup().lock.isSupported()).resolves.toBe(false);
  });

  it("is false without a secure context", async () => {
    vi.stubGlobal("window", { isSecureContext: false });
    await expect(setup().lock.isSupported()).resolves.toBe(false);
  });

  it("is false without PublicKeyCredential", async () => {
    vi.stubGlobal("window", { isSecureContext: true });
    await expect(setup().lock.isSupported()).resolves.toBe(false);
  });

  it("reflects the platform authenticator check", async () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      PublicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: () =>
          Promise.resolve(true),
      },
    });
    await expect(setup().lock.isSupported()).resolves.toBe(true);
  });

  it("is false when the platform check throws", async () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      PublicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: () =>
          Promise.reject(new Error("nope")),
      },
    });
    await expect(setup().lock.isSupported()).resolves.toBe(false);
  });
});

describe("enrol", () => {
  it("throws when the device returns no credential", async () => {
    stubCredentials({});
    await expect(setup().lock.enrol()).rejects.toThrow();
  });

  it("enrols as a UI gate only without PRF support", async () => {
    stubCredentials({ create: () => Promise.resolve(fakeCredential()) });
    const { lock, keyHolder, data, getStored } = setup();

    const enrolment = await lock.enrol();

    expect(enrolment.encryptionSupported).toBe(false);
    expect(enrolment).not.toHaveProperty("prfSalt");
    expect(getStored()).toEqual(enrolment);
    expect(keyHolder.get()).toBeNull();
    expect(data.rewrite).not.toHaveBeenCalled();
  });

  it("marks the session unlocked and notifies listeners", async () => {
    stubCredentials({ create: () => Promise.resolve(fakeCredential()) });
    const { lock } = setup();
    const listener = vi.fn();
    lock.subscribeToUnlock(listener);

    await lock.enrol();

    expect(lock.isSessionUnlocked()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("derives a key and rewrites data encrypted with PRF support", async () => {
    stubCredentials({
      create: () => Promise.resolve(fakeCredential({ prf: { enabled: true } })),
      get: () => Promise.resolve(withPrfSecret()),
    });
    const { lock, keyHolder, data } = setup();

    const enrolment = await lock.enrol();

    expect(enrolment.encryptionSupported).toBe(true);
    expect(enrolment.prfSalt).toEqual(expect.any(String));
    expect(keyHolder.get()).not.toBeNull();
    expect(data.rewrite).toHaveBeenCalledTimes(1);
  });

  it("falls back to a UI gate when PRF returns no secret", async () => {
    stubCredentials({
      create: () => Promise.resolve(fakeCredential({ prf: { enabled: true } })),
      get: () => Promise.resolve(fakeCredential()),
    });
    const { lock, keyHolder } = setup();

    const enrolment = await lock.enrol();

    expect(enrolment.encryptionSupported).toBe(false);
    expect(keyHolder.get()).toBeNull();
  });
});

describe("verify", () => {
  async function enrolWithPrf() {
    stubCredentials({
      create: () => Promise.resolve(fakeCredential({ prf: { enabled: true } })),
      get: () => Promise.resolve(withPrfSecret()),
    });
    const enrolled = setup();
    const enrolment = await enrolled.lock.enrol();
    const encrypted = await encryptJson(enrolled.keyHolder.get()!, {
      secret: 1,
    });
    return { enrolment, encrypted };
  }

  it("passes a gate-only lock without deriving a key", async () => {
    stubCredentials({
      create: () => Promise.resolve(fakeCredential()),
      get: () => Promise.resolve(fakeCredential()),
    });
    const enrolment = await setup().lock.enrol();
    const { lock, keyHolder } = setup();

    await expect(lock.verify(enrolment)).resolves.toBe(true);
    expect(lock.isSessionUnlocked()).toBe(true);
    expect(keyHolder.get()).toBeNull();
  });

  it("re-derives the same key as enrolment", async () => {
    const { enrolment, encrypted } = await enrolWithPrf();
    const { lock, keyHolder } = setup();

    await lock.verify(enrolment);

    await expect(decryptJson(keyHolder.get()!, encrypted)).resolves.toEqual({
      secret: 1,
    });
  });

  it("fails when the prompt is cancelled", async () => {
    const { enrolment } = await enrolWithPrf();
    stubCredentials({ get: () => Promise.resolve(null) });
    const { lock } = setup();

    await expect(lock.verify(enrolment)).resolves.toBe(false);
    expect(lock.isSessionUnlocked()).toBe(false);
  });

  it("fails when an encrypting lock gets no PRF secret", async () => {
    const { enrolment } = await enrolWithPrf();
    stubCredentials({ get: () => Promise.resolve(fakeCredential()) });
    const { lock } = setup();

    await expect(lock.verify(enrolment)).resolves.toBe(false);
  });

  it("fails when the platform throws", async () => {
    const { enrolment } = await enrolWithPrf();
    stubCredentials({ get: () => Promise.reject(new Error("gone")) });
    const { lock } = setup();

    await expect(lock.verify(enrolment)).resolves.toBe(false);
  });
});

describe("disable", () => {
  it("clears the enrolment and key, rewrites data and unlocks", async () => {
    stubCredentials({
      create: () => Promise.resolve(fakeCredential({ prf: { enabled: true } })),
      get: () => Promise.resolve(withPrfSecret()),
    });
    const { lock, keyHolder, data, getStored } = setup();
    await lock.enrol();
    data.rewrite.mockClear();

    lock.disable();

    expect(getStored()).toBeNull();
    expect(keyHolder.get()).toBeNull();
    expect(data.rewrite).toHaveBeenCalledTimes(1);
  });

  it("stops notifying an unsubscribed listener", () => {
    const { lock } = setup();
    const listener = vi.fn();
    lock.subscribeToUnlock(listener)();

    lock.disable();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("disableAndErase", () => {
  it("clears the enrolment, erases data and unlocks", async () => {
    const { lock, data, getStored } = setup();

    await lock.disableAndErase();

    expect(getStored()).toBeNull();
    expect(data.erase).toHaveBeenCalledTimes(1);
    expect(lock.isSessionUnlocked()).toBe(true);
  });

  it("still unlocks when erasing fails", async () => {
    const { lock, data } = setup();
    data.erase.mockRejectedValue(new Error("disk"));

    await expect(lock.disableAndErase()).rejects.toThrow("disk");
    expect(lock.isSessionUnlocked()).toBe(true);
  });
});
