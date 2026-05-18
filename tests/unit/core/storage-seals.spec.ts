/**
 * T066 — C-SEAL-1/2/3 HMAC storage seal tests.
 *
 * Write-first (TDD): tests for the SealedLocalStore decorator.
 *
 * Security controls:
 *   C-SEAL-1: Every LocalStore.set writes {value, hmac}. Every get verifies.
 *   C-SEAL-2: HMAC computed with HMAC-SHA-256 using the install secret.
 *   C-SEAL-3: Tampered state leads to a rejection (never silent).
 *
 * The SealedLocalStore wraps any LocalStore, adding HMAC protection.
 * Tests use FakeLocalStore as the inner store for isolation.
 */
import { describe, it, expect } from "vitest";
import { FakeLocalStore } from "../../fakes/fake-storage";
import {
  SealedLocalStore,
  createSealedStore,
  INSTALL_SECRET_KEY,
  TamperDetectedError,
} from "~/core/storage-seals";

/* ── Helpers ──────────────────────────────────────────────────── */

/** Generate a 32-byte test secret (deterministic for test isolation). */
async function makeSecret(): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(32);
  // Use a predictable pattern so tests are deterministic
  for (let i = 0; i < 32; i++) bytes[i] = (i * 7 + 13) & 0xff;
  return bytes.buffer;
}

async function makeSealedStore(): Promise<{
  inner: FakeLocalStore;
  sealed: SealedLocalStore;
}> {
  const inner = new FakeLocalStore();
  const secret = await makeSecret();
  const sealed = new SealedLocalStore(inner, secret);
  return { inner, sealed };
}

/* ════════════════════════════════════════════════════════════════
   1. Basic set / get round-trip
   ════════════════════════════════════════════════════════════════ */

describe("SealedLocalStore — set/get round-trip", () => {
  it("set + get returns the original value", async () => {
    const { sealed } = await makeSealedStore();
    await sealed.set("prefs", { locale: "en" });
    const result = await sealed.get<{ locale: string }>("prefs");
    expect(result).toEqual({ locale: "en" });
  });

  it("returns undefined for a key that was never set", async () => {
    const { sealed } = await makeSealedStore();
    expect(await sealed.get("missing")).toBeUndefined();
  });

  it("handles primitive values (string)", async () => {
    const { sealed } = await makeSealedStore();
    await sealed.set("name", "Alice");
    expect(await sealed.get<string>("name")).toBe("Alice");
  });

  it("handles primitive values (number)", async () => {
    const { sealed } = await makeSealedStore();
    await sealed.set("score", 42);
    expect(await sealed.get<number>("score")).toBe(42);
  });

  it("handles null", async () => {
    const { sealed } = await makeSealedStore();
    await sealed.set("empty", null);
    expect(await sealed.get("empty")).toBeNull();
  });

  it("handles arrays", async () => {
    const { sealed } = await makeSealedStore();
    await sealed.set("tags", ["a", "b", "c"]);
    expect(await sealed.get<string[]>("tags")).toEqual(["a", "b", "c"]);
  });
});

/* ════════════════════════════════════════════════════════════════
   2. HMAC envelope — inner store receives wrapped format
   ════════════════════════════════════════════════════════════════ */

describe("SealedLocalStore — HMAC envelope in inner store", () => {
  it("inner store receives an object with v and h fields", async () => {
    const { inner, sealed } = await makeSealedStore();
    await sealed.set("prefs", { locale: "en" });
    const raw = await inner.get<unknown>("prefs");
    expect(typeof raw).toBe("object");
    expect(raw).toHaveProperty("v");
    expect(raw).toHaveProperty("h");
  });

  it("inner store v field is a JSON string", async () => {
    const { inner, sealed } = await makeSealedStore();
    await sealed.set("prefs", { locale: "en" });
    const raw = await inner.get<{ v: unknown; h: unknown }>("prefs");
    expect(typeof raw?.v).toBe("string");
    expect(() => JSON.parse(raw!.v as string)).not.toThrow();
  });

  it("inner store h field is a non-empty hex string", async () => {
    const { inner, sealed } = await makeSealedStore();
    await sealed.set("key", "value");
    const raw = await inner.get<{ v: unknown; h: unknown }>("key");
    expect(typeof raw?.h).toBe("string");
    expect((raw!.h as string).length).toBeGreaterThan(0);
    // HMAC-SHA-256 = 32 bytes = 64 hex chars
    expect((raw!.h as string).length).toBe(64);
  });
});

/* ════════════════════════════════════════════════════════════════
   3. Tamper detection — C-SEAL-3
   ════════════════════════════════════════════════════════════════ */

