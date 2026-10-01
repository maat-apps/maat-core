// The app lock: a WebAuthn platform-authenticator gate that, on a device
// supporting the PRF extension, becomes real encryption — an AES-GCM key is
// derived from the credential's PRF output (./crypto's deriveKey) and handed
// to the app's storage through a key holder. Without PRF it stays a UI gate
// only, and the app's settings must say so.
//
// WebAuthn cannot request a specific biometric: `userVerification:
// "required"` asks the platform to verify the user and the OS picks how —
// fingerprint, face, PIN or pattern.
import * as v from "valibot";

import { deriveKey, fromBase64Url, randomBytes, toBase64Url } from "./crypto";

// --- Enrolment ----------------------------------------------------------------

type LockEnrolmentOutput = {
  credentialId: string;
  userId: string;
  createdAt: string;
  encryptionSupported: boolean;
  prfSalt?: string;
};

// prfSalt is meaningless without encryptionSupported, so the transform drops
// it rather than trusting a stale/tampered value that disagrees with the flag.
const LockEnrolmentSchema = v.pipe(
  v.object({
    credentialId: v.string(),
    userId: v.string(),
    createdAt: v.fallback(v.string(), () => new Date().toISOString()),
    encryptionSupported: v.fallback(v.boolean(), false),
    prfSalt: v.optional(v.string()),
  }),
  v.transform((value): LockEnrolmentOutput => {
    const { prfSalt, ...rest } = value;
    return value.encryptionSupported ? { ...rest, prfSalt } : rest;
  }),
);

/**
 * What an app persists about its lock. None of it is secret: the credential
 * id is a handle that unlocks nothing on its own, and `prfSalt` /
 * `encryptionSupported` say how data is encrypted, not with what — the key
 * itself is never stored.
 */
export type LockEnrolment = v.InferOutput<typeof LockEnrolmentSchema>;

/** A stored enrolment, or `null` (no lock) for anything corrupt or partial. */
export function parseLockEnrolment(value: unknown): LockEnrolment | null {
  const result = v.safeParse(LockEnrolmentSchema, value);
  return result.success ? result.output : null;
}

// --- Key holder ---------------------------------------------------------------

export type KeyHolder = {
  /** The current key, or `null` when nothing is encrypted. */
  get: () => CryptoKey | null;
  set: (key: CryptoKey | null) => void;
  /**
   * Resolves once a key has been set — immediately if one already was. An
   * encrypting app's storage awaits this before its first read, since its
   * data is unreadable (and gated behind the lock screen) until then.
   */
  whenSet: () => Promise<void>;
};

/**
 * The one place an app's encryption key lives in memory, shared by the lock
 * (which sets it) and every module that encrypts what it persists (which
 * reads it) — so neither has to import the other.
 */
export function createKeyHolder(): KeyHolder {
  let key: CryptoKey | null = null;
  let hasBeenSet = false;
  let resolveSet: (() => void) | null = null;
  let setPromise: Promise<void> | null = null;

  return {
    get: () => key,
    set(next) {
      key = next;
      if (!next) return;
      hasBeenSet = true;
      resolveSet?.();
      resolveSet = null;
    },
    whenSet() {
      if (hasBeenSet) return Promise.resolve();
      setPromise ??= new Promise((resolve) => {
        resolveSet = resolve;
      });
      return setPromise;
    },
  };
}

// --- Lock ---------------------------------------------------------------------

export type AppLockOptions = {
  /** Shown by the platform prompt, e.g. "Routines". */
  name: string;
  /**
   * HKDF info binding the key to this app's data format, e.g.
   * `"routines-data-v1"`. **Never change it once the app has encrypted
   * data**, or that data can't be decrypted any more.
   */
  keyInfo: string;
  keyHolder: KeyHolder;
  enrolment: {
    get: () => LockEnrolment | null;
    set: (enrolment: LockEnrolment | null) => void;
  };
  data: {
    /**
     * Writes the in-memory data back with the holder's current key — right
     * after encryption starts or stops, so nothing stays stored in the old
     * form until the next unrelated edit.
     */
    rewrite: () => void;
    /**
     * Wipes the app's data (and anything derived from it, like an update
     * snapshot). Only called when the key is gone for good.
     */
    erase: () => void | Promise<void>;
  };
};

export type AppLock = {
  /** True when this browser has a built-in authenticator it can prompt for. */
  isSupported: () => Promise<boolean>;
  /**
   * Registers a platform credential and persists its enrolment. Throws if
   * the user cancels or the platform refuses.
   */
  enrol: () => Promise<LockEnrolment>;
  /** Prompts for the authenticator; false when cancelled or it failed. */
  verify: (enrolment: LockEnrolment) => Promise<boolean>;
  /**
   * Turns the lock off while unlocked (the key, if any, is in memory) —
   * fully recoverable: data is rewritten unencrypted.
   */
  disable: () => void;
  /**
   * The escape hatch when the authenticator is gone: no key, so encrypted
   * data is unreadable. Clears the enrolment and erases the data. Warn the
   * user first — this doesn't ask.
   */
  disableAndErase: () => Promise<void>;
  /** Whether this session has passed the lock (memory only). */
  isSessionUnlocked: () => boolean;
  subscribeToUnlock: (listener: () => void) => () => void;
};

