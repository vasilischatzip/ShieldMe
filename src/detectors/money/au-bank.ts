/**
 * Australia bank account detector — GA tier, AU region.
 *
 * Detects Australian BSB + account number pairs:
 *   - BSB (Bank State Branch): 6 digits in NNN-NNN format
 *   - Account number: 6–10 digits
 *
 * Both must appear within a 300-char window.
 * Severity: critical — enables fraudulent bank transfers.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Regexes ─────────────────────────────────────────────────── */

/** BSB: NNN-NNN (preferred) or NNNNNN, often labeled */
const BSB_RE =
  /\b(?:bsb|branch[\s-]?code|bank[\s-]?state[\s-]?branch)[:\s#]*(\d{3}[-\s]?\d{3})\b/gi;

/** Account number: 6–10 digits, labeled */
const ACCOUNT_RE =
  /\b(?:account|acc(?:ount)?|acct)[\s#:.]*(?:no\.?|number|num\.?)?[\s#:.]*(\d{6,10})\b/gi;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "bsb", "account number", "bank account", "au bank", "australian",
    "direct debit", "eft", "osko", "payid", "transfer",
  ],
  negativeKeywords: [
    "tracking", "order", "reference", "postcode", "phone",
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

export const auBankDetector: Detector = {
  id: "au-bank",
  categoryId: "myMoney" as CategoryId,
  region: "au",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    // Collect all BSB positions
    const bsbMatches: Array<{ start: number; end: number }> = [];
    BSB_RE.lastIndex = 0;
    let bm: RegExpExecArray | null;
    while ((bm = BSB_RE.exec(text)) !== null) {
      const raw = bm[1]!.replace(/[-\s]/g, "");
      if (raw.length !== 6) continue;
      bsbMatches.push({ start: bm.index, end: bm.index + bm[0].length });
    }

    if (bsbMatches.length === 0) return [];

    // Find account numbers near BSBs
    ACCOUNT_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = ACCOUNT_RE.exec(text)) !== null) {
      const acctStart = am.index;
      const acctEnd   = acctStart + am[0].length;

      const nearby = bsbMatches.find(
        (b) => Math.abs(b.start - acctStart) <= 300,
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
        locale:         "en-AU",
      });
    }

    return findings;
  },
};
