/**
 * T018/T019 — Tier-1 tax ID detector unit tests.
 *
 * Covers the six GA-tier detectors in src/detectors/money/tax.ts:
 *   • US ITIN   (us-itin)
 *   • UK UTR    (uk-utr)
 *   • CA SIN    (ca-sin)
 *   • AU ABN    (au-abn)
 *   • JP MN     (jp-my-number)
 *   • NL BSN    (nl-bsn)
 *
 * Each detector block verifies:
 *   - Shape (id, categoryId, region, shipTier)
 *   - Positive: valid inputs with keyword context → 1+ findings
 *   - Negative: checksum-failing inputs → 0 findings
 *   - Negative: no-context bare match below confidence gate → 0 findings
 *   - Finding shape (confidence 0–1, contextSnippet, match positions)
 *   - Determinism / purity (same input → same output, no context mutation)
 */
import { describe, it, expect } from "vitest";
import type { DetectorContext } from "~/detectors/types";
import {
  itinDetector,
  ukUtrDetector,
  caSinDetector,
  auAbnDetector,
  jpMyNumberDetector,
  nlBsnDetector,
  taxDetectors,
} from "~/detectors/money/tax";

/* ── Helpers ──────────────────────────────────────────────────── */

function ctx(text: string, locale = "en"): DetectorContext {
  return { locale, text, activeCustomRules: [], clock: Date };
}

function ctxKeyword(text: string, keyword: string): DetectorContext {
  return ctx(`${keyword} ${text}`);
}

/* ════════════════════════════════════════════════════════════════ */
/* taxDetectors barrel                                             */
/* ════════════════════════════════════════════════════════════════ */

