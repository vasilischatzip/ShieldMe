/**
 * T006 — SeverityResolver tests.
 *
 * Write-first (TDD): these tests are written BEFORE src/core/severity.ts
 * exists and MUST FAIL until T007 implements the module.
 *
 * Contract: contracts/detection-engine.md — SeverityResolver type.
 *
 * The resolver is a pure function:
 *   (confidence, instanceCount, categoryDefault, thresholds) → Severity
 *
 * Mapping rules:
 *   1. "high" confidence → "critical"  (always, regardless of categoryDefault)
 *   2. "medium" confidence → categoryDefault
 *   3. "low" confidence → "info"       (always)
 *   4. instanceCount >= thresholds.instanceCountForCritical → "critical"
 *      (overrides rules 1–3; promotion wins even over "low" confidence)
 *   5. When instanceCountForCritical is undefined, rule 4 never fires.
 */
import { describe, it, expect } from "vitest";
import {
  resolveSeverity,
  numericConfidence,
} from "~/core/severity";
import type { ConfidenceLevel, SeverityThresholds } from "~/core/severity";
import type { Severity } from "~/detectors/types";

/* ── Fixtures ─────────────────────────────────────────────────── */

const NO_PROMOTION: SeverityThresholds = {};

const PROMOTE_AT_3: SeverityThresholds = {
  instanceCountForCritical: 3,
};

const PROMOTE_AT_1: SeverityThresholds = {
  instanceCountForCritical: 1,
};

/* ════════════════════════════════════════════════════════════════
   1. Confidence → base severity mapping (no instance-count promotion)
   ════════════════════════════════════════════════════════════════ */

describe("resolveSeverity — confidence mapping", () => {
  it('high confidence always maps to "critical"', () => {
    const result = resolveSeverity("high", 1, "warning", NO_PROMOTION);
    expect(result).toBe<Severity>("critical");
  });

  it('high confidence maps to "critical" even when categoryDefault is "info"', () => {
    expect(resolveSeverity("high", 1, "info", NO_PROMOTION)).toBe("critical");
  });

  it('medium confidence defers to categoryDefault — "warning"', () => {
    expect(resolveSeverity("medium", 1, "warning", NO_PROMOTION)).toBe("warning");
  });

  it('medium confidence defers to categoryDefault — "critical"', () => {
    expect(resolveSeverity("medium", 1, "critical", NO_PROMOTION)).toBe("critical");
  });

  it('medium confidence defers to categoryDefault — "info"', () => {
    expect(resolveSeverity("medium", 1, "info", NO_PROMOTION)).toBe("info");
  });

  it('low confidence always maps to "info"', () => {
    expect(resolveSeverity("low", 1, "critical", NO_PROMOTION)).toBe("info");
  });

  it('low confidence maps to "info" even when categoryDefault is "critical"', () => {
    expect(resolveSeverity("low", 1, "critical", NO_PROMOTION)).toBe("info");
  });
});

/* ════════════════════════════════════════════════════════════════
   2. Instance-count promotion (instanceCountForCritical)
   ════════════════════════════════════════════════════════════════ */

describe("resolveSeverity — instanceCountForCritical promotion", () => {
  it("does NOT promote when instanceCount < threshold", () => {
    // 2 findings, threshold 3 → no promotion
    expect(resolveSeverity("medium", 2, "warning", PROMOTE_AT_3)).toBe("warning");
  });

  it("does NOT promote when instanceCount = threshold - 1", () => {
    expect(resolveSeverity("low", 2, "info", PROMOTE_AT_3)).toBe("info");
  });

  it('promotes to "critical" when instanceCount = threshold', () => {
    expect(resolveSeverity("medium", 3, "warning", PROMOTE_AT_3)).toBe("critical");
  });

  it('promotes to "critical" when instanceCount > threshold', () => {
    expect(resolveSeverity("low", 10, "info", PROMOTE_AT_3)).toBe("critical");
  });

  it('promotion overrides "low" confidence', () => {
    // Even low confidence gets promoted if instance count is high enough
    expect(resolveSeverity("low", 3, "info", PROMOTE_AT_3)).toBe("critical");
  });

  it('promotion overrides categoryDefault "info" when threshold met', () => {
    expect(resolveSeverity("medium", 3, "info", PROMOTE_AT_3)).toBe("critical");
  });

  it("threshold = 1 promotes immediately for any single finding", () => {
    expect(resolveSeverity("low", 1, "info", PROMOTE_AT_1)).toBe("critical");
  });

  it("threshold = undefined means promotion never fires", () => {
    // 1000 findings, still no promotion if threshold is undefined
    expect(resolveSeverity("low", 1000, "info", NO_PROMOTION)).toBe("info");
  });
});

/* ════════════════════════════════════════════════════════════════
   3. numericConfidence helper — maps ConfidenceLevel → midpoint float
   ════════════════════════════════════════════════════════════════ */

describe("numericConfidence", () => {
  it("high → value in (0.85, 1.0]", () => {
    const v = numericConfidence("high");
    expect(v).toBeGreaterThan(0.85);
    expect(v).toBeLessThanOrEqual(1.0);
  });

  it("medium → value in (0.70, 0.85]", () => {
    const v = numericConfidence("medium");
    expect(v).toBeGreaterThan(0.70);
    expect(v).toBeLessThanOrEqual(0.85);
  });

  it("low → value in [0, 0.70)", () => {
    const v = numericConfidence("low");
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(0.70);
  });

  it("is a pure function — same input always same output", () => {
    const levels: ConfidenceLevel[] = ["high", "medium", "low"];
    for (const lvl of levels) {
      expect(numericConfidence(lvl)).toBe(numericConfidence(lvl));
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   4. Edge cases
   ════════════════════════════════════════════════════════════════ */

describe("resolveSeverity — edge cases", () => {
  it("instanceCount = 0 with threshold = 1 does NOT promote", () => {
    // 0 findings means the detector ran but produced nothing — not a call site
    // for resolveSeverity in practice, but the function must be safe.
    expect(resolveSeverity("high", 0, "warning", PROMOTE_AT_1)).toBe("critical");
  });

  it("is a pure function — same inputs → same output", () => {
    const args: [ConfidenceLevel, number, Severity, SeverityThresholds] =
      ["medium", 2, "warning", PROMOTE_AT_3];
    expect(resolveSeverity(...args)).toBe(resolveSeverity(...args));
  });

  it("does not mutate its thresholds argument", () => {
    const t: SeverityThresholds = { instanceCountForCritical: 3 };
    const before = JSON.stringify(t);
    resolveSeverity("medium", 5, "warning", t);
    expect(JSON.stringify(t)).toBe(before);
  });
});
