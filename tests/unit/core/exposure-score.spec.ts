/**
 * T027a — Exposure Score table tests.
 */
import { describe, it, expect } from "vitest";
import {
  computeExposureScore,
  exposureBreakdown,
  scoreTier,
} from "~/core/exposure-score";
import type { Finding } from "~/detectors/types";

function f(
  severity: Finding["severity"],
  confidence: number,
  category = "myMoney",
): Finding {
  return {
    detectorId:     "x",
    categoryId:     category as Finding["categoryId"],
    severity,
    confidence,
    match:          { value: "", start: 0, end: 0 },
    contextSnippet: "",
  };
}

describe("computeExposureScore", () => {
  it("empty findings → 100 (pristine)", () => {
    expect(computeExposureScore([])).toBe(100);
  });

  it("single critical full-confidence → 90", () => {
    expect(computeExposureScore([f("critical", 1.0)])).toBe(90);
  });

  it("two critical full-confidence → 80", () => {
    expect(computeExposureScore([f("critical", 1.0), f("critical", 1.0)])).toBe(80);
  });

  it("warning at half confidence → 97-98 (small deduction)", () => {
    const score = computeExposureScore([f("warning", 0.5)]);
    expect(score).toBeGreaterThanOrEqual(97);
    expect(score).toBeLessThanOrEqual(98);
  });

  it("saturates — never goes below 0", () => {
    const findings = Array.from({ length: 50 }, () => f("critical", 1.0));
    expect(computeExposureScore(findings)).toBeGreaterThanOrEqual(0);
    expect(computeExposureScore(findings)).toBeLessThanOrEqual(100);
  });

  it("diversity penalty kicks in at 3 categories", () => {
    const noDiversity = [
      f("critical", 1.0, "myMoney"),
      f("critical", 1.0, "myMoney"),
    ];
    const diverse = [
      f("critical", 1.0, "myMoney"),
      f("critical", 1.0, "myIdentity"),
      f("critical", 1.0, "myDigitalLife"),
    ];
    expect(computeExposureScore(diverse)).toBeLessThan(computeExposureScore(noDiversity));
  });

  it("is deterministic", () => {
    const findings = [f("critical", 1.0), f("warning", 0.7)];
    expect(computeExposureScore(findings)).toBe(computeExposureScore(findings));
  });
});

describe("exposureBreakdown", () => {
  it("counts severities and categories", () => {
    const b = exposureBreakdown([
      f("critical", 1.0, "myMoney"),
      f("critical", 0.8, "myMoney"),
      f("warning",  0.6, "myIdentity"),
      f("info",     0.3, "myDigitalLife"),
    ]);
    expect(b.totalFindings).toBe(4);
    expect(b.bySeverity).toEqual({ critical: 2, warning: 1, info: 1 });
    expect(b.byCategory["myMoney"]).toBe(2);
    expect(b.byCategory["myIdentity"]).toBe(1);
    expect(b.byCategory["myDigitalLife"]).toBe(1);
    expect(b.score).toBeGreaterThanOrEqual(0);
    expect(b.score).toBeLessThanOrEqual(100);
  });
});

describe("scoreTier", () => {
  it("buckets scores into tiers", () => {
    expect(scoreTier(100)).toBe("good");
    expect(scoreTier(85)).toBe("good");
    expect(scoreTier(80)).toBe("ok");
    expect(scoreTier(60)).toBe("ok");
    expect(scoreTier(45)).toBe("risk");
    expect(scoreTier(30)).toBe("risk");
    expect(scoreTier(10)).toBe("danger");
    expect(scoreTier(0)).toBe("danger");
  });
});