describe("taxDetectors barrel", () => {
  it("exports 6 detectors", () => {
    expect(taxDetectors).toHaveLength(6);
  });

  it("all have shipTier ga", () => {
    for (const d of taxDetectors) {
      expect(d.shipTier).toBe("ga");
    }
  });

  it("all have categoryId myMoney", () => {
    for (const d of taxDetectors) {
      expect(d.categoryId).toBe("myMoney");
    }
  });

  it("all IDs are unique", () => {
    const ids = taxDetectors.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* US ITIN                                                         */
/* ════════════════════════════════════════════════════════════════ */

describe("us-itin detector", () => {
  it("has correct shape", () => {
    expect(itinDetector.id).toBe("us-itin");
    expect(itinDetector.categoryId).toBe("myMoney");
    expect(itinDetector.region).toBe("global");
    expect(itinDetector.shipTier).toBe("ga");
  });

  // Valid ITIN: area 900–999, group 50-65 / 70-88 / 90-92 / 94-99
  const VALID_ITIN_FORMATTED = "912-70-1234";
  const VALID_ITIN_SOLID     = "912701234";

  it("detects formatted ITIN with keyword context", () => {
    const findings = itinDetector.scan(
      ctxKeyword(VALID_ITIN_FORMATTED, "ITIN"),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("us-itin");
  });

  it("detects formatted ITIN without leading keywords (no conf gate on formatted)", () => {
    const findings = itinDetector.scan(ctx(`ITIN: ${VALID_ITIN_FORMATTED}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT detect solid ITIN without keyword context (conf gate)", () => {
    const findings = itinDetector.scan(ctx(VALID_ITIN_SOLID));
    // Solid without context should be filtered (conf ≤ 0.5)
    expect(findings.length).toBe(0);
  });

  it("detects solid ITIN with ITIN keyword context", () => {
    const findings = itinDetector.scan(
      ctxKeyword(VALID_ITIN_SOLID, "individual taxpayer identification"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire on SSN-range area (001-899)", () => {
    // 123-45-6789 — SSN area, not ITIN
    const findings = itinDetector.scan(ctx("ITIN: 123-45-6789"));
    expect(findings.length).toBe(0);
  });

  it("does NOT fire on invalid ITIN group 00", () => {
    // Area 900, group 00 — invalid
    const findings = itinDetector.scan(ctx("ITIN: 900-00-1234"));
    expect(findings.length).toBe(0);
  });

  it("does NOT fire on invalid ITIN group 78", () => {
    // Group 78 — previously issued but invalid range
    const findings = itinDetector.scan(ctx("ITIN: 900-78-1234"));
    expect(findings.length).toBe(0);
  });

  it("finding has required shape", () => {
    const [f] = itinDetector.scan(ctxKeyword(VALID_ITIN_FORMATTED, "ITIN individual taxpayer"));
    expect(f).toBeDefined();
    expect(typeof f!.confidence).toBe("number");
    expect(f!.confidence).toBeGreaterThanOrEqual(0);
    expect(f!.confidence).toBeLessThanOrEqual(1);
    expect(f!.severity).toBe("critical");
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.match.value).toBe(VALID_ITIN_FORMATTED);
  });

  it("match positions are correct", () => {
    const text = `Taxpayer ITIN: ${VALID_ITIN_FORMATTED} filed`;
    const [f]  = itinDetector.scan(ctx(text));
    expect(f).toBeDefined();
    expect(text.slice(f!.match.start, f!.match.end)).toBe(VALID_ITIN_FORMATTED);
  });

  it("is deterministic", () => {
    const c = ctxKeyword(VALID_ITIN_FORMATTED, "ITIN");
    expect(itinDetector.scan(c)).toEqual(itinDetector.scan(c));
  });

  it("does not mutate context", () => {
    const c = ctxKeyword(VALID_ITIN_FORMATTED, "ITIN");
    const before = JSON.stringify(c);
    itinDetector.scan(c);
    expect(JSON.stringify(c)).toBe(before);
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* UK UTR                                                          */
/* ════════════════════════════════════════════════════════════════ */

describe("uk-utr detector", () => {
  it("has correct shape", () => {
    expect(ukUtrDetector.id).toBe("uk-utr");
    expect(ukUtrDetector.categoryId).toBe("myMoney");
    expect(ukUtrDetector.region).toBe("global");
    expect(ukUtrDetector.shipTier).toBe("ga");
  });

  const VALID_UTR = "1234567890";

  it("detects UTR with HMRC keyword context", () => {
    const findings = ukUtrDetector.scan(ctx(`HMRC UTR: ${VALID_UTR}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("uk-utr");
  });

  it("detects K-prefixed UTR with keyword", () => {
    const findings = ukUtrDetector.scan(ctx(`Your UTR reference K${VALID_UTR}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire on bare 10 digits without UTR context (low conf gate)", () => {
    const findings = ukUtrDetector.scan(ctx("0123456789"));
    expect(findings.length).toBe(0);
  });

  it("does NOT fire on 11+ digits", () => {
    const findings = ukUtrDetector.scan(ctx("UTR: 12345678901"));
    // 11 digits — no 10-digit match
    const matched = findings.filter(f => f.detectorId === "uk-utr");
    expect(matched.length).toBe(0);
  });

  it("finding has required shape", () => {
    const [f] = ukUtrDetector.scan(ctx(`HMRC unique taxpayer reference ${VALID_UTR}`));
    expect(f).toBeDefined();
    expect(typeof f!.confidence).toBe("number");
    expect(f!.confidence).toBeGreaterThan(0);
    expect(f!.severity).toBe("warning");
    expect(f!.contextSnippet).toContain("•••");
  });

  it("is deterministic", () => {
    const c = ctx(`HMRC UTR: ${VALID_UTR}`);
    expect(ukUtrDetector.scan(c)).toEqual(ukUtrDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* CA SIN                                                          */
/* ════════════════════════════════════════════════════════════════ */

describe("ca-sin detector", () => {
  it("has correct shape", () => {
    expect(caSinDetector.id).toBe("ca-sin");
    expect(caSinDetector.categoryId).toBe("myMoney");
    expect(caSinDetector.region).toBe("global");
    expect(caSinDetector.shipTier).toBe("ga");
  });

  // Valid Luhn-passing SINs (computed):
  // 046-454-286 passes Luhn (classic test vector used in CRA docs)
  const VALID_SIN_FORMATTED = "046-454-286";
  const VALID_SIN_SOLID     = "046454286";

  it("detects formatted SIN with keyword context", () => {
    const findings = caSinDetector.scan(ctx(`SIN: ${VALID_SIN_FORMATTED}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("ca-sin");
  });

  it("detects formatted SIN with CRA keyword", () => {
    const findings = caSinDetector.scan(ctx(`Your CRA social insurance number is ${VALID_SIN_FORMATTED}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT detect Luhn-failing SIN", () => {
    // 111-111-111 → Luhn fails
    const findings = caSinDetector.scan(ctx("SIN: 111-111-111"));
    expect(findings.length).toBe(0);
  });

  it("does NOT detect solid SIN without keyword context (conf gate)", () => {
    const findings = caSinDetector.scan(ctx(VALID_SIN_SOLID));
    expect(findings.length).toBe(0);
  });

  it("detects solid SIN with SIN keyword", () => {
    const findings = caSinDetector.scan(ctx(`social insurance number ${VALID_SIN_SOLID}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("finding has required shape", () => {
    const [f] = caSinDetector.scan(ctx(`SIN: ${VALID_SIN_FORMATTED}`));
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.match.value).toBe(VALID_SIN_FORMATTED);
  });

  it("match positions are correct", () => {
    const text = `Canadian SIN: ${VALID_SIN_FORMATTED} — please verify`;
    const [f]  = caSinDetector.scan(ctx(text));
    expect(f).toBeDefined();
    expect(text.slice(f!.match.start, f!.match.end)).toBe(VALID_SIN_FORMATTED);
  });

  it("is deterministic", () => {
    const c = ctx(`SIN: ${VALID_SIN_FORMATTED}`);
    expect(caSinDetector.scan(c)).toEqual(caSinDetector.scan(c));
  });

  it("does not mutate context", () => {
    const c = ctx(`SIN: ${VALID_SIN_FORMATTED}`);
    const before = JSON.stringify(c);
    caSinDetector.scan(c);
    expect(JSON.stringify(c)).toBe(before);
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* AU ABN                                                          */
/* ════════════════════════════════════════════════════════════════ */

describe("au-abn detector", () => {
  it("has correct shape", () => {
    expect(auAbnDetector.id).toBe("au-abn");
    expect(auAbnDetector.categoryId).toBe("myMoney");
    expect(auAbnDetector.region).toBe("global");
    expect(auAbnDetector.shipTier).toBe("ga");
  });

  // 51 824 753 556 — a known-valid ABN (ATO test vector)
  const VALID_ABN_SPACED  = "51 824 753 556";
  const VALID_ABN_PLAIN   = "51824753556";

  it("detects spaced ABN with keyword context", () => {
    const findings = auAbnDetector.scan(ctx(`ABN: ${VALID_ABN_SPACED}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("au-abn");
  });

  it("detects plain ABN with ATO keyword", () => {
    const findings = auAbnDetector.scan(ctx(`ATO business number ${VALID_ABN_PLAIN}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT detect checksum-failing ABN", () => {
    // Corrupt last digit: 51 824 753 557
    const findings = auAbnDetector.scan(ctx("ABN: 51824753557"));
    expect(findings.length).toBe(0);
  });

  it("does NOT fire on ABN leading with 0 (structurally invalid)", () => {
    // ABN with first digit 0 → auAbn() returns false
    const findings = auAbnDetector.scan(ctx("ABN: 01234567890"));
    expect(findings.length).toBe(0);
  });

  it("finding has required shape", () => {
    const [f] = auAbnDetector.scan(ctx(`ABN: ${VALID_ABN_SPACED}`));
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.contextSnippet).toContain("•••");
  });

  it("is deterministic", () => {
    const c = ctx(`ABN ${VALID_ABN_PLAIN}`);
    expect(auAbnDetector.scan(c)).toEqual(auAbnDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* JP My Number                                                    */
/* ════════════════════════════════════════════════════════════════ */

describe("jp-my-number detector", () => {
  it("has correct shape", () => {
    expect(jpMyNumberDetector.id).toBe("jp-my-number");
    expect(jpMyNumberDetector.categoryId).toBe("myMoney");
    expect(jpMyNumberDetector.region).toBe("global");
    expect(jpMyNumberDetector.shipTier).toBe("ga");
  });

  // Valid My Number: check digit computation for 123456789018
  // Q = 1*6 + 2*5 + 3*4 + 4*3 + 5*2 + 6*7 + 7*6 + 8*5 + 9*4 + 0*3 + 1*2
  //   = 6 + 10 + 12 + 12 + 10 + 42 + 42 + 40 + 36 + 0 + 2 = 212
  // R = 212 % 11 = 3 → check = 11 - 3 = 8 → 123456789018 ✓ (last digit 8)
  const VALID_MN = "123456789018";
  const VALID_MN_FORMATTED = "1234-5678-9018";

  it("detects formatted My Number with keyword", () => {
    const findings = jpMyNumberDetector.scan(ctx(`My Number: ${VALID_MN_FORMATTED}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("jp-my-number");
  });

  it("detects formatted My Number with Japanese keyword", () => {
    const findings = jpMyNumberDetector.scan(ctx(`マイナンバー: ${VALID_MN_FORMATTED}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT detect check-digit-failing My Number", () => {
    // Change last digit: 123456789017 → invalid
    const findings = jpMyNumberDetector.scan(ctx("My Number: 123456789017"));
    expect(findings.length).toBe(0);
  });

  it("does NOT detect solid My Number without keyword context (conf gate)", () => {
    const findings = jpMyNumberDetector.scan(ctx(VALID_MN));
    expect(findings.length).toBe(0);
  });

  it("detects solid My Number with mynumber keyword", () => {
    const findings = jpMyNumberDetector.scan(ctx(`mynumber ${VALID_MN}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("finding has required shape", () => {
    const [f] = jpMyNumberDetector.scan(ctx(`My Number: ${VALID_MN_FORMATTED}`));
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.contextSnippet).toContain("•••");
  });

  it("is deterministic", () => {
    const c = ctx(`My Number: ${VALID_MN_FORMATTED}`);
    expect(jpMyNumberDetector.scan(c)).toEqual(jpMyNumberDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* NL BSN                                                          */
/* ════════════════════════════════════════════════════════════════ */

describe("nl-bsn detector", () => {
  it("has correct shape", () => {
    expect(nlBsnDetector.id).toBe("nl-bsn");
    expect(nlBsnDetector.categoryId).toBe("myMoney");
    expect(nlBsnDetector.region).toBe("global");
    expect(nlBsnDetector.shipTier).toBe("ga");
  });

  // Valid BSN: 111222333 — verify elfproef:
  // 9*1 + 8*1 + 7*1 + 6*2 + 5*2 + 4*2 + 3*3 + 2*3 + -1*3
  // = 9 + 8 + 7 + 12 + 10 + 8 + 9 + 6 - 3 = 66 → not ÷ 11
  // Use known-valid: 111234560
  // 9*1+8*1+7*1+6*2+5*3+4*4+3*5+2*6+(-1)*0 = 9+8+7+12+15+16+15+12+0=94 → no
  // Let me use 850326423:
  // 9*8+8*5+7*0+6*3+5*2+4*6+3*4+2*2+(-1)*3 = 72+40+0+18+10+24+12+4-3=177 → 177/11=16.09 no
  // Actually use the official test BSN: 123456782
  // 9*1+8*2+7*3+6*4+5*5+4*6+3*7+2*8+(-1)*2 = 9+16+21+24+25+24+21+16-2 = 154 → 154/11=14 ✓
  const VALID_BSN = "123456782";

  it("detects BSN with keyword context", () => {
    const findings = nlBsnDetector.scan(ctx(`BSN: ${VALID_BSN}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("nl-bsn");
  });

  it("detects BSN with Dutch keyword", () => {
    const findings = nlBsnDetector.scan(ctx(`burgerservicenummer ${VALID_BSN}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT detect elfproef-failing BSN", () => {
    // 123456783 — last digit changed, elfproef fails
    const findings = nlBsnDetector.scan(ctx("BSN: 123456783"));
    expect(findings.length).toBe(0);
  });

  it("does NOT fire on bare valid BSN without keyword context (conf gate)", () => {
    const findings = nlBsnDetector.scan(ctx(VALID_BSN));
    // No keyword → conf < 0.35 → filtered
    expect(findings.length).toBe(0);
  });

  it("finding has required shape", () => {
    const [f] = nlBsnDetector.scan(ctx(`BSN: ${VALID_BSN}`));
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.match.value).toBe(VALID_BSN);
  });

  it("match positions are correct", () => {
    const text = `Belastingdienst BSN: ${VALID_BSN} geregistreerd`;
    const [f]  = nlBsnDetector.scan(ctx(text));
    expect(f).toBeDefined();
    expect(text.slice(f!.match.start, f!.match.end)).toBe(VALID_BSN);
  });

  it("is deterministic", () => {
    const c = ctx(`BSN: ${VALID_BSN}`);
    expect(nlBsnDetector.scan(c)).toEqual(nlBsnDetector.scan(c));
  });

  it("does not mutate context", () => {
    const c = ctx(`BSN: ${VALID_BSN}`);
    const before = JSON.stringify(c);
    nlBsnDetector.scan(c);
    expect(JSON.stringify(c)).toBe(before);
  });
});
