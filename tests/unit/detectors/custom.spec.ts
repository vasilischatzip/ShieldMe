/**
 * T022a — Custom Rules unit tests.
 *
 * Verifies:
 *   - Safe patterns are accepted and produce a working Detector.
 *   - ReDoS-prone patterns (nested quantifiers, catastrophic alternation) are rejected.
 *   - Keyword-mode rules match case-insensitively with no regex exposure.
 *   - Output conforms to the Finding contract (raw value never in contextSnippet).
 */
import { describe, it, expect } from "vitest";
import {
  validateCustomPattern,
  createCustomDetector,
} from "~/detectors/custom";
import type { CustomRule } from "~/detectors/types";
import type { DetectorContext } from "~/detectors/types";

/* ── Helpers ──────────────────────────────────────────────────── */

function ctx(text: string): DetectorContext {
  return { locale: "en", text, activeCustomRules: [], clock: Date };
}

function patternRule(overrides: Partial<CustomRule> = {}): CustomRule {
  return {
    id: "custom.test",
    kind: "pattern",
    pattern: "ACME-\\d{6}",
    severity: "warning",
    label: "ACME internal code",
    categoryId: "myDigitalLife",
    ...overrides,
  };
}

function keywordRule(overrides: Partial<CustomRule> = {}): CustomRule {
  return {
    id: "custom.kw",
    kind: "keyword",
    pattern: "confidential",
    severity: "info",
    label: "Confidential keyword",
    categoryId: "myDigitalLife",
    ...overrides,
  };
}

/* ════════════════════════════════════════════════════════════════ */

