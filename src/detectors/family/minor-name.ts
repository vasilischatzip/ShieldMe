/**
 * Minor's name detector — GA tier, global region.
 * Default OFF (myFamily category).
 *
 * Detects patterns that associate a child's name with their age, school grade,
 * or explicit "son/daughter/child" relationship. Requires strong context.
 *
 * Pattern: name + age/grade/child-relation keyword within 50 chars.
 *
 * Severity: critical — linking a child's name with age enables targeting.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/**
 * Matches "Name, age N" or "My son/daughter Name age N" style patterns.
 * Name: 1–3 Title Case words, optionally followed by comma.
 */
const MINOR_RE =
  /\b([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2})\b[,\s]+(?:age\s+\d{1,2}|grade\s+\d{1,2}|\d{1,2}\s+years?\s+old|(?:my\s+)?(?:son|daughter|child|kid))/g;

const SCORER_CFG = {
  positiveKeywords: [
    "son", "daughter", "child", "kid", "minor", "student",
    "age", "grade", "school", "years old", "born",
  ],
  negativeKeywords: [
    "company", "organization", "director", "manager", "ceo", "president",
    "adult", "senior", "executive",
  ],
  window: 60,
} as const;

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

export const minorNameDetector: Detector = {
  id: "minor-name",
  categoryId: "myFamily" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    MINOR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MINOR_RE.exec(text)) !== null) {
      const name  = m[1]!.trim();
      const raw   = m[0]!;
      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "critical",
        confidence:     conf,
        match:          { value: name, start, end: start + name.length },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
