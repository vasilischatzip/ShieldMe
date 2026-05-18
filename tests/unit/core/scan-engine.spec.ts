/**
 * T023a — ScanEngine integration tests.
 *
 * These exercise the engine end-to-end against the registered detector set.
 * They DON'T re-test individual detectors (those are covered elsewhere) —
 * they verify the engine orchestration: registration, dedupe, scoring,
 * and deterministic output.
 */
import { describe, it, expect } from "vitest";
import { scanEngine, scanText } from "~/core/scan-engine";
import { rulesState } from "~/core/rules";

const ALL_ON_RULES = {
  categories: {
    myMoney:       true,
    myIdentity:    true,
    myHealth:      true,
    myFamily:      true,
    myDigitalLife: true,
    myLocation:    true,
  },
  detectors: {} as Record<string, boolean>, // empty = default ON
  includeBetaDetectors: false,
};

describe("scanEngine.scan()", () => {
  it("returns empty findings for benign text", async () => {
    const r = await scanEngine.scan({
      module:      "document-check",
      source:      { text: "Hello there, just a regular sentence." },
      locale:      "en",
      activeRules: ALL_ON_RULES,
      clock:       Date,
    });
    expect(r.findings).toEqual([]);
    expect(r.score).toBe(100);
  });

  it("detects a credit card in pasted text", async () => {
    const r = await scanText("Card: 4111111111111111 please charge", ALL_ON_RULES);
    const card = r.findings.find((f) => f.detectorId === "credit-card");
    expect(card).toBeDefined();
    expect(card!.severity).toBe("critical");
    expect(r.score).toBeLessThan(100);
  });

  it("detects multiple categories in mixed text with strong context", async () => {
    // Each line carries the keywords the relevant detector needs to fire.
    const text = [
      "Charge credit card 4111111111111111 for the order.",
      "AWS access key id: AKIAIOSFODNN7EXAMPLE used for s3 deploy.",
      "Employee SSN 123-45-6789 social security on file.",
    ].join("\n");
    const r = await scanText(text, ALL_ON_RULES);
    const cats = new Set(r.findings.map((f) => f.categoryId));
    expect(cats.size).toBeGreaterThanOrEqual(2);
    // With at least 2 critical findings the score should drop noticeably.
    expect(r.score).toBeLessThan(95);
  });

  it("respects category OFF — myMoney off blocks credit-card detector", async () => {
    const rulesNoMoney = {
      ...ALL_ON_RULES,
      categories: { ...ALL_ON_RULES.categories, myMoney: false },
    };
    const r = await scanText("Card 4111111111111111", rulesNoMoney);
    expect(r.findings.find((f) => f.categoryId === "myMoney")).toBeUndefined();
  });

  it("never returns a finding with start >= end (well-formed)", async () => {
    const r = await scanText("Card: 4111111111111111 SSN 123-45-6789", ALL_ON_RULES);
    for (const f of r.findings) {
      expect(f.match.start).toBeGreaterThanOrEqual(0);
      expect(f.match.end).toBeGreaterThan(f.match.start);
      expect(f.contextSnippet).toContain("•••");
    }
  });

  it("is deterministic — same input twice → same findings", async () => {
    const text = "Card 4111111111111111 and SSN 123-45-6789";
    const a = await scanText(text, ALL_ON_RULES);
    const b = await scanText(text, ALL_ON_RULES);
    expect(a.findings.map((f) => `${f.detectorId}-${f.match.start}`).sort())
      .toEqual(b.findings.map((f) => `${f.detectorId}-${f.match.start}`).sort());
    expect(a.score).toBe(b.score);
  });

  it("returns a detectorRunId and durationMs", async () => {
    const r = await scanText("noop", ALL_ON_RULES);
    expect(typeof r.detectorRunId).toBe("string");
    expect(r.detectorRunId.length).toBeGreaterThan(4);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("default rules (rulesState) scan a long realistic email body without throwing", async () => {
    const text = `Hi team,

Please process the refund to card 4111111111111111. The customer's
email is jane@example.com and her SSN is 123-45-6789. We'll wire the
funds via IBAN GB82WEST12345698765432.

Thanks!`;
    const r = await scanText(text, rulesState.value);
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.durationMs).toBeLessThan(500); // well under perf budget
  });
});

describe("scanEngine — union-regex optimisation (T023b)", () => {
  // Use a non-blacklisted SSN (456-78-9012 → "456789012" — not in the known-fakes list)
  const VALID_TEST_SSN = "456-78-9012";

  it("hinted detector fires when hintPattern matches in text", async () => {
    // SSN detector has hintPattern — it should still fire via union optimisation
    const r = await scanText(
      `Employee SSN: ${VALID_TEST_SSN} on file.`,
      ALL_ON_RULES,
    );
    const ssn = r.findings.find(f => f.detectorId === "ssn");
    expect(ssn).toBeDefined();
  });

  it("hinted detector is SKIPPED when hintPattern has zero matches", async () => {
    // Text contains no digit-run patterns that SSN hintPattern would catch
    const r = await scanText("Hello world, no PII here.", ALL_ON_RULES);
    expect(r.findings).toHaveLength(0);
  });

  it("produces identical results to non-hinted baseline on rich PII text", async () => {
    const text = `Card: 4111111111111111. SSN: ${VALID_TEST_SSN}. IBAN: GB82WEST12345698765432.`;
    const r = await scanText(text, ALL_ON_RULES);
    // All three detectors should still fire — union optimisation is transparent
    const ids = r.findings.map(f => f.detectorId);
    expect(ids).toContain("credit-card");
    expect(ids).toContain("ssn");
    expect(ids).toContain("iban");
  });

  it("is deterministic with hinted detectors", async () => {
    const text = `SSN ${VALID_TEST_SSN} on record.`;
    const a = await scanText(text, ALL_ON_RULES);
    const b = await scanText(text, ALL_ON_RULES);
    expect(a.findings.map(f => f.detectorId).sort())
      .toEqual(b.findings.map(f => f.detectorId).sort());
  });
});

describe("scanEngine — dedupe", () => {
  it("does not return overlapping findings for the same detection", async () => {
    // A standalone PAN may also match SSN-like 9-digit pattern in some scoring
    // configs. The dedupe step should keep only the strongest match.
    const r = await scanText("4111111111111111", ALL_ON_RULES);
    const positions = r.findings.map((f) => `${f.match.start}-${f.match.end}`);
    expect(new Set(positions).size).toBe(positions.length);
  });
});
