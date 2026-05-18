/**
 * UK bank account detector — GA tier, UK region.
 *
 * Detects UK sort code + account number pairs:
 *   - Sort code: 6 digits in NN-NN-NN or NNNNNN format
 *   - Account:   8 digits
 *
 * Both components must appear within a 300-char window.
 * Severity: critical — enables fraudulent bank transfers.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Regexes ─────────────────────────────────────────────────── */

/** Sort code: NN-NN-NN or NN NN NN or NNNNNN, often prefixed by label */
const SORT_CODE_RE =
  /\b(?:sort[\s-]?code|sortcode|sc)[:\s#]*(\d{2}[-\s]?\d{2}[-\s]?\d{2})\b/gi;

/** Account number: 8 digits, often prefixed by "account" or "acc" label */
const ACCOUNT_RE =
  /\b(?:account|acc(?:ount)?|acct)[\s#:.]*(?:no\.?|number|num\.?)?[\s#:.]*(\d{8})\b/gi;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "sort code", "account number", "bank account", "uk bank",
    "direct debit", "bacs", "chaps", "faster payment", "standing order",
    "current account", "savings",
  ],
  negativeKeywords: [
    "tracking", "order number", "reference", "invoice", "postcode",
  ],
  window: 120,
} as const;

/* ── Snippet builder ─────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

/* ── Detector ────────────────────────────────────────────────── */

export const ukBankDetector: Detector = {
  id: "uk-bank",
  categoryId: "myMoney" as CategoryId,
  region: "gb",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    // Collect all sort code positions
    const sortMatches: Array<{ digits: string; start: number; end: number }> = [];
    SORT_CODE_RE.lastIndex = 0;
    let sm: RegExpExecArray | null;
    while ((sm = SORT_CODE_RE.exec(text)) !== null) {
      const raw = sm[1]!;
      const digits = raw.replace(/[-\s]/g, "");
      if (digits.length !== 6) continue;
      sortMatches.push({ digits, start: sm.index, end: sm.index + sm[0].length });
    }

    if (sortMatches.length === 0) return [];

    // For each account number, look for a nearby sort code
    ACCOUNT_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = ACCOUNT_RE.exec(text)) !== null) {
      const acctStart = am.index;
      const acctEnd   = acctStart + am[0].length;

      const nearby = sortMatches.find(
        (s) => Math.abs(s.start - acctStart) <= 300,
      );
      if (!nearby) continue;

      const start = Math.min(nearby.start, acctStart);
      const end   = Math.max(nearby.end, acctEnd);

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "critical",
        confidence:     contextScorer.score(ctx, { start, end }, SCORER_CFG),
        match:          { value: am[1]!, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         "en-GB",
      });
    }

    return findings;
  },
};
