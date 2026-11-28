import { describe, expect, it } from "vitest";
import {
  decryptJson,
  decryptJsonWithPassword,
  deriveKey,
  deriveKeyFromPassword,
  encryptJson,
  encryptJsonWithPassword,
  fromBase64Url,
  isEncryptedBlob,
  isPasswordEncryptedBlob,
  PASSWORD_ITERATIONS,
  randomBytes,
  toBase64Url,
} from "../src/crypto";

const INFO = "test-data-v1";

async function testKey(prfOutput = randomBytes(32), salt = randomBytes(16)) {
  return deriveKey(prfOutput, salt, INFO);
}

describe("deriveKey", () => {
  it("derives a usable, non-extractable AES-GCM key", async () => {
    const key = await testKey();

    expect(key.algorithm.name).toBe("AES-GCM");
    expect(key.extractable).toBe(false);
    expect(key.usages).toEqual(["encrypt", "decrypt"]);
  });

  it("derives the same key from the same PRF output, salt and info", async () => {
    const prfOutput = randomBytes(32);
    const salt = randomBytes(16);
    const blob = await encryptJson(await deriveKey(prfOutput, salt, INFO), {
      secret: "same",
    });

    const sameKey = await deriveKey(prfOutput, salt, INFO);

    await expect(decryptJson(sameKey, blob)).resolves.toEqual({
      secret: "same",
    });
  });

  it("derives a different key from a different salt", async () => {
    const prfOutput = randomBytes(32);
    const blob = await encryptJson(
      await deriveKey(prfOutput, randomBytes(16), INFO),
      { secret: "a" },
    );

    const otherKey = await deriveKey(prfOutput, randomBytes(16), INFO);

    await expect(decryptJson(otherKey, blob)).rejects.toThrow();
  });

  it("derives a different key from a different info string", async () => {
    const prfOutput = randomBytes(32);
    const salt = randomBytes(16);
    const blob = await encryptJson(await deriveKey(prfOutput, salt, INFO), {
      secret: "a",
    });

    const otherKey = await deriveKey(prfOutput, salt, "other-data-v1");

    await expect(decryptJson(otherKey, blob)).rejects.toThrow();
  });

  it("uses info verbatim as UTF-8, matching a plain WebCrypto HKDF derivation", async () => {
    // Guards compatibility with data an app already encrypted before moving
    // to this package: the derivation must stay byte-for-byte the same.
    const prfOutput = randomBytes(32);
    const salt = randomBytes(16);
    const material = await crypto.subtle.importKey(
      "raw",
      prfOutput,
      "HKDF",
      false,
      ["deriveKey"],
    );
    const referenceKey = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt,
        info: new TextEncoder().encode("routines-data-v1"),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const blob = await encryptJson(referenceKey, { routines: [] });

    const key = await deriveKey(prfOutput, salt, "routines-data-v1");

    await expect(decryptJson(key, blob)).resolves.toEqual({ routines: [] });
  });
});

