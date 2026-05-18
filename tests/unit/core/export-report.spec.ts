/**
 * T028a — Export Report unit tests.
 *
 * Verifies:
 *   1. buildReportLines returns a title line and "Scan Summary" heading.
 *   2. Free-tier report omits detailed findings and includes an upgrade prompt.
 *   3. Premium report includes a "Findings" section with detector IDs.
 *   4. buildReport resolves to a non-empty Blob.
 *   5. Free-tier report is single-page; premium report with many findings may add pages.
 *   6. Generated filename is deterministic (shieldme-report.pdf).
 */
import { describe, it, expect } from "vitest";
import {
  buildReportLines,
  buildReport,
  type ReportInput,
} from "../../../src/core/export-report";
import type { Finding } from "../../../src/detectors/types";

/* ── Fixtures ────────────────────────────────────────────────── */

function makeInput(
  tier: "free" | "premium",
  findings: Finding[] = [],
): ReportInput {
  return {
    tier,
    summary: {
      score: 72,
      totalFindings: findings.length,
      critical: findings.filter((f) => f.severity === "critical").length,
      warning: findings.filter((f) => f.severity === "warning").length,
      info: findings.filter((f) => f.severity === "info").length,
      byCategory: {},
      sourceLabel: "Test document",
      durationMs: 42,
      at: 1_700_000_000_000,
    },
    findings,
  };
}

function makeFinding(
  detectorId: string,
  categoryId = "myDigitalLife",
  severity: Finding["severity"] = "warning",
): Finding {
  return {
    detectorId,
    categoryId: categoryId as import("../../../src/core/rules").CategoryId,
    severity,
    confidence: 0.9,
    match: { value: "REDACTED", start: 0, end: 7 },
    contextSnippet: `...•••... near ${detectorId}`,
  };
}

/* ── buildReportLines ────────────────────────────────────────── */

describe("buildReportLines", () => {
  it("includes the ShieldMe title heading", () => {
    const lines = buildReportLines(makeInput("free"));
    expect(lines.some((l) => l.includes("ShieldMe Exposure Report"))).toBe(true);
  });

  it("includes Scan Summary heading", () => {
    const lines = buildReportLines(makeInput("free"));
    expect(lines.some((l) => l.includes("Scan Summary"))).toBe(true);
  });

  it("includes the score", () => {
    const lines = buildReportLines(makeInput("free"));
    expect(lines.some((l) => l.includes("72/100"))).toBe(true);
  });

  it("includes the source label", () => {
    const lines = buildReportLines(makeInput("free"));
    expect(lines.some((l) => l.includes("Test document"))).toBe(true);
  });

  it("free tier includes an upgrade prompt", () => {
    const lines = buildReportLines(makeInput("free"));
    expect(lines.some((l) => /upgrade|premium/i.test(l))).toBe(true);
  });

  it("free tier does NOT include a Findings section", () => {
    const lines = buildReportLines(
      makeInput("free", [makeFinding("email")]),
    );
    expect(lines.some((l) => l === "Findings")).toBe(false);
  });

  it("premium tier includes Findings heading", () => {
    const lines = buildReportLines(
      makeInput("premium", [makeFinding("email")]),
    );
    expect(lines.some((l) => l.includes("Findings"))).toBe(true);
  });

  it("premium tier includes detector IDs in the findings", () => {
    const lines = buildReportLines(
      makeInput("premium", [makeFinding("email"), makeFinding("iban", "myMoney")]),
    );
    expect(lines.some((l) => l.includes("email"))).toBe(true);
    expect(lines.some((l) => l.includes("iban"))).toBe(true);
  });

  it("premium tier lists each category as a sub-heading", () => {
    const lines = buildReportLines(
      makeInput("premium", [
        makeFinding("email", "myDigitalLife"),
        makeFinding("iban", "myMoney"),
      ]),
    );
    expect(lines.some((l) => l.includes("myDigitalLife"))).toBe(true);
    expect(lines.some((l) => l.includes("myMoney"))).toBe(true);
  });

  it("premium tier with no findings still includes Findings heading", () => {
    const lines = buildReportLines(makeInput("premium", []));
    expect(lines.some((l) => l.includes("Findings"))).toBe(true);
    // Should note that no findings were detected
    expect(lines.some((l) => /no findings|clean/i.test(l))).toBe(true);
  });

  it("includes contextSnippet (redacted) for each finding", () => {
    const lines = buildReportLines(
      makeInput("premium", [makeFinding("phone-intl")]),
    );
    expect(lines.some((l) => l.includes("•••"))).toBe(true);
  });

  it("severity label appears in finding lines", () => {
    const lines = buildReportLines(
      makeInput("premium", [makeFinding("ssn", "myIdentity", "critical")]),
    );
    expect(lines.some((l) => l.includes("critical"))).toBe(true);
  });
});

/* ── buildReport (integration — real jsPDF) ──────────────────── */

describe("buildReport", () => {
  it("returns a non-empty Blob with application/pdf type", async () => {
    const result = await buildReport(makeInput("free"));
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.blob.type).toContain("pdf");
  });

  it("filename is shieldme-report.pdf", async () => {
    const result = await buildReport(makeInput("free"));
    expect(result.filename).toBe("shieldme-report.pdf");
  });

  it("free-tier report is 1 page", async () => {
    const result = await buildReport(
      makeInput("free", [makeFinding("email"), makeFinding("iban", "myMoney")]),
    );
    expect(result.pageCount).toBe(1);
  });

  it("premium report with findings is at least 1 page", async () => {
    const findings = Array.from({ length: 5 }, (_, i) =>
      makeFinding(`detector-${i}`),
    );
    const result = await buildReport(makeInput("premium", findings));
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("produces larger PDF for premium vs free (more content)", async () => {
    const findings = Array.from({ length: 20 }, (_, i) =>
      makeFinding(`detector-${i}`),
    );
    const freePdf = await buildReport(makeInput("free", findings));
    const premiumPdf = await buildReport(makeInput("premium", findings));
    expect(premiumPdf.blob.size).toBeGreaterThan(freePdf.blob.size);
  });
});
