/**
 * US Bank Account detector — GA tier, global region.
 *
 * Detects US bank routing + account number pairs appearing in close proximity.
 * Both must appear within a 300-char window for a finding to be raised.
 *
 * Routing number validation: ABA mod-10 checksum.
 * Account number: structural check only (5–17 digits).
 *
 * Severity: critical — enables ACH fraud / unauthorised wire transfers.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { abaRouting } from "../validators/aba-routing";
import { contextScorer } from "~/core/context-scorer";

/* ── Regex ───────────────────────────────────────────────────── */

/** Matches an ABA routing number hint: label + 9 digits */
const ROUTING_RE =
  /\b(?:routing|aba|rtn)[\s#:]*([0-9]{9})\b/gi;

/** Matches a bank account number hint: label + 5-17 digits */
const ACCOUNT_RE =
  /\b(?:account|acct|acc)[\s#:]*([0-9]{5,17})\b/gi;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "routing", "bank account", "checking", "savings", "wire transfer",
    "ach", "direct deposit", "aba",
  ],
  negativeKeywords: [
    "loyalty", "tracking", "order", "reference", "invoice",
  ],
  window: 100,
} as const;

/* ── Snippet builder ─────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

/* ── Detector ────────────────────────────────────────────────── */

export const usBankDetector: Detector = {
  id: "us-bank",
  categoryId: "myMoney" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    // Collect all routing number positions
    const routingMatches: Array<{ digits: string; start: number; end: number }> = [];
    ROUTING_RE.lastIndex = 0;
    let rm: RegExpExecArray | null;
    while ((rm = ROUTING_RE.exec(text)) !== null) {
      const digits = rm[1]!;
      if (!abaRouting(digits)) continue;
      routingMatches.push({
        digits,
        start: rm.index,
        end: rm.index + rm[0].length,
      });
    }

    if (routingMatches.length === 0) return [];

    // For each routing match, look for a nearby account number
    ACCOUNT_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = ACCOUNT_RE.exec(text)) !== null) {
      const acctStart = am.index;
      const acctEnd   = acctStart + am[0].length;
      const acctDigits = am[1]!;

      // Find closest routing number within 300 chars
      const nearby = routingMatches.find(
        (r) => Math.abs(r.start - acctStart) <= 300,
      );
      if (!nearby) continue;

      // Combined span: min start to max end
      const start = Math.min(nearby.start, acctStart);
      const end   = Math.max(nearby.end, acctEnd);

      // Value shown in match is the account digits (routing already validated)
      const value = acctDigits;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "critical",
        confidence:     contextScorer.score(ctx, { start, end }, SCORER_CFG),
        match:          { value, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