describe("encryptJson / decryptJson", () => {
  it("round-trips a JSON value", async () => {
    const key = await testKey();
    const value = { routines: [{ id: "r1", name: "Morning" }], count: 3 };

    const blob = await encryptJson(key, value);

    await expect(decryptJson(key, blob)).resolves.toEqual(value);
  });

  it("uses a fresh IV (and so a different ciphertext) on every call", async () => {
    const key = await testKey();

    const first = await encryptJson(key, { same: true });
    const second = await encryptJson(key, { same: true });

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("fails to decrypt with the wrong key", async () => {
    const blob = await encryptJson(await testKey(), { secret: "value" });

    await expect(decryptJson(await testKey(), blob)).rejects.toThrow();
  });

  it("fails to decrypt a tampered ciphertext", async () => {
    const key = await testKey();
    const blob = await encryptJson(key, { secret: "value" });
    const tampered = {
      ...blob,
      ciphertext: blob.ciphertext.slice(0, -4) + "AAAA",
    };

    await expect(decryptJson(key, tampered)).rejects.toThrow();
  });
});

describe("encryptJson / decryptJson with additional data", () => {
  it("decrypts only with the same additional data", async () => {
    const key = await testKey();
    const blob = await encryptJson(key, { secret: 1 }, "notes-data");

    await expect(decryptJson(key, blob, "notes-data")).resolves.toEqual({
      secret: 1,
    });
    await expect(decryptJson(key, blob, "notes-snapshot")).rejects.toThrow();
    await expect(decryptJson(key, blob)).rejects.toThrow();
  });
});

// The minimum count the decryption accepts: fast enough for unit tests.
const FAST = { iterations: 100_000 };

describe("deriveKeyFromPassword", () => {
  it("derives a usable, non-extractable AES-GCM key", async () => {
    const key = await deriveKeyFromPassword(
      "hunter2",
      randomBytes(16),
      100_000,
    );

    expect(key.algorithm.name).toBe("AES-GCM");
    expect(key.extractable).toBe(false);
    expect(key.usages).toEqual(["encrypt", "decrypt"]);
  });

  it("matches a plain WebCrypto PBKDF2 derivation", async () => {
    const salt = randomBytes(16);
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("hunter2"),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const reference = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const blob = await encryptJson(reference, { secret: 1 });

    const key = await deriveKeyFromPassword("hunter2", salt, 100_000);

    await expect(decryptJson(key, blob)).resolves.toEqual({ secret: 1 });
  });
});

describe("encryptJsonWithPassword / decryptJsonWithPassword", () => {
  it("round-trips a JSON value", async () => {
    const value = { notes: [{ title: "Zażółć gęślą jaźń" }] };
    const blob = await encryptJsonWithPassword("correct horse", value, FAST);

    await expect(
      decryptJsonWithPassword("correct horse", blob),
    ).resolves.toEqual(value);
  });

  it("uses a fresh salt and IV on every call", async () => {
    const first = await encryptJsonWithPassword("pw", { a: 1 }, FAST);
    const second = await encryptJsonWithPassword("pw", { a: 1 }, FAST);

    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("stores a 16-byte salt, a 12-byte IV and nothing readable", async () => {
    const blob = await encryptJsonWithPassword("pw", { title: "Secret" }, FAST);

    expect(atob(blob.salt)).toHaveLength(16);
    expect(atob(blob.iv)).toHaveLength(12);
    expect(JSON.stringify(blob)).not.toContain("Secret");
  });

  it("defaults to the full iteration count", async () => {
    const blob = await encryptJsonWithPassword("pw", 1);

    expect(blob).toMatchObject({
      kdf: "PBKDF2-SHA256",
      iterations: PASSWORD_ITERATIONS,
    });
  });

  it("fails with the wrong password", async () => {
    const blob = await encryptJsonWithPassword("right", { a: 1 }, FAST);

    await expect(decryptJsonWithPassword("wrong", blob)).rejects.toThrow();
  });

  it("fails with other additional data", async () => {
    const blob = await encryptJsonWithPassword(
      "pw",
      { a: 1 },
      {
        ...FAST,
        additionalData: "notes-backup",
      },
    );

    await expect(
      decryptJsonWithPassword("pw", blob, "notes-backup"),
    ).resolves.toEqual({ a: 1 });
    await expect(
      decryptJsonWithPassword("pw", blob, "routines-backup"),
    ).rejects.toThrow();
  });

  it("opens with the same password however its letters are encoded", async () => {
    // "ó" as one code point (NFC) and as "o" + a combining accent (NFD).
    const blob = await encryptJsonWithPassword(
      "zo\u0301ł".normalize("NFC"),
      1,
      FAST,
    );

    await expect(
      decryptJsonWithPassword("zo\u0301ł".normalize("NFD"), blob),
    ).resolves.toBe(1);
  });

  it("refuses an empty password", async () => {
    await expect(encryptJsonWithPassword("", 1, FAST)).rejects.toThrow();
  });

  it.each([1, 99_999, 10_000_001])(
    "refuses to run %i iterations from a stored blob",
    async (iterations) => {
      const blob = await encryptJsonWithPassword("pw", 1, FAST);

      await expect(
        decryptJsonWithPassword("pw", { ...blob, iterations }),
      ).rejects.toThrow("Unsupported");
    },
  );
});

describe("isPasswordEncryptedBlob", () => {
  it("tells a password blob from a plain encrypted blob", async () => {
    const blob = await encryptJsonWithPassword("pw", 1, FAST);

    expect(isPasswordEncryptedBlob(blob)).toBe(true);
    expect(isPasswordEncryptedBlob({ iv: blob.iv, ciphertext: "x" })).toBe(
      false,
    );
    expect(isPasswordEncryptedBlob({ ...blob, iterations: "many" })).toBe(
      false,
    );
    expect(isPasswordEncryptedBlob(null)).toBe(false);
  });
});

describe("isEncryptedBlob", () => {
  it("accepts a value shaped like an encrypted blob", () => {
    expect(isEncryptedBlob({ iv: "abc", ciphertext: "def" })).toBe(true);
  });

  it.each([
    ["plain data", { routines: [], state: {} }],
    ["null", null],
    ["a string", "abc"],
    ["a missing ciphertext", { iv: "abc" }],
    ["a non-string iv", { iv: 1, ciphertext: "def" }],
  ])("rejects %s", (_, value) => {
    expect(isEncryptedBlob(value)).toBe(false);
  });
});

describe("randomBytes", () => {
  it("returns the requested length and varies between calls", () => {
    const a = randomBytes(16);
    const b = randomBytes(16);

    expect(a).toHaveLength(16);
    expect(a).not.toEqual(b);
  });
});

describe("toBase64Url / fromBase64Url", () => {
  it("round-trips bytes of every padding length", () => {
    for (const length of [0, 1, 2, 3, 16, 32]) {
      const bytes = randomBytes(length);

      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });

  it("accepts an ArrayBuffer as well as a Uint8Array", () => {
    const bytes = randomBytes(8);

    expect(toBase64Url(bytes.buffer)).toBe(toBase64Url(bytes));
  });

  it("produces URL-safe output without padding", () => {
    const encoded = toBase64Url(new Uint8Array([251, 255, 191]));

    expect(encoded).toBe("-_-_");
    expect(toBase64Url(new Uint8Array([1]))).toBe("AQ");
  });
});
