/**
 * IBAN detector — GA tier, global region.
 *
 * Detects International Bank Account Numbers using:
 *   1. Regex matching the ISO 13616 format (2-letter country code + check digits + BBAN).
 *   2. IBAN mod-97 checksum validation (Constitution §VII).
 *   3. ContextScorer for confidence adjustment.
 *
 * IBANs from all countries are matched; the mod-97 validator filters noise.
 *
 * Severity: critical — bank account number enables fraud / unauthorised transfer.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { ibanMod97 } from "../validators/iban";
import { contextScorer } from "~/core/context-scorer";

/* ── Regex ───────────────────────────────────────────────────── */

/**
 * Matches IBAN candidates:
 *   - 2 uppercase letters (country code)
 *   - 2 digits (check digits)
 *   - 11–30 alphanumeric chars (BBAN)
 * Total: 15–34 chars. Spaces stripped before mod-97.
 *
 * Also captures space-grouped IBANs like "GB82 WEST 1234 5698 7654 32".
 */
const IBAN_RE = /\b([A-Z]{2}[0-9]{2}(?:[ ]?[A-Z0-9]{1,4}){2,8})\b/g;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "iban", "bank account", "international bank", "bic", "swift",
    "sort code", "account number", "beneficiary", "transfer",
  ],
  negativeKeywords: [
    "po box", "zip", "postcode", "tracking", "order", "reference number",
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

export const ibanDetector: Detector = {
  id: "iban",
  categoryId: "myMoney" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    let m: RegExpExecArray | null;

    IBAN_RE.lastIndex = 0;

    while ((m = IBAN_RE.exec(text)) !== null) {
      const raw = m[0]!;

      // Mod-97 validation — Constitution §VII
      if (!ibanMod97(raw)) continue;

      const start = m.index;
      const end   = start + raw.length;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "critical",
        confidence:     contextScorer.score(ctx, { start, end }, SCORER_CFG),
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
