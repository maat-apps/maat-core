// Derives an AES-GCM key from a WebAuthn PRF secret and encrypts/decrypts
// JSON values with it, plus the byte/base64url helpers a WebAuthn ceremony
// needs. No storage or ceremony logic lives here: getting the PRF secret out
// of the authenticator is the app's job (its app lock); this module turns
// that secret into a key and uses it.

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

/** A fresh random IV per call — AES-GCM must never reuse an IV under one key. */
export async function encryptJson(
  key: CryptoKey,
  value: unknown,
): Promise<EncryptedBlob> {
  const iv = randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
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
): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(blob.iv) },
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
