/**
 * T047a — Provider factory unit tests.
 *
 * Invariants:
 *   • Free tier → always ManualProvider.
 *   • Premium tier, pref=manual → ManualProvider.
 *   • Premium tier, pref=deleteme → DeleteMeProvider (stub).
 *   • DeleteMe stub throws NotYetAvailableError for all operations.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createProvider }        from "~/radar/providers/factory";
import { DeleteMeProvider, NotYetAvailableError } from "~/radar/providers/deleteme-provider";
import { FakeLocalStore }        from "../../fakes/fake-storage";
import { TierGate, type Tier }   from "~/core/tier-gate";

/* ── Fake BillingProvider ────────────────────────────────────────── */

function makeTierGate(tier: Tier): TierGate {
  return new TierGate({ async getTier() { return tier; } });
}

/* ── Setup ──────────────────────────────────────────────────────── */

let store: FakeLocalStore;

beforeEach(() => { store = new FakeLocalStore(); });

/* ── Free tier ──────────────────────────────────────────────────── */

describe("createProvider — free tier", () => {
  it("returns ManualProvider for free tier with default pref", async () => {
    const provider = await createProvider(store, makeTierGate("free"));
    expect(provider.kind).toBe("manual");
  });

  it("returns ManualProvider even if pref=deleteme (free can't access it)", async () => {
    const provider = await createProvider(store, makeTierGate("free"), "deleteme");
    expect(provider.kind).toBe("manual");
  });
});

/* ── Premium-preview tier ────────────────────────────────────────── */

describe("createProvider — premium-preview tier", () => {
  it("returns ManualProvider when pref=manual", async () => {
    const provider = await createProvider(store, makeTierGate("premium-preview"), "manual");
    expect(provider.kind).toBe("manual");
  });

  it("returns ManualProvider as default (no pref specified)", async () => {
    const provider = await createProvider(store, makeTierGate("premium-preview"));
    expect(provider.kind).toBe("manual");
  });

  it("returns DeleteMeProvider when pref=deleteme and premium-preview", async () => {
    const provider = await createProvider(store, makeTierGate("premium-preview"), "deleteme");
    expect(provider.kind).toBe("deleteme");
  });

  it("DeleteMeProvider is an instance of DeleteMeProvider class", async () => {
    const provider = await createProvider(store, makeTierGate("premium-preview"), "deleteme");
    expect(provider).toBeInstanceOf(DeleteMeProvider);
  });
});

/* ── Premium tier ────────────────────────────────────────────────── */

describe("createProvider — premium tier", () => {
  it("returns DeleteMeProvider when pref=deleteme and premium", async () => {
    const provider = await createProvider(store, makeTierGate("premium"), "deleteme");
    expect(provider.kind).toBe("deleteme");
  });

  it("returns ManualProvider for premium + manual pref", async () => {
    const provider = await createProvider(store, makeTierGate("premium"), "manual");
    expect(provider.kind).toBe("manual");
  });
});

/* ── DeleteMe stub behaviour ─────────────────────────────────────── */

describe("DeleteMeProvider — stub throws NotYetAvailableError", () => {
  it("listSites throws NotYetAvailableError", async () => {
    const stub = new DeleteMeProvider();
    await expect(stub.listSites()).rejects.toThrow(NotYetAvailableError);
  });

  it("status throws NotYetAvailableError", async () => {
    const stub = new DeleteMeProvider();
    await expect(stub.status("spokeo")).rejects.toThrow(NotYetAvailableError);
  });

  it("requestRemoval throws NotYetAvailableError", async () => {
    const stub = new DeleteMeProvider();
    await expect(stub.requestRemoval("spokeo")).rejects.toThrow(NotYetAvailableError);
  });

  it("sync throws NotYetAvailableError", async () => {
    const stub = new DeleteMeProvider();
    await expect(stub.sync!()).rejects.toThrow(NotYetAvailableError);
  });

  it("NotYetAvailableError message mentions 'DeleteMe'", async () => {
    const stub = new DeleteMeProvider();
    try {
      await stub.listSites();
    } catch (e) {
      expect(e).toBeInstanceOf(NotYetAvailableError);
      expect((e as Error).message).toMatch(/DeleteMe/i);
    }
  });

  it("DeleteMeProvider kind is 'deleteme'", () => {
    const stub = new DeleteMeProvider();
    expect(stub.kind).toBe("deleteme");
  });
});
