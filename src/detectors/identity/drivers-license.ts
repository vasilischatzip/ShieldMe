/**
 * Driver's license number detector — GA tier, global region.
 *
 * Driver's license formats are highly variable by jurisdiction. This detector
 * relies on context keywords to gate confidence — a bare alphanumeric string
 * is never surfaced without surrounding "license" or "driving" context.
 *
 * Covered formats:
 *   • US standard: 1–2 letters + 4–9 digits  (e.g. A1234567, AB12345678)
 *   • Digit-only US states: 7–9 digits        (e.g. 123456789)
 *   • UK driving license: SURNAME(5) + DOB(6) + INITIAL + CHECK + suffix
 *     — Detected as 16-char alphanumeric string near "driving licence"
 *
 * Severity: warning — driving licence alone is not sufficient for account takeover.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Regex ───────────────────────────────────────────────────── */

/** US driver's license: optional 1-2 letters + 6-9 digits */
const DL_US_RE = /(?<![A-Z0-9])([A-Z]{0,2}\d{6,9})(?![A-Z0-9])/gi;

/** UK driving licence: 16-char alphanumeric block near keyword */
const DL_UK_RE = /\b([A-Z]{5}\d{6}[A-Z]{2}\d{2}[A-Z])\b/gi;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "driver", "driving", "license", "licence", "dl number", "dl#",
    "operator license", "motor vehicle", "dmv",
  ],
  negativeKeywords: [
    "order", "invoice", "tracking", "reference", "serial",
    "phone", "zip", "postal", "product",
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

export const driversLicenseDetector: Detector = {
  id: "drivers-license",
  categoryId: "myIdentity" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    // UK licence — matches structural pattern that is more specific
    DL_UK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DL_UK_RE.exec(text)) !== null) {
      const start = m.index;
      const end   = start + m[0].length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

      if (conf <= 0.5) continue;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "warning",
        confidence:     conf,
        match:          { value: m[0]!, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    // US / generic format — strictly requires keyword context
    DL_US_RE.lastIndex = 0;
    while ((m = DL_US_RE.exec(text)) !== null) {
      const raw   = m[1]!;
      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

      // Higher threshold for generic format to suppress FPR
      if (conf <= 0.65) continue;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "warning",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
