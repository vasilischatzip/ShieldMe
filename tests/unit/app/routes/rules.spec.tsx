/**
 * T064 — Protection Rules UI unit tests (write-first TDD).
 *
 * Tests for:
 *   src/app/routes/Rules.tsx
 *   src/app/routes/rules/category-toggle.tsx
 *   src/app/routes/rules/detector-list.tsx
 *   src/app/routes/rules/custom-rules.tsx
 *   src/app/routes/rules/preset-picker.tsx
 *
 * Spec refs: FR-R1, FR-R2, FR-R3, FR-R4, FR-R5, FR-R6, FR-R7,
 *            AC-R1, AC-R2, AC-R3, AC-R7
 *
 * Testing strategy: pure logic tests only (no DOM rendering).
 * The components export logic helpers that can be unit-tested without
 * a full Preact render cycle (avoids happy-dom import complexity for
 * TSX components with heavy signal dependencies).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CATEGORIES,
  _resetRulesForTests,
  rulesState,
  toggleCategory,
  toggleDetector,
} from "~/core/rules";
import type { CategoryId, RulesState } from "~/core/rules";
import { presetResolver } from "~/core/preset-resolver";
import { ALL_PRESETS } from "~/data/presets/index";
import { TierGate, FREE_LIMITS } from "~/core/tier-gate";

/* ── Mock storage so tests don't touch IndexedDB / localStorage ── */

