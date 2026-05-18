/**
 * Health ID / insurance member number detector — GA tier, global region.
 * Default OFF (myHealth category).
 *
 * Matches insurance/health plan member IDs that appear near health keywords.
 * Format varies by insurer; typically 9–12 alphanumeric chars, often with
 * a prefix letter followed by digits (e.g. A123456789, UHC12345678).
 *
 * Severity: critical — health insurance ID enables fraudulent claims.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

const HEALTH_ID_RE = /(?<![A-Z0-9])([A-Z]{1,3}[0-9]{6,11}|[0-9]{9,12})(?![A-Z0-9])/g;

const SCORER_CFG = {
  positiveKeywords: [
    "member id", "member number", "insurance id", "health plan",
    "insurance card", "subscriber id", "policy number", "medicare",
    "medicaid", "health insurance", "beneficiary",
  ],
  negativeKeywords: [
    "order", "invoice", "tracking", "serial", "part number",
    "credit card", "phone", "zip",
  ],
  window: 80,
} as const;

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

export const healthIdDetector: Detector = {
  id: "health-id",
  categoryId: "myHealth" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    HEALTH_ID_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HEALTH_ID_RE.exec(text)) !== null) {
      const raw   = m[1]!;
      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

      // Requires health context — suppresses enormous FPR from generic digit runs
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
