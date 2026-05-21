/**
 * T095 — TierStatus v1 → v2 migration tests.
 *
 * Migration:
 *   "premium"     → "pro"
 *   "pro-family"  → "pro"
 *   (all others unchanged)
 *   version: 1 → 2
 *   accountsMax field added with defaults per tier
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FakeLocalStore } from "../../../fakes/fake-storage";
import { runMigrations } from "~/core/migrations";

/* ── Helpers ─────────────────────────────────────────────────────── */

async function runWithTier(
  store: FakeLocalStore,
  tierV1: { version: number; tier: string },
) {
  await store.set("tier", tierV1);
  await runMigrations(store);
  return store.get<{ version: number; tier: string; accountsMax?: number }>("tier");
}

/* ── Suite ───────────────────────────────────────────────────────── */

describe("TierStatus v1 → v2 migration (T095)", () => {
  let store: FakeLocalStore;

  beforeEach(() => {
    store = new FakeLocalStore();
  });

  it("maps stored 'premium' to 'pro'", async () => {
    const result = await runWithTier(store, { version: 1, tier: "premium" });
    expect(result?.tier).toBe("pro");
    expect(result?.version).toBe(2);
  });

  it("maps stored 'pro-family' to 'pro'", async () => {
    const result = await runWithTier(store, { version: 1, tier: "pro-family" });
    expect(result?.tier).toBe("pro");
    expect(result?.version).toBe(2);
  });

  it("leaves 'free' unchanged", async () => {
    const result = await runWithTier(store, { version: 1, tier: "free" });
    expect(result?.tier).toBe("free");
    expect(result?.version).toBe(2);
  });

  it("leaves 'premium-preview' unchanged (still in preview)", async () => {
    const result = await runWithTier(store, { version: 1, tier: "premium-preview" });
    expect(result?.tier).toBe("premium-preview");
    expect(result?.version).toBe(2);
  });

  it("does not re-migrate a v2 record", async () => {
    const v2 = { version: 2, tier: "pro", accountsMax: 999 };
    await store.set("tier", v2);
    await runMigrations(store);
    const result = await store.get<typeof v2>("tier");
    expect(result?.accountsMax).toBe(999); // sentinel unchanged
  });

  it("adds accountsMax field for 'free' tier (limited accounts)", async () => {
    const result = await runWithTier(store, { version: 1, tier: "free" });
    expect(typeof result?.accountsMax).toBe("number");
    expect(result!.accountsMax).toBeGreaterThanOrEqual(1);
  });

  it("adds accountsMax field for 'pro' tier (after migration from premium)", async () => {
    const result = await runWithTier(store, { version: 1, tier: "premium" });
    // Pro tier should have a higher (or unlimited = 0 sentinel) accounts limit
    expect(typeof result?.accountsMax).toBe("number");
  });

  it("migration runs are included in the result.migrationsRun array", async () => {
    await store.set("tier", { version: 1, tier: "premium" });
    const result = await runMigrations(store);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.migrationsRun.some((m) => m.includes("tier"))).toBe(true);
    }
  });
});
