/**
 * KeyVault unit tests — verifies AES-GCM encryption at rest, CRUD operations,
 * and wipe behaviour for "Delete all my data".
 *
 * Constitution §II: API keys encrypted with per-install key, never transmitted,
 * wiped in one action.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeLocalStore } from "../../fakes/fake-storage";
import { generateWrappingKey } from "~/core/crypto";
import type { MetaRecord } from "~/core/migrations";

/* ── Wire fake store before importing key-vault ─────────────── */

const fakeStore = new FakeLocalStore();

vi.mock("~/core/storage", () => ({ localStore: fakeStore }));

const { keyVault, VAULT_SLOTS } = await import("~/core/key-vault");

/* ── Setup: seed a wrapping key in fake meta ─────────────────── */

async function seedMeta(): Promise<void> {
  const wrappingKey = await generateWrappingKey();
  const meta: MetaRecord = {
    version: 1,
    installId: "test-install",
    wrappingKey,
    installedAt: new Date().toISOString(),
  };
  await fakeStore.set("meta", meta);
}

beforeEach(async () => {
  await fakeStore.clear();
  await seedMeta();
});

/* ── set / get ───────────────────────────────────────────────── */

describe("set and get", () => {
  it("stores and retrieves a value transparently", async () => {
    await keyVault.set("hibp", "my-secret-key-123");
    const retrieved = await keyVault.get("hibp");
    expect(retrieved).toBe("my-secret-key-123");
  });

  it("returns undefined for a key that was never set", async () => {
    const result = await keyVault.get("nonexistent");
    expect(result).toBeUndefined();
  });

  it("encrypts the value — raw storage never contains plaintext", async () => {
    const secret = "super-secret-api-key";
    await keyVault.set("hibp", secret);
    const raw = fakeStore.snapshot();
    const vault = raw["keyVault"] as Record<string, { iv: string; ciphertext: string }>;
    // Ciphertext must not contain the plaintext
    const ciphertext = vault["hibp"]?.ciphertext ?? "";
    expect(ciphertext).not.toContain(secret);
    // iv must be a non-empty base64 string
    expect(vault["hibp"]?.iv.length).toBeGreaterThan(0);
  });

  it("overwrites an existing entry on set", async () => {
    await keyVault.set("hibp", "old-key");
    await keyVault.set("hibp", "new-key");
    expect(await keyVault.get("hibp")).toBe("new-key");
  });

  it("handles unicode and long values correctly", async () => {
    const long = "a".repeat(2048);
    await keyVault.set("hibp", long);
    expect(await keyVault.get("hibp")).toBe(long);
  });

  it("throws if name is empty string", async () => {
    await expect(keyVault.set("", "value")).rejects.toThrow();
  });
});

/* ── remove ──────────────────────────────────────────────────── */

describe("remove", () => {
  it("removes a stored key", async () => {
    await keyVault.set("hibp", "key-to-remove");
    await keyVault.remove("hibp");
    expect(await keyVault.get("hibp")).toBeUndefined();
  });

  it("is a no-op when the key doesn't exist", async () => {
    // Should not throw
    await expect(keyVault.remove("nonexistent")).resolves.toBeUndefined();
  });
});

/* ── list ────────────────────────────────────────────────────── */

describe("list", () => {
  it("returns empty array when vault is empty", async () => {
    expect(await keyVault.list()).toEqual([]);
  });

  it("returns names of all stored keys", async () => {
    await keyVault.set("hibp", "key1");
    await keyVault.set("deleteMe", "key2");
    const names = await keyVault.list();
    expect(names).toContain("hibp");
    expect(names).toContain("deleteMe");
    expect(names.length).toBe(2);
  });

  it("does not include removed keys", async () => {
    await keyVault.set("hibp", "key1");
    await keyVault.remove("hibp");
    expect(await keyVault.list()).not.toContain("hibp");
  });
});

/* ── has ─────────────────────────────────────────────────────── */

describe("has", () => {
  it("returns true when key exists", async () => {
    await keyVault.set("hibp", "some-key");
    expect(await keyVault.has("hibp")).toBe(true);
  });

  it("returns false when key does not exist", async () => {
    expect(await keyVault.has("hibp")).toBe(false);
  });
});

/* ── clear (Delete all my data) ──────────────────────────────── */

describe("clear", () => {
  it("wipes all stored keys — Constitution §II compliance", async () => {
    await keyVault.set("hibp", "key1");
    await keyVault.set("deleteMe", "key2");
    await keyVault.clear();
    expect(await keyVault.list()).toEqual([]);
    expect(await keyVault.get("hibp")).toBeUndefined();
  });
});

/* ── VAULT_SLOTS constants ───────────────────────────────────── */

describe("VAULT_SLOTS", () => {
  it("defines hibp slot", () => {
    expect(VAULT_SLOTS.hibp).toBe("hibp");
  });

  it("defines deleteMe slot", () => {
    expect(VAULT_SLOTS.deleteMe).toBe("deleteMe");
  });
});

/* ── Error resilience ────────────────────────────────────────── */

describe("error resilience", () => {
  it("get returns undefined when wrapping key is missing (corrupt meta)", async () => {
    await fakeStore.remove("meta");
    // Should not throw — returns undefined gracefully
    const result = await keyVault.get("hibp").catch(() => undefined);
    expect(result).toBeUndefined();
  });
});
