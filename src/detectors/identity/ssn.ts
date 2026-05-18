/**
 * US Social Security Number (SSN) detector — GA tier, global region.
 *
 * Matches:
 *   • Formatted:  NNN-GG-SSSS  (high confidence — unambiguous)
 *   • Solid:      NNNGGSSSS    (lower confidence — needs keyword context)
 *
 * Validated by ssnBlacklist (area/group/serial structural rules + known invalids).
 * Constitution §VII — validation beyond regex.
 *
 * Severity: critical — SSN is a primary identity theft vector.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { ssnBlacklist } from "../validators/ssn";
import { contextScorer } from "~/core/context-scorer";

/* ── Regex ───────────────────────────────────────────────────── */

/** Formatted SSN: NNN-GG-SSSS */
const SSN_FORMATTED_RE = /(?<!\d)(\d{3}-\d{2}-\d{4})(?!\d)/g;

/** Solid 9-digit run — only used when SSN keywords nearby */
const SSN_SOLID_RE = /(?<!\d)(\d{9})(?!\d)/g;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "ssn", "social security", "taxpayer", "tin", "itin",
    "identity", "identification number",
  ],
  negativeKeywords: [
    "zip", "postal", "phone", "fax", "order", "invoice",
    "tracking", "routing", "account",
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

export const ssnDetector: Detector = {
  id: "ssn",
  categoryId: "myIdentity" as CategoryId,
  region: "global",
  shipTier: "ga",
  // hintPattern: high-recall, low-cost pre-filter — flags any 9-digit region.
  // The scan() function then validates via blacklist + context scoring.
  hintPattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    /* ── Formatted SSNs (NNN-GG-SSSS) ── */
    SSN_FORMATTED_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SSN_FORMATTED_RE.exec(text)) !== null) {
      const raw = m[1]!;
      if (!ssnBlacklist(raw)) continue;

      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

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

    /* ── Solid 9-digit SSNs — only surface when confidence > threshold ── */
    SSN_SOLID_RE.lastIndex = 0;
    while ((m = SSN_SOLID_RE.exec(text)) !== null) {
      const raw = m[1]!;
      if (!ssnBlacklist(raw)) continue;

      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

      // Without context, solid digit runs create too many false positives
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
