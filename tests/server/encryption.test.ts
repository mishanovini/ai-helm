import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomBytes } from "crypto";

// We need to set ENCRYPTION_KEY before importing encryption module
const TEST_KEY = randomBytes(32).toString("hex");

describe("encryption", () => {
  let encrypt: (plaintext: string) => string;
  let decrypt: (packed64: string) => string;
  let isEncryptionConfigured: () => boolean;

  beforeAll(async () => {
    // Set environment variable before loading the module
    process.env.ENCRYPTION_KEY = TEST_KEY;
    const mod = await import("../../server/encryption");
    encrypt = mod.encrypt;
    decrypt = mod.decrypt;
    isEncryptionConfigured = mod.isEncryptionConfigured;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("should report encryption as configured", () => {
    expect(isEncryptionConfigured()).toBe(true);
  });

  it("should encrypt and decrypt a string round-trip", () => {
    const plaintext = "my-secret-api-key-12345";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same-key-different-output";
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
    // Both should decrypt to the same value
    expect(decrypt(encrypted1)).toBe(plaintext);
    expect(decrypt(encrypted2)).toBe(plaintext);
  });

  it("should handle empty strings", () => {
    const encrypted = encrypt("");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  it("should handle unicode characters", () => {
    const plaintext = "API密钥🔑 kl\u00e9\u010d";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should handle very long strings", () => {
    const plaintext = "x".repeat(10000);
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should throw on tampered ciphertext", () => {
    const encrypted = encrypt("test-data");
    const buf = Buffer.from(encrypted, "base64");
    // Flip a byte in the ciphertext (past IV + tag)
    if (buf.length > 30) {
      buf[30] ^= 0xff;
    }
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("should throw on data that is too short", () => {
    const shortData = Buffer.from("short").toString("base64");
    expect(() => decrypt(shortData)).toThrow("too short");
  });
});

describe("encryption without key", () => {
  it("should report not configured when ENCRYPTION_KEY is missing", async () => {
    // Temporarily remove key
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    // Re-import to test the function with current env
    // Note: isEncryptionConfigured reads env at call time, not import time
    const mod = await import("../../server/encryption");
    expect(mod.isEncryptionConfigured()).toBe(false);

    // Restore
    if (saved) process.env.ENCRYPTION_KEY = saved;
  });
});