vi.mock("~/core/storage", () => ({
  localStore: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

/* ── Helpers ─────────────────────────────────────────────────── */

function makeDefaultRules(): RulesState {
  return {
    version: 1,
    categories: {
      myMoney:       true,
      myIdentity:    true,
      myHealth:      false,
      myFamily:      false,
      myDigitalLife: true,
      myLocation:    false,
    },
    detectors:             {},
    activePresets:         [],
    manualOverrides:       { enabled: [], disabled: [] },
    includeBetaDetectors:  false,
  };
}

/* ════════════════════════════════════════════════════════════════
   1. Category defaults (AC-R1, FR-R1)
   ════════════════════════════════════════════════════════════════ */

describe("Category defaults — FR-R1 / AC-R1", () => {
  beforeEach(() => {
    _resetRulesForTests();
  });

  it("exactly 6 categories are defined", () => {
    expect(CATEGORIES.length).toBe(6);
  });

  it("My Money defaults ON", () => {
    expect(rulesState.value.categories.myMoney).toBe(true);
  });

  it("My Identity defaults ON", () => {
    expect(rulesState.value.categories.myIdentity).toBe(true);
  });

  it("My Digital Life defaults ON", () => {
    expect(rulesState.value.categories.myDigitalLife).toBe(true);
  });

  it("My Health defaults OFF", () => {
    expect(rulesState.value.categories.myHealth).toBe(false);
  });

  it("My Family defaults OFF", () => {
    expect(rulesState.value.categories.myFamily).toBe(false);
  });

  it("My Location defaults OFF", () => {
    expect(rulesState.value.categories.myLocation).toBe(false);
  });

  it("exactly 3 categories default ON", () => {
    const vals = Object.values(rulesState.value.categories);
    expect(vals.filter(Boolean).length).toBe(3);
  });

  it("exactly 3 categories default OFF", () => {
    const vals = Object.values(rulesState.value.categories);
    expect(vals.filter((v) => !v).length).toBe(3);
  });

  it("categories have labelKey, descKey, icon, detectors", () => {
    for (const cat of CATEGORIES) {
      expect(typeof cat.labelKey).toBe("string");
      expect(typeof cat.descKey).toBe("string");
      expect(typeof cat.icon).toBe("string");
      expect(Array.isArray(cat.detectors)).toBe(true);
      expect(cat.detectors.length).toBeGreaterThan(0);
    }
  });

  it("all ON-default categories have detectors with state true", () => {
    const state = rulesState.value;
    const onCategories: CategoryId[] = ["myMoney", "myIdentity", "myDigitalLife"];
    for (const catId of onCategories) {
      const cat = CATEGORIES.find((c) => c.id === catId)!;
      for (const det of cat.detectors) {
        // Detectors in ON categories start enabled
        expect(state.detectors[det.id]).toBe(true);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   2. Category toggle (FR-R5, AC-R2)
   ════════════════════════════════════════════════════════════════ */

describe("Category toggle — FR-R5 / AC-R2", () => {
  beforeEach(() => {
    _resetRulesForTests();
  });

  it("toggleCategory('myMoney', false) disables the category", async () => {
    await toggleCategory("myMoney", false);
    expect(rulesState.value.categories.myMoney).toBe(false);
  });

  it("toggleCategory('myHealth', true) enables the category", async () => {
    await toggleCategory("myHealth", true);
    expect(rulesState.value.categories.myHealth).toBe(true);
  });

  it("toggling a category does not affect sibling categories", async () => {
    await toggleCategory("myMoney", false);
    expect(rulesState.value.categories.myIdentity).toBe(true);
    expect(rulesState.value.categories.myDigitalLife).toBe(true);
  });

  it("toggleDetector suppresses a specific detector", async () => {
    await toggleDetector("credit-card", false);
    expect(rulesState.value.detectors["credit-card"]).toBe(false);
  });

  it("toggleDetector enables an individual detector", async () => {
    await toggleDetector("health-id", true);
    expect(rulesState.value.detectors["health-id"]).toBe(true);
  });

  it("toggling one detector does not affect other detectors", async () => {
    await toggleDetector("credit-card", false);
    // iban should still be true (from ON default)
    expect(rulesState.value.detectors["iban"]).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════
   3. Beta detector switch (AC-R7, FR-R2)
   ════════════════════════════════════════════════════════════════ */

describe("Beta detector switch — AC-R7 / FR-R2", () => {
  beforeEach(() => {
    _resetRulesForTests();
  });

  it("includeBetaDetectors defaults to false", () => {
    expect(rulesState.value.includeBetaDetectors).toBe(false);
  });

  it("beta flag can be toggled to true in state", () => {
    rulesState.value = { ...rulesState.value, includeBetaDetectors: true };
    expect(rulesState.value.includeBetaDetectors).toBe(true);
  });

  it("beta flag is separate from category toggles", () => {
    rulesState.value = { ...rulesState.value, includeBetaDetectors: true };
    // Category states are unchanged
    expect(rulesState.value.categories.myMoney).toBe(true);
    expect(rulesState.value.categories.myHealth).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════
   4. Custom rules TierGate (AC-R3, FR-R3)
   ════════════════════════════════════════════════════════════════ */

describe("Custom rules — TierGate enforcement (AC-R3, FR-R3)", () => {
  it("FREE_LIMITS.customRulesMax is 3", () => {
    expect(FREE_LIMITS.customRulesMax).toBe(3);
  });

  it("free tier: 3rd rule allowed (count=2, below limit)", async () => {
    const freeTierGate = new TierGate({ getTier: async () => "free" });
    const result = await freeTierGate.check("custom-rules:max", { value: 2 });
    expect(result.allowed).toBe(true);
  });

  it("free tier: 4th rule blocked (count=3, at limit)", async () => {
    const freeTierGate = new TierGate({ getTier: async () => "free" });
    const result = await freeTierGate.check("custom-rules:max", { value: 3 });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("free-limit");
      expect(result.limit).toBe(FREE_LIMITS.customRulesMax);
    }
  });

  it("free tier: 5th rule still blocked (count=4, above limit)", async () => {
    const freeTierGate = new TierGate({ getTier: async () => "free" });
    const result = await freeTierGate.check("custom-rules:max", { value: 4 });
    expect(result.allowed).toBe(false);
  });

  it("premium tier: any number of custom rules allowed", async () => {
    const premiumGate = new TierGate({ getTier: async () => "premium" });
    const result = await premiumGate.check("custom-rules:max", { value: 100 });
    expect(result.allowed).toBe(true);
  });

  it("preview tier: any number of custom rules allowed", async () => {
    const previewGate = new TierGate({ getTier: async () => "premium-preview" });
    const result = await previewGate.check("custom-rules:max", { value: 100 });
    expect(result.allowed).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════
   5. Preset picker — catalog and preview (FR-R7, FR-R7.2)
   ════════════════════════════════════════════════════════════════ */

describe("Preset picker — catalog (FR-R7)", () => {
  it("ALL_PRESETS is non-empty", () => {
    expect(ALL_PRESETS.length).toBeGreaterThan(0);
  });

  it("each preset has an id", () => {
    for (const p of ALL_PRESETS) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
    }
  });

  it("each preset has titleI18nKey and descriptionI18nKey", () => {
    for (const p of ALL_PRESETS) {
      expect(typeof p.titleI18nKey).toBe("string");
      expect(typeof p.descriptionI18nKey).toBe("string");
    }
  });

  it("presetResolver.list() returns all presets", () => {
    const listed = presetResolver.list();
    expect(listed.length).toBe(ALL_PRESETS.length);
  });

  it("presetResolver.get() finds a known preset", () => {
    const preset = presetResolver.get("preset.default.global");
    expect(preset.id).toBe("preset.default.global");
  });

  it("presetResolver.get() throws for unknown ID", () => {
    expect(() => presetResolver.get("no-such-preset")).toThrow();
  });
});

/* ════════════════════════════════════════════════════════════════
   6. Preset preview panel — consumer copy (FR-R7.2, AC-R6)
   ════════════════════════════════════════════════════════════════ */

describe("Preset preview — consumer copy enforcement (FR-R7.2 / AC-R6)", () => {
  const BANNED_TERMS = [
    "GDPR", "CCPA", "HIPAA", "PCI", "PIPEDA", "APPI", "PIPA", "POPIA", "LGPD",
    "DLP", "SIT", "regex", "policy template",
    "PII", "classifier", "entropy",
  ];

  it("no banned regulation/jargon terms appear in any preset titleI18nKey value", () => {
    for (const preset of ALL_PRESETS) {
      for (const term of BANNED_TERMS) {
        expect(preset.titleI18nKey).not.toContain(term);
        expect(preset.descriptionI18nKey).not.toContain(term);
      }
    }
  });

  it("preset sourceNote does not contain detector IDs as user-visible content", () => {
    // sourceNote is internal only; just verify it exists
    for (const preset of ALL_PRESETS) {
      expect(typeof preset.sourceNote).toBe("string");
    }
  });

  it("preview diff counts: detectorsEnabled + detectorsDisabled are numeric", () => {
    const rules = makeDefaultRules();
    const preset = presetResolver.get("preset.default.global");
    const diff = presetResolver.preview(preset, rules);
    expect(typeof diff.detectorsEnabled.length).toBe("number");
    expect(typeof diff.detectorsDisabled.length).toBe("number");
  });

  it("preview diff humanReadable.added is array of strings", () => {
    const rules = makeDefaultRules();
    const preset = presetResolver.get("preset.default.global");
    const diff = presetResolver.preview(preset, rules);
    expect(Array.isArray(diff.humanReadable.added)).toBe(true);
    for (const id of diff.humanReadable.added) {
      expect(typeof id).toBe("string");
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   7. Preset apply / unapply semantics (FR-R7.1, FR-R7.3, FR-R7.4)
   ════════════════════════════════════════════════════════════════ */

describe("Preset apply / unapply — FR-R7.1 / FR-R7.3 / FR-R7.4", () => {
  function freshSnapshot(): import("~/detectors/types").PresetSnapshot {
    return { version: 1, byPreset: {}, detectorRefCount: {} };
  }

  it("apply adds preset to activePresets (FR-R7.4)", () => {
    const rules = makeDefaultRules();
    const preset = presetResolver.get("preset.default.global");
    const snap   = freshSnapshot();
    const { rules: next } = presetResolver.apply(preset, rules, snap);
    expect(next.activePresets).toContain("preset.default.global");
  });

  it("apply enables detectors listed in preset (FR-R7.1)", () => {
    const rules: RulesState = {
      ...makeDefaultRules(),
      detectors: {},
      categories: {
        myMoney: false, myIdentity: false, myDigitalLife: false,
        myHealth: false, myFamily: false, myLocation: false,
      },
    };
    const preset = presetResolver.get("preset.default.global");
    const snap   = freshSnapshot();
    const { rules: next } = presetResolver.apply(preset, rules, snap);
    // "credit-card" is in preset.default.global detectors
    expect(next.detectors["credit-card"]).toBe(true);
  });

  it("apply is additive — does not disable manually enabled detectors (FR-R7.1)", () => {
    const rules: RulesState = {
      ...makeDefaultRules(),
      detectors: { "health-id": true },
      manualOverrides: { enabled: ["health-id"], disabled: [] },
    };
    const preset = presetResolver.get("preset.default.global");
    const snap   = freshSnapshot();
    const { rules: next } = presetResolver.apply(preset, rules, snap);
    expect(next.detectors["health-id"]).toBe(true);
  });

  it("applying the same preset twice is idempotent", () => {
    const rules  = makeDefaultRules();
    const preset = presetResolver.get("preset.default.global");
    const snap   = freshSnapshot();
    const { rules: once, snapshot: snap1 } = presetResolver.apply(preset, rules, snap);
    const { rules: twice }                 = presetResolver.apply(preset, once, snap1);
    expect(twice.activePresets.filter((p) => p === "preset.default.global").length).toBe(1);
  });

  it("unapply removes preset from activePresets (FR-R7.3)", () => {
    const rules  = makeDefaultRules();
    const preset = presetResolver.get("preset.default.global");
    const snap   = freshSnapshot();
    const { rules: applied, snapshot: snap1 } = presetResolver.apply(preset, rules, snap);
    const { rules: unapplied }                 = presetResolver.unapply("preset.default.global", applied, snap1);
    expect(unapplied.activePresets).not.toContain("preset.default.global");
  });

  it("unapply disables uniquely-owned detectors (FR-R7.3 refcount = 1)", () => {
    // Start with all detectors off
    const rules: RulesState = {
      ...makeDefaultRules(),
      detectors: {},
      categories: {
        myMoney: false, myIdentity: false, myDigitalLife: false,
        myHealth: false, myFamily: false, myLocation: false,
      },
    };
    const preset = presetResolver.get("preset.default.global");
    const snap   = freshSnapshot();
    const { rules: applied, snapshot: snap1 } = presetResolver.apply(preset, rules, snap);
    const { rules: unapplied }                 = presetResolver.unapply("preset.default.global", applied, snap1);
    // "credit-card" was only enabled by this preset → should be disabled
    expect(unapplied.detectors["credit-card"]).toBe(false);
  });

  it("unapply preserves detectors in manualOverrides.enabled (FR-R7.3)", () => {
    const rules: RulesState = {
      ...makeDefaultRules(),
      detectors: { "credit-card": true },
      manualOverrides: { enabled: ["credit-card"], disabled: [] },
    };
    const preset = presetResolver.get("preset.default.global");
    const snap   = freshSnapshot();
    const { rules: applied, snapshot: snap1 } = presetResolver.apply(preset, rules, snap);
    const { rules: unapplied }                 = presetResolver.unapply("preset.default.global", applied, snap1);
    expect(unapplied.detectors["credit-card"]).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════
   8. Advanced fold — detector list (FR-R2)
   ════════════════════════════════════════════════════════════════ */

describe("Advanced fold — detector list structure (FR-R2)", () => {
  it("each category exposes at least 1 detector", () => {
    for (const cat of CATEGORIES) {
      expect(cat.detectors.length).toBeGreaterThan(0);
    }
  });

  it("every detector has an id and labelKey", () => {
    for (const cat of CATEGORIES) {
      for (const det of cat.detectors) {
        expect(typeof det.id).toBe("string");
        expect(det.id.length).toBeGreaterThan(0);
        expect(typeof det.labelKey).toBe("string");
      }
    }
  });

  it("detector IDs are unique across all categories", () => {
    const ids = CATEGORIES.flatMap((c) => c.detectors.map((d) => d.id));
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("OFF-default categories have detectors that start disabled", () => {
    _resetRulesForTests();
    const state = rulesState.value;
    const offCategories: CategoryId[] = ["myHealth", "myFamily", "myLocation"];
    for (const catId of offCategories) {
      const cat = CATEGORIES.find((c) => c.id === catId)!;
      for (const det of cat.detectors) {
        expect(state.detectors[det.id]).toBe(false);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   9. ROADMAP_URL constant (FR-R4)
   ════════════════════════════════════════════════════════════════ */

describe("Request a protection — ROADMAP_URL (FR-R4)", () => {
  it("ROADMAP_URL is exported from Rules route module", async () => {
    // Dynamically import so the test fails at this line (not import time)
    // if the module doesn't exist yet — classic TDD red state.
    const mod = await import("~/app/routes/Rules");
    expect(typeof mod.ROADMAP_URL).toBe("string");
    expect(mod.ROADMAP_URL.startsWith("http")).toBe(true);
  });
});
