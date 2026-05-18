/**
 * T029ca — PresetResolver unit tests.
 *
 * Verifies the contract from specs/001-shieldme-mvp/contracts/detection-engine.md §PresetResolver:
 *   - list() returns all built-in presets.
 *   - get() retrieves by ID; throws for unknown.
 *   - apply() enables detectors, updates snapshot, produces diff.
 *   - apply() is idempotent — second apply is a no-op (empty diff).
 *   - apply() uses union semantics — never downgrades already-enabled detectors.
 *   - unapply() removes detectors unique to that preset (refCount drops to 0).
 *   - unapply() preserves detectors still referenced by another preset (refCount > 1).
 *   - unapply() preserves detectors in manualOverrides.enabled.
 *   - recordManualOverride() persists intent; subsequent unapply() respects it.
 *   - preview() returns the same diff as apply() without mutating anything, in ≤10 ms.
 */
import { describe, it, expect } from "vitest";
import { presetResolver } from "~/core/preset-resolver";
import type {
  PresetDefinition,
  PresetSnapshot,
} from "~/detectors/types";
import type { RulesState } from "~/core/rules";

/* ── Helpers ──────────────────────────────────────────────────── */

/** Minimal Rules for tests — starts with all categories OFF, no detectors forced. */
function emptyRules(): RulesState {
  return {
    version: 1,
    categories: {
      myMoney:       false,
      myIdentity:    false,
      myHealth:      false,
      myFamily:      false,
      myDigitalLife: false,
      myLocation:    false,
    },
    detectors: {},
    activePresets:    [],
    manualOverrides:  { enabled: [], disabled: [] },
    includeBetaDetectors: false,
  };
}

function emptySnapshot(): PresetSnapshot {
  return { version: 1, byPreset: {}, detectorRefCount: {} };
}

/** Build a minimal test preset inline so tests don't depend on real preset files. */
function makePreset(id: string, overrides: Partial<PresetDefinition> = {}): PresetDefinition {
  return {
    id,
    version: 1,
    titleI18nKey: `${id}.title`,
    descriptionI18nKey: `${id}.desc`,
    locale: "global",
    shipTier: "ga",
    sourceNote: "test",
    categories: {
      myMoney:    { enabled: true },
      myIdentity: { enabled: true },
    },
    detectors: {
      "credit-card": true,
      "iban":        true,
      "ssn":         true,
    },
    ...overrides,
  };
}

/* ════════════════════════════════════════════════════════════════ */