const PROMPT_TIMEOUT_MS = 60_000;
const ES256 = -7;
const RS256 = -257;

export function createAppLock(options: AppLockOptions): AppLock {
  const { name, keyInfo, keyHolder, enrolment, data } = options;

  // Closing the app locks it again. Enrolling counts as passing: the user
  // just completed the very same platform prompt.
  let sessionUnlocked = false;
  const unlockListeners = new Set<() => void>();

  function markSessionUnlocked(): void {
    sessionUnlocked = true;
    for (const listener of unlockListeners) {
      listener();
    }
  }

  async function isSupported(): Promise<boolean> {
    if (
      typeof window === "undefined" ||
      !window.isSecureContext ||
      typeof window.PublicKeyCredential === "undefined"
    ) {
      return false;
    }
    try {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  // PRF can only be *requested* at creation — the secret only ever comes
  // back from get(), so a PRF-capable device needs a second prompt right
  // after the first to start encrypting now rather than at the next unlock.
  async function deriveKeyAfterCreate(
    rawId: ArrayBuffer,
  ): Promise<string | undefined> {
    const salt = randomBytes(32);
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: "public-key", id: rawId }],
        userVerification: "required",
        timeout: PROMPT_TIMEOUT_MS,
        extensions: { prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential | null;
    const prfResult =
      assertion?.getClientExtensionResults().prf?.results?.first;
    if (!prfResult) return undefined;
    keyHolder.set(await deriveKey(prfResult, salt, keyInfo));
    return toBase64Url(salt);
  }

  async function enrol(): Promise<LockEnrolment> {
    const userId = randomBytes(16);
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name },
        user: { id: userId, name, displayName: name },
        pubKeyCredParams: [
          { type: "public-key", alg: ES256 },
          { type: "public-key", alg: RS256 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: PROMPT_TIMEOUT_MS,
        attestation: "none",
        extensions: { prf: {} },
      },
    })) as PublicKeyCredential | null;
    if (!credential) {
      throw new Error("The device did not return a credential.");
    }

    const prfSalt =
      credential.getClientExtensionResults().prf?.enabled === true
        ? await deriveKeyAfterCreate(credential.rawId)
        : undefined;
    const encryptionSupported = prfSalt !== undefined;

    const enrolled: LockEnrolment = {
      credentialId: toBase64Url(credential.rawId),
      userId: toBase64Url(userId),
      createdAt: new Date().toISOString(),
      encryptionSupported,
      ...(encryptionSupported && { prfSalt }),
    };
    enrolment.set(enrolled);
    markSessionUnlocked();
    if (encryptionSupported) data.rewrite();
    return enrolled;
  }

  // Unlike enrolment, PRF eval rides along in the assertion itself — one
  // prompt both passes the lock and derives the key.
  async function verify(enrolled: LockEnrolment): Promise<boolean> {
    try {
      const salt =
        enrolled.encryptionSupported && enrolled.prfSalt
          ? fromBase64Url(enrolled.prfSalt)
          : null;
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: randomBytes(32),
          allowCredentials: [
            { type: "public-key", id: fromBase64Url(enrolled.credentialId) },
          ],
          userVerification: "required",
          timeout: PROMPT_TIMEOUT_MS,
          ...(salt && { extensions: { prf: { eval: { first: salt } } } }),
        },
      })) as PublicKeyCredential | null;
      if (assertion === null) return false;

      if (salt) {
        const prfResult =
          assertion.getClientExtensionResults().prf?.results?.first;
        // A "pass" without the key would strand the user in an unlocked
        // app whose data can't be read — treat it as a failure instead.
        if (!prfResult) return false;
        keyHolder.set(await deriveKey(prfResult, salt, keyInfo));
      }

      markSessionUnlocked();
      return true;
    } catch {
      return false;
    }
  }

  function disable(): void {
    enrolment.set(null);
    keyHolder.set(null);
    data.rewrite();
    markSessionUnlocked();
  }

  async function disableAndErase(): Promise<void> {
    enrolment.set(null);
    keyHolder.set(null);
    try {
      await data.erase();
    } finally {
      markSessionUnlocked();
    }
  }

  return {
    isSupported,
    enrol,
    verify,
    disable,
    disableAndErase,
    isSessionUnlocked: () => sessionUnlocked,
    subscribeToUnlock(listener) {
      unlockListeners.add(listener);
      return () => {
        unlockListeners.delete(listener);
      };
    },
  };
}
