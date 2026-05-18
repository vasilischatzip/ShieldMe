/**
 * Tests for per-account derived keys (HKDF).
 * Covers: C-KEY-1, C-KEY-2, C-KEY-3.
 * Security controls: derivation determinism, cross-account isolation,
 * rotation invalidates old keys, IV uniqueness, non-extractable assertion,
 * tampered ciphertext rejected.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { FakeLocalStore } from "../../fakes/fake-storage";
import {
  createPerAccountKeyDerivation,
  disposeKey,
  type AccountKey,
  type DecryptError,
} from "~/core/per-account-keys";

/* ── Helpers ────────────────────────────────────────────────────── */

async function makeDerivation(store?: FakeLocalStore) {
  const inner = store ?? new FakeLocalStore();
  return createPerAccountKeyDerivation(inner);
}

/* ── Suite ──────────────────────────────────────────────────────── */

describe("Per-account key derivation (C-KEY-1, C-KEY-2, C-KEY-3)", () => {
  let store: FakeLocalStore;

  beforeEach(() => {
    store = new FakeLocalStore();
  });

  // ── Non-extractable (C-KEY-3) ──────────────────────────────────

  it("derived key is non-extractable", async () => {
    const d = await makeDerivation(store);
    const key = await d.deriveKey("account-a");
    expect(key.extractable).toBe(false);
  });

  // ── Derivation determinism ─────────────────────────────────────

  it("same accountId + same seed → encrypt/decrypt round-trips correctly", async () => {
    const d = await makeDerivation(store);
    const key = await d.deriveKey("account-a");
    const { iv, ciphertext } = await d.encrypt(key, "hello-world");

    // Re-derive from the SAME store (same seed) → same key behaviour
    const d2 = await makeDerivation(store);
    const key2 = await d2.deriveKey("account-a");
    const plaintext = await d2.decrypt(key2, { iv, ciphertext });
    expect(plaintext).toBe("hello-world");
  });

  it("same accountId on re-created derivation (same seed) produces equivalent key", async () => {
    const d = await makeDerivation(store);
    const key1 = await d.deriveKey("account-a");
    const blob = await d.encrypt(key1, "test-value");

    // Reconstruct derivation from same store
    const d2 = await makeDerivation(store);
    const key2 = await d2.deriveKey("account-a");
    const result = await d2.decrypt(key2, blob);
    expect(result).toBe("test-value");
  });

  // ── Cross-account isolation (C-KEY-1) ─────────────────────────

  it("keyA cannot decrypt ciphertext encrypted with keyB", async () => {
    const d = await makeDerivation(store);
    const keyA = await d.deriveKey("account-a");
    const keyB = await d.deriveKey("account-b");

    const blob = await d.encrypt(keyA, "sensitive-data");

    let error: DecryptError | undefined;
    try {
      await d.decrypt(keyB, blob);
    } catch (e) {
      error = e as DecryptError;
    }
    expect(error).toBeDefined();
    expect(["wrong-key", "tampered"]).toContain((error as DecryptError).kind);
  });

  it("keyB cannot decrypt ciphertext encrypted with keyA", async () => {
    const d = await makeDerivation(store);
    const keyA = await d.deriveKey("account-a");
    const keyB = await d.deriveKey("account-b");

    const blob = await d.encrypt(keyB, "other-account-data");

    await expect(d.decrypt(keyA, blob)).rejects.toMatchObject({
      kind: expect.stringMatching(/wrong-key|tampered/),
    });
  });

  // ── Tampered ciphertext rejected ───────────────────────────────

  it("tampered ciphertext is rejected with DecryptError", async () => {
    const d = await makeDerivation(store);
    const key = await d.deriveKey("account-a");
    const blob = await d.encrypt(key, "integrity-check");

    // Corrupt the ciphertext
    const tampered = {
      iv: blob.iv,
      ciphertext: blob.ciphertext.slice(0, -4) + "XXXX",
    };

    await expect(d.decrypt(key, tampered)).rejects.toMatchObject({
      kind: expect.stringMatching(/wrong-key|tampered/),
    });
  });

  it("tampered IV is rejected with DecryptError", async () => {
    const d = await makeDerivation(store);
    const key = await d.deriveKey("account-a");
    const blob = await d.encrypt(key, "integrity-check");

    const tamperedIv = {
      iv: btoa("000000000000"), // 12 bytes of zeros
      ciphertext: blob.ciphertext,
    };

    await expect(d.decrypt(key, tamperedIv)).rejects.toMatchObject({
      kind: expect.stringMatching(/wrong-key|tampered/),
    });
  });

  // ── IV uniqueness ──────────────────────────────────────────────

  it("two encryptions of the same plaintext produce different IVs", async () => {
    const d = await makeDerivation(store);
    const key = await d.deriveKey("account-a");

    const b1 = await d.encrypt(key, "same-plaintext");
    const b2 = await d.encrypt(key, "same-plaintext");

    expect(b1.iv).not.toBe(b2.iv);
    expect(b1.ciphertext).not.toBe(b2.ciphertext);
  });

  // ── Round-trip ─────────────────────────────────────────────────

  it("encrypt + decrypt round-trips Unicode plaintext", async () => {
    const d = await makeDerivation(store);
    const key = await d.deriveKey("account-unicode");
    const plaintext = "αβγδ — Ελληνικά 🔒";
    const blob = await d.encrypt(key, plaintext);
    const result = await d.decrypt(key, blob);
    expect(result).toBe(plaintext);
  });

  // ── Rotation invalidates old keys (C-KEY-2) ───────────────────

  it("rotateWrappingSeed: new derivation produces key that cannot decrypt old ciphertext", async () => {
    const d = await makeDerivation(store);
    const keyV1 = await d.deriveKey("account-a");
    const blob = await d.encrypt(keyV1, "pre-rotation-data");

    // Rotate the seed
    await d.rotateWrappingSeed();

    // Re-derive after rotation — different seed → different key
    const d2 = await makeDerivation(store);
    const keyV2 = await d2.deriveKey("account-a");

    await expect(d2.decrypt(keyV2, blob)).rejects.toMatchObject({
      kind: expect.stringMatching(/wrong-key|tampered/),
    });
  });

  it("rotateWrappingSeed: new key can encrypt and decrypt fresh data", async () => {
    const d = await makeDerivation(store);
    await d.rotateWrappingSeed();

    const d2 = await makeDerivation(store);
    const key = await d2.deriveKey("account-a");
    const blob = await d2.encrypt(key, "post-rotation");
    const result = await d2.decrypt(key, blob);
    expect(result).toBe("post-rotation");
  });

  it("rotateWrappingSeed is idempotent in that each call changes the seed", async () => {
    const d = await makeDerivation(store);
    const seedBefore = await store.get<string>("meta.kdfSalt");

    await d.rotateWrappingSeed();
    const seedAfter = await store.get<string>("meta.kdfSalt");

    expect(seedAfter).toBeDefined();
    expect(seedAfter).not.toBe(seedBefore);
  });

  // ── DecryptError.kind: no-seed ─────────────────────────────────

  it("decrypt with a key derived from a now-rotated (absent) seed stores still returns typed error", async () => {
    // Derive a key, capture blob, then manually wipe the seed to simulate
    // the pathological "seed removed from storage" case.
    const d = await makeDerivation(store);
    const key = await d.deriveKey("account-a");
    const blob = await d.encrypt(key, "data");

    // Remove the seed so a new derivation would fail to find it
    await store.remove("meta.kdfSalt");

    // A fresh derivation with no seed will create a new one → different key
    const d2 = await makeDerivation(store);
    const newKey = await d2.deriveKey("account-a");

    // Old blob can't be decrypted with the new key
    await expect(d2.decrypt(newKey, blob)).rejects.toMatchObject({
      kind: expect.stringMatching(/wrong-key|tampered/),
    });
  });

  // ── disposeKey (C-MEM-1 discipline marker) ─────────────────────

  it("disposeKey accepts an AccountKey and returns void (C-MEM-1 discipline marker)", () => {
    const key = {} as AccountKey;
    const result = disposeKey(key);
    expect(result).toBeUndefined();
  });
});
