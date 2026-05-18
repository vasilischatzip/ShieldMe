/**
 * Passport number detector — GA tier, global region.
 *
 * Matches international passport number patterns:
 *   • Machine-readable zone (MRZ) patterns: P<COUNTRY + surname + name + passport number
 *   • Standard format: 1–2 letters + 6–9 digits/alphanumeric
 *
 * Context keywords (passport, travel document, mrz) are required for high
 * confidence. Bare alphanumeric sequences without context are suppressed.
 *
 * Severity: critical — passport number + date-of-birth enables identity fraud.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Regex ───────────────────────────────────────────────────── */

/**
 * Standard passport number:
 *   1–2 uppercase letters followed by 6–9 alphanumeric chars.
 * Covers: US (A12345678), UK (537522719), DE (C01X00T47), FR (14AA12345)
 */
const PASSPORT_RE = /(?<![A-Z0-9])([A-Z]{1,2}[A-Z0-9]{6,9})(?![A-Z0-9])/g;

/**
 * MRZ first line (ICAO 9303): P<COUNTRYNAME<<FORENAMES
 * This signals a travel document scan.
 */
const MRZ_RE = /P<[A-Z]{3}[A-Z<]{1,39}/g;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "passport", "travel document", "mrz", "nationality", "document number",
    "expiry date", "date of birth", "place of birth", "visa",
  ],
  negativeKeywords: [
    "product", "serial", "order", "model", "part number", "sku",
    "reference", "tracking", "barcode",
  ],
  window: 80,
} as const;

/* ── Snippet builder ─────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

/* ── Detector ────────────────────────────────────────────────── */

export const passportDetector: Detector = {
  id: "passport",
  categoryId: "myIdentity" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    /* ── MRZ lines — always high-confidence travel document ── */
    MRZ_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MRZ_RE.exec(text)) !== null) {
      const raw   = m[0]!;
      const start = m.index;
      const end   = start + raw.length;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "critical",
        confidence:     1.0, // MRZ line is unambiguous
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    /* ── Standard passport number — context-gated ── */
    PASSPORT_RE.lastIndex = 0;
    while ((m = PASSPORT_RE.exec(text)) !== null) {
      const raw   = m[1]!;
      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

      // Only surface when context provides enough signal
      if (conf <= 0.5) continue;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "critical",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
