/**
 * School / educational institution info detector — GA tier, global region.
 * Default OFF (myFamily category).
 *
 * Detects a child's school name or student ID in context that could link
 * a minor to a specific educational institution.
 *
 * Severity: warning — school name + child name enables stalking.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/** Student ID / school reference: alphanumeric near school keywords */
const STUDENT_ID_RE = /(?<![A-Z0-9])([A-Z]?\d{5,10})(?![A-Z0-9])/g;

/** School name hint: "X Elementary/Middle/High/Primary School" */
const SCHOOL_NAME_RE =
  /\b((?:[A-Z][a-zA-Z'-]{1,20}\s){1,4}(?:Elementary|Middle|High|Primary|Junior|Senior|Academy|School|College))\b/g;

const SCORER_CFG = {
  positiveKeywords: [
    "school", "student", "pupil", "grade", "class", "teacher",
    "principal", "enrollment", "attendance", "campus", "elementary",
    "middle school", "high school",
  ],
  negativeKeywords: ["product", "order", "invoice", "company", "firm"],
  window: 80,
} as const;

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

function scanRe(
  re: RegExp,
  ctx: DetectorContext,
  detectorId: string,
  categoryId: CategoryId,
  findings: Finding[],
  minConf: number,
): void {
  const { text } = ctx;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw   = m[1]!;
    const start = m.index;
    const end   = start + raw.length;
    const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);
    if (conf <= minConf) continue;

    findings.push({
      detectorId,
      categoryId,
      severity:       "warning",
      confidence:     conf,
      match:          { value: raw, start, end },
      contextSnippet: buildSnippet(text, start, end),
      locale:         ctx.locale,
    });
  }
}

export const schoolInfoDetector: Detector = {
  id: "school-info",
  categoryId: "myFamily" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    scanRe(SCHOOL_NAME_RE, ctx, this.id, this.categoryId, findings, 0.5);
    scanRe(STUDENT_ID_RE,  ctx, this.id, this.categoryId, findings, 0.65);
    return findings;
  },
};