describe("SealedLocalStore — tamper detection", () => {
  it("throws TamperDetectedError when value is modified after set", async () => {
    const { inner, sealed } = await makeSealedStore();
    await sealed.set("prefs", { locale: "en" });

    // Tamper: directly modify the inner store's v field
    const raw = await inner.get<{ v: string; h: string }>("prefs");
    await inner.set("prefs", { v: '{"locale":"el"}', h: raw!.h });

    await expect(sealed.get("prefs")).rejects.toBeInstanceOf(TamperDetectedError);
  });

  it("throws TamperDetectedError when HMAC is modified", async () => {
    const { inner, sealed } = await makeSealedStore();
    await sealed.set("score", 99);

    // Tamper: corrupt the HMAC
    const raw = await inner.get<{ v: string; h: string }>("score");
    const corruptH = raw!.h.replace(/[0-9a-f]/, (c) =>
      c === "f" ? "0" : String.fromCharCode(c.charCodeAt(0) + 1),
    );
    await inner.set("score", { v: raw!.v, h: corruptH });

    await expect(sealed.get("score")).rejects.toBeInstanceOf(TamperDetectedError);
  });

  it("TamperDetectedError has a key property", async () => {
    const { inner, sealed } = await makeSealedStore();
    await sealed.set("secret-data", "x");

    const raw = await inner.get<{ v: string; h: string }>("secret-data");
    await inner.set("secret-data", { v: "tampered", h: raw!.h });

    try {
      await sealed.get("secret-data");
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as TamperDetectedError).tamperedKey).toBe("secret-data");
    }
  });

  it("different key produces different HMAC (no HMAC reuse across keys)", async () => {
    const { inner, sealed } = await makeSealedStore();
    await sealed.set("a", "same-value");
    await sealed.set("b", "same-value");

    const rawA = await inner.get<{ v: string; h: string }>("a");
    const rawB = await inner.get<{ v: string; h: string }>("b");

    // Same plaintext, different key → HMAC must differ (key is included in HMAC input)
    expect(rawA!.h).not.toBe(rawB!.h);
  });
});

/* ════════════════════════════════════════════════════════════════
   4. patch / remove / clear delegation
   ════════════════════════════════════════════════════════════════ */

describe("SealedLocalStore — patch, remove, clear", () => {
  it("patch merges values and re-seals", async () => {
    const { sealed } = await makeSealedStore();
    await sealed.set("prefs", { locale: "en", theme: "dark" });
    await sealed.patch("prefs", { locale: "el" });
    const result = await sealed.get<{ locale: string; theme: string }>("prefs");
    expect(result).toEqual({ locale: "el", theme: "dark" });
  });

  it("remove deletes the key", async () => {
    const { sealed } = await makeSealedStore();
    await sealed.set("temp", 123);
    await sealed.remove("temp");
    expect(await sealed.get("temp")).toBeUndefined();
  });

  it("clear removes all keys", async () => {
    const { sealed } = await makeSealedStore();
    await sealed.set("a", 1);
    await sealed.set("b", 2);
    await sealed.clear();
    expect(await sealed.get("a")).toBeUndefined();
    expect(await sealed.get("b")).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════════
   5. createSealedStore — bootstrap helper
   ════════════════════════════════════════════════════════════════ */

describe("createSealedStore — bootstrap", () => {
  it("creates a new install secret on first call", async () => {
    const inner = new FakeLocalStore();
    const sealed = await createSealedStore(inner);
    expect(sealed).toBeInstanceOf(SealedLocalStore);
    // Inner store should have the install secret key set
    const secret = await inner.get(INSTALL_SECRET_KEY);
    expect(secret).toBeDefined();
  });

  it("reuses existing install secret on subsequent calls", async () => {
    const inner = new FakeLocalStore();
    const sealed1 = await createSealedStore(inner);
    await sealed1.set("prefs", { locale: "en" });

    // Second createSealedStore call reuses same inner → same secret
    const sealed2 = await createSealedStore(inner);
    const result = await sealed2.get<{ locale: string }>("prefs");
    expect(result).toEqual({ locale: "en" });
  });

  it("generated install secret is 32 bytes (stored as base64 string)", async () => {
    const inner = new FakeLocalStore();
    await createSealedStore(inner);
    const secretB64 = await inner.get<string>(INSTALL_SECRET_KEY);
    expect(typeof secretB64).toBe("string");
    // base64 of 32 bytes = ceil(32/3)*4 = 44 chars
    expect(secretB64!.length).toBe(44);
  });
});
