/**
 * Medical record number (MRN) detector — GA tier, global region.
 * Default OFF (myHealth category).
 *
 * Medical record numbers are assigned by healthcare facilities. They vary
 * widely in format; this detector relies on strong keyword context.
 *
 * Severity: critical — MRN + facility enables records retrieval and fraud.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/** MRN candidates: 6–12 alphanumeric, typically digits or letter-digits */
const MRN_RE = /(?<![A-Z0-9])([A-Z]?[0-9]{6,12})(?![A-Z0-9])/g;

const SCORER_CFG = {
  positiveKeywords: [
    "mrn", "medical record", "patient", "hospital", "clinic",
  ],
  negativeKeywords: [
    "order", "invoice", "tracking", "serial", "account",
    "credit card", "phone", "zip", "route",
  ],
  window: 80,
} as const;

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

export const medicalRecordDetector: Detector = {
  id: "medical-record",
  categoryId: "myHealth" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    MRN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MRN_RE.exec(text)) !== null) {
      const raw   = m[1]!;
      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

      if (conf <= 0.55) continue; // requires medical context — MRN pattern is very common

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
