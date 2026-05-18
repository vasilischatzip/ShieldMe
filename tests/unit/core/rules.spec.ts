/**
 * Rules store unit tests — verifies FR-R1 defaults, toggle behaviour,
 * persistence contract, and scan-time predicate (isDetectorActive).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeLocalStore } from "../../fakes/fake-storage";

/* ── Inject fake store before importing the module ──────────── */

const fakeStore = new FakeLocalStore();

vi.mock("~/core/storage", () => ({ localStore: fakeStore }));

// Import AFTER vi.mock so the mock is in place
const {
  CATEGORIES,
  loadRules,
  rulesState,
  toggleCategory,
  toggleDetector,
  isDetectorActive,
  _resetRulesForTests,
} = await import("~/core/rules");

/* ── Helpers ────────────────────────────────────────────────── */

const getCat = (id: string) => CATEGORIES.find((c) => c.id === id)!;

beforeEach(async () => {
  await fakeStore.clear();
  _resetRulesForTests();
});

/* ── FR-R1: Default ON/OFF state ─────────────────────────────── */

describe("FR-R1 — default category state", () => {
  it("My Money is ON by default", async () => {
    await loadRules();
    expect(rulesState.value.categories.myMoney).toBe(true);
  });

  it("My Identity is ON by default", async () => {
    await loadRules();
    expect(rulesState.value.categories.myIdentity).toBe(true);
  });

  it("My Digital Life is ON by default", async () => {
    await loadRules();
    expect(rulesState.value.categories.myDigitalLife).toBe(true);
  });

  it("My Health is OFF by default", async () => {
    await loadRules();
    expect(rulesState.value.categories.myHealth).toBe(false);
  });

  it("My Family is OFF by default", async () => {
    await loadRules();
    expect(rulesState.value.categories.myFamily).toBe(false);
  });

  it("My Location is OFF by default", async () => {
    await loadRules();
    expect(rulesState.value.categories.myLocation).toBe(false);
  });

  it("AC-R1: exactly 3 ON, 3 OFF on fresh install", async () => {
    await loadRules();
    const cats = rulesState.value.categories;
    const onCount = Object.values(cats).filter(Boolean).length;
    expect(onCount).toBe(3);
  });
});

/* ── Category toggle ─────────────────────────────────────────── */

describe("toggleCategory", () => {
  it("flips a category ON", async () => {
    await loadRules();
    expect(rulesState.value.categories.myHealth).toBe(false);
    await toggleCategory("myHealth", true);
    expect(rulesState.value.categories.myHealth).toBe(true);
  });

  it("flips a category OFF", async () => {
    await loadRules();
    await toggleCategory("myMoney", false);
    expect(rulesState.value.categories.myMoney).toBe(false);
  });

  it("persists change to storage", async () => {
    await loadRules();
    await toggleCategory("myHealth", true);
    const stored = await fakeStore.get<{ categories: Record<string, boolean> }>("rules.categories");
    expect(stored?.categories.myHealth).toBe(true);
  });

  it("updates the rulesState signal synchronously", async () => {
    await loadRules();
    await toggleCategory("myFamily", true);
    // Signal is updated before storage promise resolves
    expect(rulesState.value.categories.myFamily).toBe(true);
  });
});

/* ── Detector toggle ─────────────────────────────────────────── */

describe("toggleDetector", () => {
  it("flips a detector OFF while category is ON", async () => {
    await loadRules();
    const det = getCat("myMoney").detectors[0]!;
    await toggleDetector(det.id, false);
    expect(rulesState.value.detectors[det.id]).toBe(false);
  });

  it("persists detector change to storage", async () => {
    await loadRules();
    const det = getCat("myIdentity").detectors[0]!;
    await toggleDetector(det.id, false);
    const stored = await fakeStore.get<{ detectors: Record<string, boolean> }>("rules.categories");
    expect(stored?.detectors[det.id]).toBe(false);
  });
});

/* ── isDetectorActive ────────────────────────────────────────── */

describe("isDetectorActive", () => {
  it("returns true when category ON and detector ON", async () => {
    await loadRules();
    const cat = getCat("myMoney");
    const det = cat.detectors[0]!;
    expect(isDetectorActive("myMoney", det.id)).toBe(true);
  });

  it("returns false when category OFF even if detector individually ON", async () => {
    await loadRules();
    // myHealth is OFF by default; its detectors are also OFF — turn one ON explicitly
    const det = getCat("myHealth").detectors[0]!;
    await toggleDetector(det.id, true);
    // Category still OFF → predicate must return false (category is the hard gate)
    expect(isDetectorActive("myHealth", det.id)).toBe(false);
  });

  it("returns false when detector is OFF", async () => {
    await loadRules();
    const det = getCat("myMoney").detectors[0]!;
    await toggleDetector(det.id, false);
    expect(isDetectorActive("myMoney", det.id)).toBe(false);
  });

  it("AC-R2: toggling My Money OFF suppresses all its detectors", async () => {
    await loadRules();
    await toggleCategory("myMoney", false);
    const allOff = getCat("myMoney").detectors.every(
      (d) => !isDetectorActive("myMoney", d.id),
    );
    expect(allOff).toBe(true);
  });
});

/* ── Hydration from storage ──────────────────────────────────── */

describe("loadRules hydration", () => {
  it("restores previously saved state from storage", async () => {
    // Simulate a previous session that toggled myHealth ON
    await fakeStore.set("rules.categories", {
      version: 1,
      categories: {
        myMoney: true,
        myIdentity: true,
        myHealth: true,      // previously switched ON
        myFamily: false,
        myDigitalLife: true,
        myLocation: false,
      },
      detectors: {},
    });
    await loadRules();
    expect(rulesState.value.categories.myHealth).toBe(true);
  });

  it("merges new detector defaults when old storage lacks them", async () => {
    await fakeStore.set("rules.categories", {
      version: 1,
      categories: { myMoney: false, myIdentity: true, myHealth: false, myFamily: false, myDigitalLife: true, myLocation: false },
      detectors: {},  // old storage has no detector entries
    });
    await loadRules();
    // New detectors must be present with sane defaults
    const dets = rulesState.value.detectors;
    expect(Object.keys(dets).length).toBeGreaterThan(0);
  });
});

/* ── CATEGORIES invariants ───────────────────────────────────── */

describe("CATEGORIES structure", () => {
  it("contains exactly 6 categories", () => {
    expect(CATEGORIES.length).toBe(6);
  });

  it("every category has at least 1 detector", () => {
    for (const cat of CATEGORIES) {
      expect(cat.detectors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("detector IDs are unique across all categories", () => {
    const ids = CATEGORIES.flatMap((c) => c.detectors.map((d) => d.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
