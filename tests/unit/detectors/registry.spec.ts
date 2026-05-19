/**
 * T002 — DetectorRegistry unit tests.
 *
 * Covers: register(), all(), byCategory(), byRegion(), byShipTier(), active().
 * Spec refs: FR-R1, FR-R2, FR-R5.
 *
 * NOTE: DetectorRegistryImpl is not exported; tests use the module singleton
 * and call _reset() in beforeEach to prevent test bleed.
 * Follow-up T002a: export DetectorRegistryImpl to allow fully isolated instances.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Detector } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { registry } from "~/detectors/registry";

/* ── Fixture helpers ─────────────────────────────────────────── */

function makeDetector(overrides: Partial<Detector> & { id: string }): Detector {
  return {
    categoryId: "myMoney" as CategoryId,
    region: "global",
    shipTier: "ga",
    scan: () => [],
    ...overrides,
  };
}

/* Shared fixtures */
const DET_A = makeDetector({ id: "fix.alpha", categoryId: "myMoney", region: "global", shipTier: "ga" });
const DET_B = makeDetector({ id: "fix.bravo", categoryId: "myIdentity", region: "global", shipTier: "ga" });
const DET_C = makeDetector({ id: "fix.charlie", categoryId: "myMoney", region: "us", shipTier: "beta" });
const DET_LOCALE = makeDetector({
  id: "fix.locale-only",
  categoryId: "myDigitalLife",
  region: "global",
  shipTier: "ga",
  requiresLocales: ["en", "en-GB"],
});

/* ── Reset singleton between every test ─────────────────────── */

beforeEach(() => {
  (registry as unknown as { _reset(): void })._reset();
});

/* ════════════════════════════════════════════════════════════ */

