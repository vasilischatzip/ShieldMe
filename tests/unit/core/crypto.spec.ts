import { describe, it, expect } from "vitest";
import {
  generateWrappingKey,
  encryptString,
  decryptString,
  rotateWrappingKey,
} from "~/core/crypto";

describe("Crypto", () => {
  it("generateWrappingKey produces a non-empty base64 string", async () => {
    const key = await generateWrappingKey();
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
    // 32 bytes base64 = 44 chars
    expect(key.length).toBe(44);
  });

  it("two generateWrappingKey calls produce different keys", async () => {
    const k1 = await generateWrappingKey();
    const k2 = await generateWrappingKey();
    expect(k1).not.toBe(k2);
  });

  it("encryptString + decryptString round-trips plaintext", async () => {
    const key = await generateWrappingKey();
    const plaintext = "my-secret-hibp-key-abc123";
    const envelope = await encryptString(plaintext, key);
    const result = await decryptString(envelope, key);
    expect(result).toBe(plaintext);
  });

  it("two encryptions of same plaintext produce different IVs (non-deterministic)", async () => {
    const key = await generateWrappingKey();
    const e1 = await encryptString("same", key);
    const e2 = await encryptString("same", key);
    expect(e1.iv).not.toBe(e2.iv);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
  });

  it("envelope ciphertext does NOT contain the plaintext", async () => {
    const key = await generateWrappingKey();
    const secret = "super-secret-value";
    const envelope = await encryptString(secret, key);
    expect(envelope.ciphertext).not.toContain(secret);
    expect(envelope.iv).not.toContain(secret);
  });

  it("decryptString with wrong key throws", async () => {
    const key1 = await generateWrappingKey();
    const key2 = await generateWrappingKey();
    const envelope = await encryptString("hello", key1);
    await expect(decryptString(envelope, key2)).rejects.toThrow();
  });

  it("decryptString with tampered ciphertext throws", async () => {
    const key = await generateWrappingKey();
    const envelope = await encryptString("hello", key);
    const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -2) + "XX" };
    await expect(decryptString(tampered, key)).rejects.toThrow();
  });

  it("rotateWrappingKey produces a new key and re-encrypted envelopes decryptable with new key", async () => {
    const oldKey = await generateWrappingKey();
    const secrets = ["secret-a", "secret-b", "secret-c"];
    const envelopes = await Promise.all(secrets.map((s) => encryptString(s, oldKey)));

    const { newKeyB64, rotatedEnvelopes } = await rotateWrappingKey(oldKey, envelopes);

    expect(newKeyB64).not.toBe(oldKey);
    expect(rotatedEnvelopes).toHaveLength(3);

    for (let i = 0; i < secrets.length; i++) {
      const decrypted = await decryptString(rotatedEnvelopes[i]!, newKeyB64);
      expect(decrypted).toBe(secrets[i]);
    }
  });

  it("rotated envelopes are no longer decryptable with the old key", async () => {
    const oldKey = await generateWrappingKey();
    const env = await encryptString("my-secret", oldKey);
    const { newKeyB64, rotatedEnvelopes } = await rotateWrappingKey(oldKey, [env]);

    expect(newKeyB64).not.toBe(oldKey);
    await expect(decryptString(rotatedEnvelopes[0]!, oldKey)).rejects.toThrow();
  });
});
