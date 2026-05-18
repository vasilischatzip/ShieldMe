/**
 * Finance keywords detector — GA tier, global region.
 *
 * Detects sensitive financial disclosures when financial keywords appear
 * adjacent to monetary values. Examples:
 *   "My annual salary is $85,000"
 *   "Net worth: €420,000"
 *   "Loan amount: £150,000 at 3.5%"
 *
 * This is a ShieldMe-original composite detector (not in any SIT set).
 * Severity: warning (personal financial disclosure, not a credential).
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Regex ───────────────────────────────────────────────────── */

/**
 * Monetary value: currency symbol or code + digits (with optional k/K/M suffix).
 * E.g. $85,000 · €1.2M · £150k · USD 42000 · 85000 EUR
 */
const MONEY_RE =
  /(?:[$€£¥₹₽¢]|(?:\b(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|INR|CNY|HKD|SGD|MXN|BRL|KRW|TRY|AED|SAR|ZAR|PLN|SEK|NOK|DKK|CZK|HUF|RON|BGN|HRK|RUB|UAH|NZD)\b))[\s]?[\d,]+(?:[.,]\d+)*(?:\s?[kKmMbB])?\b|\b\d[\d,]*(?:[.,]\d+)*(?:\s?[kKmMbB])?[\s]?(?:[$€£¥₹]|(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|INR|CNY|HKD|SGD|MXN|BRL)\b)/g;

/**
 * Financial disclosure keywords that trigger an elevated finding
 * when found within 80 chars of a monetary value.
 */
const KEYWORD_RE =
  /\b(?:salary|annual[\s-]?salary|gross[\s-]?salary|net[\s-]?salary|income|annual[\s-]?income|net[\s-]?income|gross[\s-]?income|take[\s-]?home|net[\s-]?worth|total[\s-]?assets|total[\s-]?wealth|loan[\s-]?amount|mortgage[\s-]?amount|credit[\s-]?limit|credit[\s-]?line|overdraft|balance|bank[\s-]?balance|account[\s-]?balance|savings|investment[\s-]?value|portfolio[\s-]?value|dividend|bonus|pension|retirement[\s-]?fund|compensation|severance)\b/gi;

const WINDOW = 80; // chars each side of the keyword

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "salary", "income", "net worth", "loan", "mortgage", "balance",
    "per annum", "annual", "monthly", "payslip", "statement",
  ],
  negativeKeywords: [
    "example", "average", "median", "hypothetical", "placeholder",
    "approximately", "about",
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

export const financeKeywordsDetector: Detector = {
  id: "finance-keywords",
  categoryId: "myMoney" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    // Collect monetary value positions
    const moneySpans: Array<{ start: number; end: number }> = [];
    MONEY_RE.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = MONEY_RE.exec(text)) !== null) {
      moneySpans.push({ start: mm.index, end: mm.index + mm[0].length });
    }

    if (moneySpans.length === 0) return [];

    // For each keyword, see if a monetary value is nearby
    KEYWORD_RE.lastIndex = 0;
    let km: RegExpExecArray | null;

    // Track deduplication: only one finding per 200-char window
    const emittedAt: number[] = [];

    while ((km = KEYWORD_RE.exec(text)) !== null) {
      const kwStart = km.index;
      const kwEnd   = kwStart + km[0].length;

      const nearby = moneySpans.find(
        (s) => Math.abs(s.start - kwStart) <= WINDOW,
      );
      if (!nearby) continue;

      const start = Math.min(kwStart, nearby.start);
      const end   = Math.max(kwEnd, nearby.end);

      // Deduplicate findings within 200-char window
      if (emittedAt.some((pos) => Math.abs(pos - start) < 200)) continue;
      emittedAt.push(start);

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "warning",
        confidence:     contextScorer.score(ctx, { start, end }, SCORER_CFG),
        match:          { value: km[0], start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