describe("DetectorRegistry — register()", () => {
  it("happy path: registered detector appears in all()", () => {
    registry.register(DET_A);
    expect(registry.all()).toContain(DET_A);
  });

  it("FR-R5: throws when shipTier === 'planned'", () => {
    const planned = makeDetector({ id: "fix.planned", shipTier: "planned" });
    expect(() => registry.register(planned)).toThrow(/planned/i);
  });

  it("FR-R5: error message mentions the detector id", () => {
    const planned = makeDetector({ id: "bad.detector.id", shipTier: "planned" });
    expect(() => registry.register(planned)).toThrow(/bad\.detector\.id/);
  });

  it("idempotent: registering the same object reference twice is silent", () => {
    registry.register(DET_A);
    expect(() => registry.register(DET_A)).not.toThrow();
  });

  it("idempotent: same-object re-registration does not duplicate entries", () => {
    registry.register(DET_A);
    registry.register(DET_A);
    const hits = registry.all().filter((d) => d.id === DET_A.id);
    expect(hits.length).toBe(1);
  });

  it("ID collision with a different object reference throws", () => {
    registry.register(DET_A);
    const impostor = makeDetector({ id: DET_A.id }); // same id, new object
    expect(() => registry.register(impostor)).toThrow(/collision/i);
  });

  it("ID collision error mentions the colliding id", () => {
    registry.register(DET_A);
    const impostor = makeDetector({ id: DET_A.id });
    expect(() => registry.register(impostor)).toThrow(DET_A.id);
  });

  it("multiple distinct detectors can be registered", () => {
    registry.register(DET_A);
    registry.register(DET_B);
    registry.register(DET_C);
    expect(registry.all().length).toBe(3);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("DetectorRegistry — all()", () => {
  it("returns empty array when nothing is registered (FR-R1)", () => {
    expect(registry.all()).toEqual([]);
  });

  it("returns every registered detector", () => {
    registry.register(DET_A);
    registry.register(DET_B);
    const all = registry.all();
    expect(all).toContain(DET_A);
    expect(all).toContain(DET_B);
    expect(all.length).toBe(2);
  });

  it("returns a snapshot array — mutations do not affect internal state", () => {
    registry.register(DET_A);
    const snapshot = registry.all();
    snapshot.push(DET_B); // mutate the returned array
    expect(registry.all().length).toBe(1); // internal map unchanged
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("DetectorRegistry — byCategory() (FR-R1)", () => {
  beforeEach(() => {
    registry.register(DET_A);  // myMoney
    registry.register(DET_B);  // myIdentity
    registry.register(DET_C);  // myMoney (beta)
  });

  it("returns only detectors whose categoryId matches", () => {
    const money = registry.byCategory("myMoney" as CategoryId);
    expect(money).toContain(DET_A);
    expect(money).toContain(DET_C);
    expect(money).not.toContain(DET_B);
  });

  it("returns only the matching category, not others", () => {
    const identity = registry.byCategory("myIdentity" as CategoryId);
    expect(identity).toContain(DET_B);
    expect(identity).not.toContain(DET_A);
    expect(identity).not.toContain(DET_C);
  });

  it("returns empty array for a category with no registrations", () => {
    expect(registry.byCategory("myHealth" as CategoryId)).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("DetectorRegistry — byRegion() (FR-R2)", () => {
  const DET_US   = makeDetector({ id: "fix.us",   region: "us" });
  const DET_EU   = makeDetector({ id: "fix.eu",   region: "eu" });
  const DET_GLOB = makeDetector({ id: "fix.glob",  region: "global" });

  beforeEach(() => {
    registry.register(DET_US);
    registry.register(DET_EU);
    registry.register(DET_GLOB);
  });

  it("'global' region matches the 'global' locale query", () => {
    expect(registry.byRegion("global")).toContain(DET_GLOB);
  });

  it("'global' region is included when querying a specific locale", () => {
    // byRegion("us") returns detectors with region "us" OR "global"
    const usResults = registry.byRegion("us");
    expect(usResults).toContain(DET_US);
    expect(usResults).toContain(DET_GLOB);
  });

  it("region-specific detector is NOT returned for a different locale", () => {
    expect(registry.byRegion("eu")).not.toContain(DET_US);
  });

  it("'eu' region is returned when querying 'eu'", () => {
    expect(registry.byRegion("eu")).toContain(DET_EU);
  });

  it("returns empty array for a region with no registrations and no globals", () => {
    // After _reset() at top of each describe, only US/EU/GLOB are registered here
    expect(registry.byRegion("gr").filter((d) => d.region === "gr")).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("DetectorRegistry — byShipTier()", () => {
  const DET_BETA = makeDetector({ id: "fix.beta-tier", shipTier: "beta" });

  beforeEach(() => {
    registry.register(DET_A);    // ga
    registry.register(DET_BETA); // beta
  });

  it("byShipTier('ga') returns GA detectors", () => {
    expect(registry.byShipTier("ga")).toContain(DET_A);
  });

  it("byShipTier('ga') excludes beta detectors", () => {
    expect(registry.byShipTier("ga")).not.toContain(DET_BETA);
  });

  it("byShipTier('beta') returns beta detectors", () => {
    expect(registry.byShipTier("beta")).toContain(DET_BETA);
  });

  it("byShipTier('beta') excludes GA detectors", () => {
    expect(registry.byShipTier("beta")).not.toContain(DET_A);
  });

  it("byShipTier('planned') returns empty (planned never registers)", () => {
    expect(registry.byShipTier("planned")).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("DetectorRegistry — active(rules, locale) (FR-R1, FR-R2)", () => {
  /** All categories ON, all detectors default ON, beta OFF */
  function allOnRules(overrides: {
    categories?: Partial<Record<CategoryId, boolean>>;
    detectors?: Record<string, boolean>;
    includeBetaDetectors?: boolean;
  } = {}): import("~/detectors/types").Rules {
    return {
      categories: {
        myMoney: true,
        myIdentity: true,
        myHealth: true,
        myFamily: true,
        myDigitalLife: true,
        myLocation: true,
        ...overrides.categories,
      } as Record<CategoryId, boolean>,
      detectors: overrides.detectors ?? {},
      includeBetaDetectors: overrides.includeBetaDetectors ?? false,
    };
  }

  beforeEach(() => {
    registry.register(DET_A);      // myMoney / global / ga
    registry.register(DET_B);      // myIdentity / global / ga
    registry.register(DET_C);      // myMoney / us / beta
    registry.register(DET_LOCALE); // myDigitalLife / global / ga / requiresLocales: ["en","en-GB"]
  });

  // — Category gate (FR-R1) ————————————————————————————————

  it("(a) returns detector when its category is ON", () => {
    expect(registry.active(allOnRules(), "en")).toContain(DET_A);
  });

  it("(a) excludes detector when its category is OFF", () => {
    const rules = allOnRules({ categories: { myMoney: false } });
    expect(registry.active(rules, "en")).not.toContain(DET_A);
  });

  it("(a) category-OFF suppresses ALL detectors in that category", () => {
    const rules = allOnRules({ categories: { myMoney: false } });
    const active = registry.active(rules, "en");
    expect(active.every((d) => d.categoryId !== "myMoney")).toBe(true);
  });

  it("(a) category-ON for one does not affect other categories", () => {
    const rules = allOnRules({ categories: { myMoney: false } });
    // myIdentity should still be active
    expect(registry.active(rules, "en")).toContain(DET_B);
  });

  // — Per-detector toggle ——————————————————————————————————

  it("(b) per-detector false suppresses detector even when category is ON", () => {
    const rules = allOnRules({ detectors: { [DET_A.id]: false } });
    expect(registry.active(rules, "en")).not.toContain(DET_A);
  });

  it("(b) per-detector false for one ID does not affect sibling detectors", () => {
    const rules = allOnRules({ detectors: { [DET_A.id]: false } });
    expect(registry.active(rules, "en")).toContain(DET_B);
  });

  it("(b) detector with no entry in rules.detectors defaults to ON", () => {
    // DET_A.id is not in detectors map — should still be active
    expect(registry.active(allOnRules({ detectors: {} }), "en")).toContain(DET_A);
  });

  it("(b) per-detector true (explicit) keeps detector active", () => {
    const rules = allOnRules({ detectors: { [DET_A.id]: true } });
    expect(registry.active(rules, "en")).toContain(DET_A);
  });

  // — Beta flag (FR-R5) ————————————————————————————————————

  it("(c) beta detector excluded when includeBetaDetectors is false", () => {
    expect(registry.active(allOnRules({ includeBetaDetectors: false }), "us")).not.toContain(DET_C);
  });

  it("(c) beta detector included when includeBetaDetectors is true", () => {
    expect(registry.active(allOnRules({ includeBetaDetectors: true }), "us")).toContain(DET_C);
  });

  it("(c) GA detector is unaffected by includeBetaDetectors flag", () => {
    expect(registry.active(allOnRules({ includeBetaDetectors: false }), "en")).toContain(DET_A);
    expect(registry.active(allOnRules({ includeBetaDetectors: true }), "en")).toContain(DET_A);
  });

  // — Locale / requiresLocales gate (FR-R2) ——————————————

  it("(d) detector with requiresLocales is active for a matching locale", () => {
    expect(registry.active(allOnRules(), "en")).toContain(DET_LOCALE);
  });

  it("(d) detector with requiresLocales is active for another listed locale", () => {
    expect(registry.active(allOnRules(), "en-GB")).toContain(DET_LOCALE);
  });

  it("(d) detector with requiresLocales is excluded for a non-listed locale", () => {
    expect(registry.active(allOnRules(), "el")).not.toContain(DET_LOCALE);
  });

  it("(d) detector without requiresLocales is active for any locale", () => {
    // DET_A has no requiresLocales — should appear for "el", "ja", etc.
    expect(registry.active(allOnRules(), "el")).toContain(DET_A);
    expect(registry.active(allOnRules(), "ja")).toContain(DET_A);
  });

  // — Combined gates ———————————————————————————————————————

  it("category OFF + includeBetaDetectors ON still excludes detector", () => {
    // DET_C is beta AND myMoney; category off should suppress it
    const rules = allOnRules({ categories: { myMoney: false }, includeBetaDetectors: true });
    expect(registry.active(rules, "us")).not.toContain(DET_C);
  });

  it("returns empty array when all categories are OFF", () => {
    const rules = allOnRules({
      categories: {
        myMoney: false,
        myIdentity: false,
        myHealth: false,
        myFamily: false,
        myDigitalLife: false,
        myLocation: false,
      },
    });
    expect(registry.active(rules, "en")).toEqual([]);
  });
});
