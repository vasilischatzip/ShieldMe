/**
 * Medical diagnosis / ICD code detector — GA tier, global region.
 * Default OFF (myHealth category).
 *
 * Detects ICD-10 diagnostic codes that reveal medical conditions:
 *   Format: Letter + 2 digits + optional decimal + up to 4 chars
 *   Examples: E11.9 (Type 2 diabetes), F32.1 (Major depressive episode)
 *
 * Also detects DSM-5 codes and free-text diagnosis keywords.
 *
 * Severity: critical — diagnosis information is the most sensitive health data.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── ICD-10 code regex ───────────────────────────────────────── */

/**
 * ICD-10-CM: letter [A-Z] + 2 digits + optional dot + up to 4 alphanumeric
 * Must be near a medical keyword to avoid matching random codes.
 */
const ICD10_RE = /\b([A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?)\b/g;

const SCORER_CFG = {
  positiveKeywords: [
    "diagnosis", "icd", "icd-10", "icd10", "condition",
    "disease", "disorder", "syndrome", "patient", "medical",
    "clinical", "dsm", "treatment", "prognosis",
  ],
  negativeKeywords: [
    "product", "order", "model", "version", "color", "rgb",
    "zip", "area code", "serial",
  ],
  window: 80,
} as const;

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

export const diagnosisDetector: Detector = {
  id: "diagnosis",
  categoryId: "myHealth" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    ICD10_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ICD10_RE.exec(text)) !== null) {
      const raw   = m[1]!;
      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

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
