/**
 * T051a — wipeAll() produces a correct WipeReport and revokes OAuth tokens.
 *
 * Tests:
 *  1. All stores are cleared on success
 *  2. WipeReport flags are set correctly
 *  3. oauthRevoked is true when revokeOauth succeeds
 *  4. oauthRevoked is false when revokeOauth throws (non-fatal)
 *  5. wipe continues even if a step fails (maximal cleanup)
 *  6. oauthRevoked is undefined when no revokeOauth is provided
 *  7. wipedAt is a reasonable timestamp
 *  8. warnings accumulate per failing step
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeLocalStore } from "../../fakes/fake-storage";
import { wipeAll } from "~/core/wipe";
import type { IdbStore } from "~/core/idb";
import type { KeyVault } from "~/core/key-vault";

/* ── Fakes ─────────────────────────────────────────────────────── */

function makeFakeIdb(opts: { failClearAll?: boolean } = {}): IdbStore & { cleared: boolean } {
  return {
    cleared: false,
    open: vi.fn().mockResolvedValue({}),
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clearStore: vi.fn().mockResolvedValue(undefined),
    async clearAll(this: { cleared: boolean }) {
      if (opts.failClearAll) throw new Error("idb failure");
      this.cleared = true;
    },
  } as unknown as IdbStore & { cleared: boolean };
}

function makeFakeVault(opts: { failClear?: boolean } = {}): KeyVault & { cleared: boolean } {
  const vault = {
    cleared: false,
    async get(_name: string) { return undefined; },
    async set(_name: string, _value: string) {},
    async remove(_name: string) {},
    async list() { return [] as string[]; },
    async has(_name: string) { return false; },
    async clear(this: { cleared: boolean }) {
      if (opts.failClear) throw new Error("vault failure");
      this.cleared = true;
    },
  } as unknown as KeyVault & { cleared: boolean };
  return vault;
}

/* ── Tests ─────────────────────────────────────────────────────── */

describe("wipeAll", () => {
  let store: FakeLocalStore;
  let db: ReturnType<typeof makeFakeIdb>;
  let vault: ReturnType<typeof makeFakeVault>;

  beforeEach(() => {
    store = new FakeLocalStore();
    db = makeFakeIdb();
    vault = makeFakeVault();
  });

  it("clears all three stores on success", async () => {
    await store.set("prefs", { locale: "en" });
    await store.set("rules", { version: 2 });

    const report = await wipeAll(store, db, vault);

    expect(report.vaultCleared).toBe(true);
    expect(report.idbCleared).toBe(true);
    expect(report.localStoreCleared).toBe(true);
    // Local store should be empty
    expect(await store.get("prefs")).toBeUndefined();
    expect(await store.get("rules")).toBeUndefined();
  });

  it("sets oauthRevoked=undefined when no revokeOauth provided", async () => {
    const report = await wipeAll(store, db, vault);
    expect(report.oauthRevoked).toBeUndefined();
  });

  it("sets oauthRevoked=true when revokeOauth resolves", async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    const report = await wipeAll(store, db, vault, revoke);

    expect(revoke).toHaveBeenCalledOnce();
    expect(report.oauthRevoked).toBe(true);
  });

  it("sets oauthRevoked=false when revokeOauth throws (non-fatal)", async () => {
    const revoke = vi.fn().mockRejectedValue(new Error("network error"));
    const report = await wipeAll(store, db, vault, revoke);

    expect(report.oauthRevoked).toBe(false);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain("oauthRevoke");
  });

  it("continues wiping even if vault.clear() throws", async () => {
    const failingVault = makeFakeVault({ failClear: true });
    const report = await wipeAll(store, db, failingVault);

    // vault failed but idb and localStore should still be cleared
    expect(report.vaultCleared).toBe(false);
    expect(report.idbCleared).toBe(true);
    expect(report.localStoreCleared).toBe(true);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain("vault");
  });

  it("continues wiping even if db.clearAll() throws", async () => {
    const failingDb = makeFakeIdb({ failClearAll: true });
    await store.set("prefs", { locale: "en" });

    const report = await wipeAll(store, failingDb, vault);

    expect(report.vaultCleared).toBe(true);
    expect(report.idbCleared).toBe(false);
    expect(report.localStoreCleared).toBe(true);
    expect(await store.get("prefs")).toBeUndefined();
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain("idb");
  });

  it("accumulates warnings from multiple failing steps", async () => {
    const failingVault = makeFakeVault({ failClear: true });
    const failingDb = makeFakeIdb({ failClearAll: true });
    const revoke = vi.fn().mockRejectedValue(new Error("revoke fail"));

    const report = await wipeAll(store, failingDb, failingVault, revoke);

    expect(report.vaultCleared).toBe(false);
    expect(report.idbCleared).toBe(false);
    expect(report.localStoreCleared).toBe(true); // store itself still works
    expect(report.oauthRevoked).toBe(false);
    expect(report.warnings).toHaveLength(3);
  });

  it("wipedAt is a recent timestamp (within last 5 seconds)", async () => {
    const before = Date.now();
    const report = await wipeAll(store, db, vault);
    const after = Date.now();

    expect(report.wipedAt).toBeGreaterThanOrEqual(before);
    expect(report.wipedAt).toBeLessThanOrEqual(after);
  });

  it("returns empty warnings array on full success", async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    const report = await wipeAll(store, db, vault, revoke);

    expect(report.warnings).toHaveLength(0);
  });
});
