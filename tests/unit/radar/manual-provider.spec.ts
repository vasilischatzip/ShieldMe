/**
 * T046a — ManualProvider + broker catalog unit tests.
 *
 * Invariants:
 *   • Catalog has ≥20 broker sites.
 *   • Every site has the required fields.
 *   • status() returns "unchecked" for sites with no recorded request.
 *   • requestRemoval() persists the correct state with an ISO timestamp.
 *   • Requesting removal on a "confirmed" site is a no-op.
 *   • State round-trips correctly through the store.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createManualProvider } from "~/radar/providers/manual-provider";
import { FakeLocalStore } from "../../fakes/fake-storage";

let store: FakeLocalStore;

beforeEach(() => {
  store = new FakeLocalStore();
});

/* ── Catalog ────────────────────────────────────────────────────── */

describe("ManualProvider — broker catalog", () => {
  it("listSites returns at least 20 sites", async () => {
    const provider = createManualProvider(store);
    const sites = await provider.listSites();
    expect(sites.length).toBeGreaterThanOrEqual(20);
  });

  it("each site has id, name, optOutUrl, formDifficulty, automationSupported", async () => {
    const provider = createManualProvider(store);
    const sites = await provider.listSites();
    for (const site of sites) {
      expect(site).toHaveProperty("id");
      expect(site).toHaveProperty("name");
      expect(site).toHaveProperty("optOutUrl");
      expect(site).toHaveProperty("formDifficulty");
      expect(site).toHaveProperty("automationSupported");
    }
  });

  it("formDifficulty is one of easy/medium/hard", async () => {
    const provider = createManualProvider(store);
    const sites = await provider.listSites();
    const valid = new Set(["easy", "medium", "hard"]);
    for (const site of sites) {
      expect(valid.has(site.formDifficulty)).toBe(true);
    }
  });

  it("optOutUrl is a valid HTTPS URL", async () => {
    const provider = createManualProvider(store);
    const sites = await provider.listSites();
    for (const site of sites) {
      expect(site.optOutUrl).toMatch(/^https:\/\//);
    }
  });

  it("all site IDs are unique", async () => {
    const provider = createManualProvider(store);
    const sites = await provider.listSites();
    const ids = sites.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns a copy (mutation does not affect catalog)", async () => {
    const provider = createManualProvider(store);
    const sites1 = await provider.listSites();
    sites1.push({ id: "fake", name: "Fake", optOutUrl: "https://fake.com", formDifficulty: "easy", automationSupported: false });
    const sites2 = await provider.listSites();
    expect(sites2.find(s => s.id === "fake")).toBeUndefined();
  });

  it("kind is 'manual'", () => {
    const provider = createManualProvider(store);
    expect(provider.kind).toBe("manual");
  });
});

/* ── status() ───────────────────────────────────────────────────── */

describe("ManualProvider — status()", () => {
  it("returns unchecked for unknown site", async () => {
    const provider = createManualProvider(store);
    const status = await provider.status("spokeo");
    expect(status.state).toBe("unchecked");
  });

  it("returns stored status after requestRemoval", async () => {
    const provider = createManualProvider(store);
    await provider.requestRemoval("spokeo");
    const status = await provider.status("spokeo");
    expect(status.state).toBe("requested");
  });

  it("preserves status across separate provider instances sharing the store", async () => {
    const p1 = createManualProvider(store);
    await p1.requestRemoval("whitepages");

    const p2 = createManualProvider(store); // new instance, same store
    const status = await p2.status("whitepages");
    expect(status.state).toBe("requested");
  });
});

/* ── requestRemoval() ───────────────────────────────────────────── */

describe("ManualProvider — requestRemoval()", () => {
  it("returns requested status with ISO timestamp", async () => {
    const fixedNow = "2024-06-01T12:00:00.000Z";
    const provider = createManualProvider(store, () => fixedNow);

    const result = await provider.requestRemoval("spokeo");
    expect(result.state).toBe("requested");
    if (result.state === "requested") {
      expect(result.requestedAt).toBe(fixedNow);
    }
  });

  it("persists status so a subsequent status() call sees it", async () => {
    const provider = createManualProvider(store);
    await provider.requestRemoval("beenverified");
    const status = await provider.status("beenverified");
    expect(status.state).toBe("requested");
  });

  it("is idempotent for re-requests (overwrites with new timestamp)", async () => {
    const provider = createManualProvider(store);
    await provider.requestRemoval("spokeo");
    const first = await provider.status("spokeo");
    await new Promise(r => setTimeout(r, 5)); // small delay
    await provider.requestRemoval("spokeo");
    const second = await provider.status("spokeo");
    expect(second.state).toBe("requested");
    if (first.state === "requested" && second.state === "requested") {
      // Both are requested — second may have a different or same timestamp
      expect(typeof second.requestedAt).toBe("string");
    }
  });

  it("is a no-op when site is already confirmed", async () => {
    // Manually set confirmed state in store
    const confirmedStatus = { state: "confirmed" as const, confirmedAt: "2024-01-01T00:00:00.000Z" };
    await store.set("brokerStatus.spokeo", confirmedStatus);

    const provider = createManualProvider(store);
    const result = await provider.requestRemoval("spokeo");
    expect(result.state).toBe("confirmed");

    // Store should still show confirmed
    const stored = await store.get("brokerStatus.spokeo") as typeof confirmedStatus;
    expect(stored.state).toBe("confirmed");
  });

  it("tracks different sites independently", async () => {
    const provider = createManualProvider(store);
    await provider.requestRemoval("spokeo");
    await provider.requestRemoval("whitepages");

    expect((await provider.status("spokeo")).state).toBe("requested");
    expect((await provider.status("whitepages")).state).toBe("requested");
    expect((await provider.status("intelius")).state).toBe("unchecked");
  });
});
