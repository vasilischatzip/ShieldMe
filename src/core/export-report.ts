/**
 * Export Report — generates a ShieldMe Exposure PDF report.
 *
 * Two parts:
 *   1. buildReportLines() — pure function; returns the text lines that will
 *      appear in the PDF. Fully testable without a DOM or jsPDF.
 *   2. buildReport() — async; lazy-imports jsPDF, renders the lines, returns
 *      a Blob.
 *
 * Free tier  → 1-page summary (score, counts, upgrade prompt).
 * Premium    → full findings breakdown grouped by category.
 *
 * Privacy: never includes raw match values (match.value).
 *           Only contextSnippet (pre-redacted) is used.
 */
import type { Finding } from "~/detectors/types";
import type { LastScanSummary } from "~/app/state/last-scan";

/* ── Public types ────────────────────────────────────────────── */

export type ReportTier = "free" | "premium";

export interface ReportInput {
  summary: LastScanSummary;
  findings: Finding[];
  tier: ReportTier;
}

export interface ReportOutput {
  blob: Blob;
  filename: string;
  /** Total page count of the generated PDF. */
  pageCount: number;
}

/* ── Section types (internal document model) ─────────────────── */

type TextLine = { kind: "text"; value: string; bold?: boolean; size?: number };
type SepLine  = { kind: "sep" };
type DocLine  = TextLine | SepLine;

/* ── Pure document model ──────────────────────────────────────── */

/**
 * Pure builder — returns the text content of the report as a flat array of
 * strings.  Used directly by unit tests; also consumed by buildReport().
 */
export function buildReportLines(input: ReportInput): string[] {
  const { summary, findings, tier } = input;
  const lines: string[] = [];

  /* Title */
  lines.push("ShieldMe Exposure Report");

  /* Scan Summary */
  lines.push("Scan Summary");
  lines.push(`Source: ${summary.sourceLabel}`);
  lines.push(`Exposure Score: ${summary.score}/100`);
  lines.push(`Total Findings: ${summary.totalFindings}`);
  lines.push(
    `Critical: ${summary.critical}  Warning: ${summary.warning}  Info: ${summary.info}`,
  );
  lines.push(`Scanned: ${new Date(summary.at).toUTCString()}`);
  lines.push(`Duration: ${summary.durationMs} ms`);

  if (tier === "free") {
    lines.push(
      "Upgrade to ShieldMe Premium to export the full findings breakdown.",
    );
    return lines;
  }

  /* Premium: Findings section */
  lines.push("Findings");

  if (findings.length === 0) {
    lines.push("No findings detected — this document looks clean.");
    return lines;
  }

  /* Group by category */
  const byCategory = new Map<string, Finding[]>();
  for (const f of findings) {
    const bucket = byCategory.get(f.categoryId) ?? [];
    bucket.push(f);
    byCategory.set(f.categoryId, bucket);
  }

  for (const [cat, catFindings] of byCategory.entries()) {
    lines.push(cat);
    for (const f of catFindings) {
      lines.push(
        `• ${f.detectorId} — ${f.severity} (${Math.round(f.confidence * 100)}%)`,
      );
      if (f.contextSnippet) {
        lines.push(`  ${f.contextSnippet}`);
      }
    }
  }

  return lines;
}

/* ── Internal structured model (used by buildReport) ────────────
 *  Richer than plain strings — carries font + size metadata so the PDF
 *  renderer doesn't have to infer them from content.
 */
function buildDocLines(input: ReportInput): DocLine[] {
  const { summary, findings, tier } = input;
  const doc: DocLine[] = [];

  const h = (value: string, size = 20): DocLine =>
    ({ kind: "text", value, bold: true, size });
  const sub = (value: string): DocLine =>
    ({ kind: "text", value, bold: true, size: 13 });
  const body = (value: string): DocLine =>
    ({ kind: "text", value, bold: false, size: 10 });
  const sep = (): DocLine => ({ kind: "sep" });

  doc.push(h("ShieldMe Exposure Report"));
  doc.push(sep());
  doc.push(sub("Scan Summary"));
  doc.push(body(`Source: ${summary.sourceLabel}`));
  doc.push(body(`Exposure Score: ${summary.score}/100`));
  doc.push(body(`Total Findings: ${summary.totalFindings}`));
  doc.push(
    body(
      `Critical: ${summary.critical}  Warning: ${summary.warning}  Info: ${summary.info}`,
    ),
  );
  doc.push(body(`Scanned: ${new Date(summary.at).toUTCString()}`));
  doc.push(body(`Duration: ${summary.durationMs} ms`));

  if (tier === "free") {
    doc.push(sep());
    doc.push(
      body(
        "Upgrade to ShieldMe Premium to export the full findings breakdown.",
      ),
    );
    return doc;
  }

  doc.push(sep());
  doc.push(sub("Findings"));

  if (findings.length === 0) {
    doc.push(body("No findings detected — this document looks clean."));
    return doc;
  }

  const byCategory = new Map<string, Finding[]>();
  for (const f of findings) {
    const bucket = byCategory.get(f.categoryId) ?? [];
    bucket.push(f);
    byCategory.set(f.categoryId, bucket);
  }

  for (const [cat, catFindings] of byCategory.entries()) {
    doc.push(sep());
    doc.push({ kind: "text", value: cat, bold: true, size: 11 });
    for (const f of catFindings) {
      doc.push(
        body(
          `• ${f.detectorId} — ${f.severity} (${Math.round(f.confidence * 100)}%)`,
        ),
      );
      if (f.contextSnippet) {
        doc.push(body(`    ${f.contextSnippet}`));
      }
    }
  }

  return doc;
}

/* ── PDF renderer ────────────────────────────────────────────── */

const MARGIN     = 20; // mm
const MAX_Y      = 270;
const LINE_GAP   = 7;
const PAGE_W     = 210;
const CONTENT_W  = PAGE_W - MARGIN * 2;

/**
 * Async — lazy-imports jsPDF so the library is excluded from the popup's
 * initial bundle (Rollup code-splits it into assets/export-pdf-*.js).
 */
export async function buildReport(input: ReportInput): Promise<ReportOutput> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 30;

  function newPage() {
    doc.addPage();
    y = 20;
  }

  function ensureSpace(needed: number) {
    if (y + needed > MAX_Y) newPage();
  }

  for (const line of buildDocLines(input)) {
    if (line.kind === "sep") {
      y += LINE_GAP;
      continue;
    }

    const size   = line.size ?? 10;
    const weight = line.bold ? "bold" : "normal";

    doc.setFont("helvetica", weight);
    doc.setFontSize(size);

    const lineH = size * 0.4 + 2; // rough mm per line at the given size
    ensureSpace(lineH + 2);

    const wrapped = doc.splitTextToSize(line.value, CONTENT_W);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * lineH;
  }

  const blob = doc.output("blob") as Blob;

  return {
    blob,
    filename: "shieldme-report.pdf",
    pageCount: doc.getNumberOfPages(),
  };
}
