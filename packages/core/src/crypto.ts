// Derives an AES-GCM key from a WebAuthn PRF secret (or from a password, for
// backup files) and encrypts/decrypts JSON values with it, plus the
// byte/base64url helpers a WebAuthn ceremony needs. No storage or ceremony
// logic lives here: getting the PRF secret out of the authenticator is the
// app's job (its app lock); this module turns that secret into a key and
// uses it.

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** URL-safe, unpadded base64 — how WebAuthn ids are stored as strings. */
export function toBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The inverse of `toBase64Url`, as a `BufferSource` WebAuthn accepts. */
export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
}

/**
 * Turns a WebAuthn PRF secret into a non-extractable AES-GCM key via
 * HKDF-SHA256. The salt is per-enrolment (stored with the credential; its
 * job is domain separation, not secrecy), so the same PRF output always
 * derives the same key.
 *
 * `info` binds the key to one app's data format, e.g. `"routines-data-v1"`.
 * It is part of the stored format: **never change it for an app that already
 * has encrypted data**, or that data becomes impossible to decrypt.
 */
export async function deriveKey(
  prfOutput: BufferSource,
  hkdfSalt: BufferSource,
  info: string,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    prfOutput,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: hkdfSalt,
      info: new TextEncoder().encode(info),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type EncryptedBlob = {
  iv: string;
  ciphertext: string;
};

function gcmParams(
  iv: Uint8Array<ArrayBuffer>,
  additionalData?: string,
): AesGcmParams {
  return additionalData === undefined
    ? { name: "AES-GCM", iv }
    : {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(additionalData),
      };
}

/**
 * A fresh random IV per call — AES-GCM must never reuse an IV under one key.
 * `additionalData` isn't stored but binds the ciphertext to it: decrypting
 * needs the same value, so a blob can't be passed off as another kind.
 */
export async function encryptJson(
  key: CryptoKey,
  value: unknown,
  additionalData?: string,
): Promise<EncryptedBlob> {
  const iv = randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    gcmParams(iv, additionalData),
    key,
    plaintext,
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson<T>(
  key: CryptoKey,
  blob: EncryptedBlob,
  additionalData?: string,
): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    gcmParams(fromBase64(blob.iv), additionalData),
    key,
    fromBase64(blob.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** True for a value shaped like something `encryptJson` produced. */
export function isEncryptedBlob(value: unknown): value is EncryptedBlob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EncryptedBlob).iv === "string" &&
    typeof (value as EncryptedBlob).ciphertext === "string"
  );
}

// --- Password -----------------------------------------------------------------

/** PBKDF2-SHA256 iterations for new password-protected data (OWASP, 2023). */
export const PASSWORD_ITERATIONS = 600_000;

// A stored blob names its own count. Outside these bounds it's refused
// rather than run: a huge count from a crafted file would freeze the app.
const MIN_PASSWORD_ITERATIONS = 100_000;
const MAX_PASSWORD_ITERATIONS = 10_000_000;

/** An `EncryptedBlob` whose key comes from a password, with how to derive it. */
export type PasswordEncryptedBlob = EncryptedBlob & {
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
};

/**
 * A non-extractable AES-GCM key from a password, via PBKDF2-SHA256. The
 * password is NFC-normalised first, so "ó" typed on two keyboards that
 * encode it differently still derives the same key.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: BufferSource,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts `value` under a key from `password`, with a fresh random salt. */
export async function encryptJsonWithPassword(
  password: string,
  value: unknown,
  { additionalData, iterations = PASSWORD_ITERATIONS } = {} as {
    additionalData?: string;
    iterations?: number;
  },
): Promise<PasswordEncryptedBlob> {
  if (password.length === 0) throw new Error("The password is empty.");
  const salt = randomBytes(16);
  const key = await deriveKeyFromPassword(password, salt, iterations);
  return {
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: toBase64(salt),
    ...(await encryptJson(key, value, additionalData)),
  };
}

/** Throws when the password (or `additionalData`) doesn't open the blob. */
export async function decryptJsonWithPassword<T>(
  password: string,
  blob: PasswordEncryptedBlob,
  additionalData?: string,
): Promise<T> {
  if (
    blob.iterations < MIN_PASSWORD_ITERATIONS ||
    blob.iterations > MAX_PASSWORD_ITERATIONS
  ) {
    throw new Error("Unsupported key derivation settings.");
  }
  const key = await deriveKeyFromPassword(
    password,
    fromBase64(blob.salt),
    blob.iterations,
  );
  return decryptJson<T>(key, blob, additionalData);
}

/** True for a value shaped like something `encryptJsonWithPassword` produced. */
export function isPasswordEncryptedBlob(
  value: unknown,
): value is PasswordEncryptedBlob {
  if (!isEncryptedBlob(value)) return false;
  const blob = value as Partial<PasswordEncryptedBlob>;
  return (
    blob.kdf === "PBKDF2-SHA256" &&
    Number.isInteger(blob.iterations) &&
    typeof blob.salt === "string"
  );
}