describe("validateCustomPattern — safe patterns accepted", () => {
  it("accepts a simple literal regex", () => {
    expect(validateCustomPattern("hello world")).toEqual({ ok: true });
  });

  it("accepts anchored digit pattern", () => {
    expect(validateCustomPattern("ACME-\\d{6}")).toEqual({ ok: true });
  });

  it("accepts non-nested quantifier on character class", () => {
    expect(validateCustomPattern("[A-Z]{3}-\\d{4}")).toEqual({ ok: true });
  });

  it("accepts alternation without quantifier wrapping it", () => {
    expect(validateCustomPattern("foo|bar|baz")).toEqual({ ok: true });
  });

  it("accepts a quantified literal group (no quantifier inside)", () => {
    expect(validateCustomPattern("(abc)+")).toEqual({ ok: true });
  });

  it("accepts look-ahead", () => {
    expect(validateCustomPattern("(?=\\d{4})\\d{4}")).toEqual({ ok: true });
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("validateCustomPattern — ReDoS patterns rejected", () => {
  it("rejects (a+)+ — nested quantifier", () => {
    const r = validateCustomPattern("(a+)+");
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toMatch(/backtrack|quantif/i);
  });

  it("rejects (a+)* — nested quantifier", () => {
    expect(validateCustomPattern("(a+)*").ok).toBe(false);
  });

  it("rejects (\\d+)+ — nested on escape class", () => {
    expect(validateCustomPattern("(\\d+)+").ok).toBe(false);
  });

  it("rejects (\\w+\\.)+  — nested quantifier in a common email ReDoS pattern", () => {
    expect(validateCustomPattern("(\\w+\\.)+\\w+").ok).toBe(false);
  });

  it("rejects (a|aa)+ — catastrophic alternation", () => {
    expect(validateCustomPattern("(a|aa)+").ok).toBe(false);
  });

  it("rejects (a|b)+ with alternation inside quantified group", () => {
    expect(validateCustomPattern("(a|b)+").ok).toBe(false);
  });

  it("rejects pattern longer than 500 chars", () => {
    const long = "a".repeat(501);
    const r = validateCustomPattern(long);
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toMatch(/too long/i);
  });

  it("rejects invalid regex syntax", () => {
    const r = validateCustomPattern("(unclosed");
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toMatch(/invalid pattern|syntax/i);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("createCustomDetector — pattern mode", () => {
  it("returns a Detector for a safe pattern rule", () => {
    const result = createCustomDetector(patternRule());
    expect("error" in result).toBe(false);
    const det = result as import("~/detectors/types").Detector;
    expect(det.id).toBe("custom.test");
    expect(det.categoryId).toBe("myDigitalLife");
    expect(det.shipTier).toBe("ga");
    expect(det.region).toBe("global");
  });

  it("returns error for a ReDoS pattern", () => {
    const result = createCustomDetector(patternRule({ pattern: "(\\d+)+" }));
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/backtrack|quantif/i);
  });

  it("finds matches in text", () => {
    const det = createCustomDetector(
      patternRule({ pattern: "ACME-\\d{6}", severity: "warning" })
    ) as { scan: (ctx: DetectorContext) => import("~/detectors/types").Finding[] };
    const findings = det.scan(ctx("Please process order ACME-123456 immediately."));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.detectorId).toBe("custom.test");
    expect(findings[0]!.severity).toBe("warning");
  });

  it("contextSnippet contains ••• and not the raw match", () => {
    const det = createCustomDetector(patternRule({ pattern: "SECRET-TOKEN-XYZ" })) as {
      scan: (ctx: DetectorContext) => import("~/detectors/types").Finding[];
    };
    const findings = det.scan(ctx("Key: SECRET-TOKEN-XYZ end"));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.contextSnippet).toContain("•••");
    expect(findings[0]!.contextSnippet).not.toContain("SECRET-TOKEN-XYZ");
  });

  it("returns empty array when pattern does not match", () => {
    const det = createCustomDetector(patternRule()) as {
      scan: (ctx: DetectorContext) => import("~/detectors/types").Finding[];
    };
    const findings = det.scan(ctx("No codes here."));
    expect(findings).toHaveLength(0);
  });

  it("finds multiple matches", () => {
    const det = createCustomDetector(patternRule()) as {
      scan: (ctx: DetectorContext) => import("~/detectors/types").Finding[];
    };
    const findings = det.scan(
      ctx("Order ACME-111111 and ACME-222222 are ready.")
    );
    expect(findings).toHaveLength(2);
  });

  it("is case-sensitive by default (pattern mode)", () => {
    const det = createCustomDetector(patternRule({ pattern: "ACME-\\d{6}" })) as {
      scan: (ctx: DetectorContext) => import("~/detectors/types").Finding[];
    };
    // lowercase "acme-" should not match the uppercase pattern
    expect(det.scan(ctx("acme-123456"))).toHaveLength(0);
    expect(det.scan(ctx("ACME-123456"))).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("createCustomDetector — keyword mode", () => {
  it("returns a Detector for a keyword rule", () => {
    const result = createCustomDetector(keywordRule());
    expect("error" in result).toBe(false);
    const det = result as { id: string };
    expect(det.id).toBe("custom.kw");
  });

  it("matches keyword case-insensitively", () => {
    const det = createCustomDetector(keywordRule({ pattern: "confidential" })) as {
      scan: (ctx: DetectorContext) => import("~/detectors/types").Finding[];
    };
    expect(det.scan(ctx("This doc is CONFIDENTIAL"))).toHaveLength(1);
    expect(det.scan(ctx("This doc is Confidential"))).toHaveLength(1);
    expect(det.scan(ctx("This doc is confidential"))).toHaveLength(1);
  });

  it("contextSnippet contains ••• instead of matched text", () => {
    const det = createCustomDetector(keywordRule({ pattern: "TOP SECRET" })) as {
      scan: (ctx: DetectorContext) => import("~/detectors/types").Finding[];
    };
    const findings = det.scan(ctx("Label says TOP SECRET for internal use"));
    expect(findings[0]!.contextSnippet).toContain("•••");
    expect(findings[0]!.contextSnippet).not.toContain("TOP SECRET");
  });

  it("returns empty array when keyword absent", () => {
    const det = createCustomDetector(keywordRule()) as {
      scan: (ctx: DetectorContext) => import("~/detectors/types").Finding[];
    };
    expect(det.scan(ctx("Nothing matches here."))).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("createCustomDetector — Finding contract", () => {
  it("finding has all required fields", () => {
    const det = createCustomDetector(
      patternRule({ pattern: "ACME-\\d{6}", severity: "critical" })
    ) as { scan: (ctx: DetectorContext) => import("~/detectors/types").Finding[] };
    const [f] = det.scan(ctx("ref ACME-000001 end"));
    expect(f).toBeDefined();
    expect(typeof f!.detectorId).toBe("string");
    expect(typeof f!.categoryId).toBe("string");
    expect(["critical", "warning", "info"]).toContain(f!.severity);
    expect(typeof f!.confidence).toBe("number");
    expect(f!.confidence).toBeGreaterThanOrEqual(0);
    expect(f!.confidence).toBeLessThanOrEqual(1);
    expect(typeof f!.match.start).toBe("number");
    expect(typeof f!.match.end).toBe("number");
    expect(typeof f!.contextSnippet).toBe("string");
    // match.value MAY be set internally but contextSnippet must be redacted
    expect(f!.contextSnippet).toContain("•••");
  });

  it("is deterministic — same input same output", () => {
    const det = createCustomDetector(patternRule()) as {
      scan: (ctx: DetectorContext) => import("~/detectors/types").Finding[];
    };
    const c = ctx("ref ACME-123456 end");
    expect(JSON.stringify(det.scan(c))).toBe(JSON.stringify(det.scan(c)));
  });
});
