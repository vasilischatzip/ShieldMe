/**
 * Canada bank account detector — GA tier, CA region.
 *
 * Detects Canadian bank account identifiers:
 *   - Transit number: 5 digits (branch identifier)
 *   - Institution number: 3 digits (bank identifier, 001–999)
 *   - Account number: 7–12 digits
 *
 * Severity: critical — enables fraudulent EFT / direct deposits.
 *
 * Note: CA institution numbers are 3 digits; well-known banks:
 *   001 BMO, 002 Scotiabank, 003 RBC, 004 TD, 006 NBC, 010 CIBC, 016 HSBC CA.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Regexes ─────────────────────────────────────────────────── */

/** Transit: 5 digits, labeled */
const TRANSIT_RE =
  /\b(?:transit|branch[\s-]?number|routing)[:\s#]*(\d{5})\b/gi;

/** Institution number: 3 digits, labeled */
const INSTITUTION_RE =
  /\b(?:institution|inst\.?|bank[\s-]?number|bank[\s-]?code)[:\s#]*(\d{3})\b/gi;

/** Account: 7–12 digits, labeled */
const ACCOUNT_RE =
  /\b(?:account|acc(?:ount)?|acct)[\s#:.]*(?:no\.?|number|num\.?)?[\s#:.]*(\d{7,12})\b/gi;

/* ── Known CA institution numbers (representative set) ───────── */

const CA_INSTITUTIONS = new Set([
  "001", "002", "003", "004", "006", "010", "016", "030", "039",
  "260", "309", "314", "338", "340", "342", "807", "815", "828",
  "837", "839", "865", "879", "899",
]);

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "transit", "institution", "bank account", "canadian", "canada",
    "direct deposit", "eft", "cheque", "chequing", "savings",
    "pre-authorized", "wire transfer",
  ],
  negativeKeywords: [
    "tracking", "order number", "reference", "invoice",
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

export const caBankDetector: Detector = {
  id: "ca-bank",
  categoryId: "myMoney" as CategoryId,
  region: "ca",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    // Collect all transit number positions
    const transitMatches: Array<{ start: number; end: number }> = [];
    TRANSIT_RE.lastIndex = 0;
    let tm: RegExpExecArray | null;
    while ((tm = TRANSIT_RE.exec(text)) !== null) {
      transitMatches.push({ start: tm.index, end: tm.index + tm[0].length });
    }

    // Collect institution number positions (with validation)
    const instMatches: Array<{ start: number; end: number }> = [];
    INSTITUTION_RE.lastIndex = 0;
    let im: RegExpExecArray | null;
    while ((im = INSTITUTION_RE.exec(text)) !== null) {
      const inst = im[1]!;
      if (CA_INSTITUTIONS.has(inst)) {
        instMatches.push({ start: im.index, end: im.index + im[0].length });
      }
    }

    // Need at least a transit OR institution label to fire
    const anchors = [...transitMatches, ...instMatches];
    if (anchors.length === 0) return [];

    // Find account numbers near any anchor
    ACCOUNT_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = ACCOUNT_RE.exec(text)) !== null) {
      const acctStart = am.index;
      const acctEnd   = acctStart + am[0].length;

      const nearby = anchors.find(
        (a) => Math.abs(a.start - acctStart) <= 300,
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
        locale:         "en-CA",
      });
    }

    return findings;
  },
};