describe("PresetResolver.list and get", () => {
  it("list() returns at least 15 built-in presets", () => {
    const all = presetResolver.list();
    expect(all.length).toBeGreaterThanOrEqual(15);
  });

  it("list() contains the global default preset", () => {
    const ids = presetResolver.list().map((p) => p.id);
    expect(ids).toContain("preset.default.global");
  });

  it("list() contains all 12 residency GA presets", () => {
    const ids = new Set(presetResolver.list().map((p) => p.id));
    const residency = ["us","uk","de","fr","it","es","pt","gr","nl","au","ca","jp"];
    for (const cc of residency) {
      expect(ids.has(`preset.residency.${cc}`)).toBe(true);
    }
  });

  it("get() retrieves a preset by ID", () => {
    const preset = presetResolver.get("preset.default.global");
    expect(preset.id).toBe("preset.default.global");
    expect(preset.shipTier).toBe("ga");
  });

  it("get() throws for an unknown ID", () => {
    expect(() => presetResolver.get("preset.nonexistent.xyz")).toThrow(/unknown preset/i);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("PresetResolver.apply — basic", () => {
  it("enabling a preset enables its categories", () => {
    const p = makePreset("test.a");
    const { rules } = presetResolver.apply(p, emptyRules(), emptySnapshot());
    expect(rules.categories.myMoney).toBe(true);
    expect(rules.categories.myIdentity).toBe(true);
    // Other categories stay as they were
    expect(rules.categories.myHealth).toBe(false);
  });

  it("enabling a preset enables its detectors", () => {
    const p = makePreset("test.b");
    const { rules } = presetResolver.apply(p, emptyRules(), emptySnapshot());
    expect(rules.detectors["credit-card"]).toBe(true);
    expect(rules.detectors["iban"]).toBe(true);
    expect(rules.detectors["ssn"]).toBe(true);
  });

  it("apply() adds the preset ID to rules.activePresets", () => {
    const p = makePreset("test.c");
    const { rules } = presetResolver.apply(p, emptyRules(), emptySnapshot());
    expect(rules.activePresets).toContain("test.c");
  });

  it("apply() updates snapshot.byPreset", () => {
    const p = makePreset("test.d");
    const { snapshot } = presetResolver.apply(p, emptyRules(), emptySnapshot());
    expect(snapshot.byPreset["test.d"]).toEqual(
      expect.arrayContaining(["credit-card", "iban", "ssn"]),
    );
  });

  it("apply() updates detectorRefCount", () => {
    const p = makePreset("test.e");
    const { snapshot } = presetResolver.apply(p, emptyRules(), emptySnapshot());
    expect(snapshot.detectorRefCount["credit-card"]).toContain("test.e");
  });

  it("apply() never mutates input rules or snapshot", () => {
    const p  = makePreset("test.f");
    const r0 = emptyRules();
    const s0 = emptySnapshot();
    const r0Json = JSON.stringify(r0);
    const s0Json = JSON.stringify(s0);
    presetResolver.apply(p, r0, s0);
    expect(JSON.stringify(r0)).toBe(r0Json);
    expect(JSON.stringify(s0)).toBe(s0Json);
  });

  it("diff contains the detector IDs that were newly enabled", () => {
    const p = makePreset("test.g");
    const { diff } = presetResolver.apply(p, emptyRules(), emptySnapshot());
    expect(diff.detectorsEnabled).toEqual(
      expect.arrayContaining(["credit-card", "iban", "ssn"]),
    );
    expect(diff.detectorsDisabled).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("PresetResolver.apply — idempotency", () => {
  it("applying the same preset twice yields the same Rules", () => {
    const p  = makePreset("test.idem");
    const r0 = emptyRules();
    const s0 = emptySnapshot();
    const { rules: r1, snapshot: s1 } = presetResolver.apply(p, r0, s0);
    const { rules: r2 }               = presetResolver.apply(p, r1, s1);
    expect(r2.categories).toEqual(r1.categories);
    expect(r2.detectors).toEqual(r1.detectors);
  });

  it("applying the same preset twice — second diff is empty", () => {
    const p  = makePreset("test.idem2");
    const r0 = emptyRules();
    const s0 = emptySnapshot();
    const { rules: r1, snapshot: s1 } = presetResolver.apply(p, r0, s0);
    const { diff }                    = presetResolver.apply(p, r1, s1);
    expect(diff.detectorsEnabled).toHaveLength(0);
    expect(diff.categoriesEnabled).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("PresetResolver.apply — union semantics", () => {
  it("applying a second preset does not disable detectors from the first", () => {
    const p1 = makePreset("test.union1", {
      categories: { myMoney: { enabled: true } },
      detectors:  { "credit-card": true },
    });
    const p2 = makePreset("test.union2", {
      categories: { myIdentity: { enabled: true } },
      detectors:  { "ssn": true },
    });
    const { rules: r1, snapshot: s1 } = presetResolver.apply(p1, emptyRules(), emptySnapshot());
    const { rules: r2 }               = presetResolver.apply(p2, r1, s1);
    // Both should still be on
    expect(r2.detectors["credit-card"]).toBe(true);
    expect(r2.detectors["ssn"]).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("PresetResolver.unapply — basic", () => {
  it("unapply removes detectors unique to that preset (refCount→0)", () => {
    const p = makePreset("test.uniq", {
      detectors: { "credit-card": true },
    });
    const { rules: r1, snapshot: s1 } = presetResolver.apply(p, emptyRules(), emptySnapshot());
    const { rules: r2 }               = presetResolver.unapply("test.uniq", r1, s1);
    expect(r2.detectors["credit-card"]).toBe(false);
  });

  it("unapply removes the preset ID from rules.activePresets", () => {
    const p = makePreset("test.rm-active");
    const { rules: r1, snapshot: s1 } = presetResolver.apply(p, emptyRules(), emptySnapshot());
    const { rules: r2 }               = presetResolver.unapply("test.rm-active", r1, s1);
    expect(r2.activePresets).not.toContain("test.rm-active");
  });

  it("unapply removes the preset from snapshot", () => {
    const p = makePreset("test.rm-snap");
    const { rules: r1, snapshot: s1 } = presetResolver.apply(p, emptyRules(), emptySnapshot());
    const { snapshot: s2 }            = presetResolver.unapply("test.rm-snap", r1, s1);
    expect(s2.byPreset["test.rm-snap"]).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("PresetResolver.unapply — refcount > 1 preservation", () => {
  it("a detector shared by two presets survives when only one is unapplied", () => {
    const p1 = makePreset("test.shared1", {
      detectors: { "credit-card": true, "iban": true },
    });
    const p2 = makePreset("test.shared2", {
      detectors: { "credit-card": true, "ssn": true },
    });
    const { rules: r1, snapshot: s1 } = presetResolver.apply(p1, emptyRules(), emptySnapshot());
    const { rules: r2, snapshot: s2 } = presetResolver.apply(p2, r1, s1);
    // Unapply p1 — credit-card is still needed by p2
    const { rules: r3 } = presetResolver.unapply("test.shared1", r2, s2);
    expect(r3.detectors["credit-card"]).toBe(true);  // p2 still needs it
    expect(r3.detectors["iban"]).toBe(false);         // only p1 needed iban
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("PresetResolver — manual override preservation", () => {
  it("recordManualOverride persists in rules.manualOverrides", () => {
    const r = emptyRules();
    const r2 = presetResolver.recordManualOverride(r, "credit-card", true);
    expect(r2.manualOverrides.enabled).toContain("credit-card");
  });

  it("unapply does NOT disable a detector in manualOverrides.enabled", () => {
    const p = makePreset("test.mo", { detectors: { "credit-card": true } });
    const { rules: r1, snapshot: s1 } = presetResolver.apply(p, emptyRules(), emptySnapshot());
    // User manually enables credit-card (explicitly — shouldn't be cleared)
    const r2 = presetResolver.recordManualOverride(r1, "credit-card", true);
    const { rules: r3 } = presetResolver.unapply("test.mo", r2, s1);
    // credit-card was in manualOverrides.enabled so must stay on
    expect(r3.detectors["credit-card"]).toBe(true);
  });

  it("recordManualOverride (disable) is preserved across apply/unapply", () => {
    const p = makePreset("test.mo2", { detectors: { "credit-card": true } });
    // User disables credit-card manually before applying preset
    const rM = presetResolver.recordManualOverride(emptyRules(), "credit-card", false);
    const { rules: r1, snapshot: s1 } = presetResolver.apply(p, rM, emptySnapshot());
    // After unapply, credit-card should remain off (it was in manualOverrides.disabled)
    const { rules: r2 } = presetResolver.unapply("test.mo2", r1, s1);
    expect(r2.detectors["credit-card"]).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("PresetResolver.preview", () => {
  it("preview returns same categoriesEnabled as apply would", () => {
    const p = makePreset("test.prev");
    const r = emptyRules();
    const diff = presetResolver.preview(p, r);
    const { diff: applyDiff } = presetResolver.apply(p, r, emptySnapshot());
    expect(new Set(diff.categoriesEnabled)).toEqual(new Set(applyDiff.categoriesEnabled));
  });

  it("preview does not mutate rules", () => {
    const p = makePreset("test.prev-pure");
    const r = emptyRules();
    const before = JSON.stringify(r);
    presetResolver.preview(p, r);
    expect(JSON.stringify(r)).toBe(before);
  });

  it("preview completes in ≤10 ms (contract requirement)", () => {
    const p = presetResolver.get("preset.life.privacy-max");
    const r = emptyRules();
    const t0 = performance.now();
    presetResolver.preview(p, r);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThanOrEqual(10);
  });
});
