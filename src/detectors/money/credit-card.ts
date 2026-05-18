/**
 * Credit-card PAN detector — GA tier, global region.
 *
 * Detects payment card numbers (PAN) using:
 *   1. Regex covering standard 4×4 formats, Amex 4-6-5, and solid 13-19 digit runs.
 *   2. Luhn checksum validation (Constitution §VII — validation beyond regex).
 *   3. ContextScorer to adjust confidence based on surrounding keywords.
 *
 * Severity: critical  — a leaked PAN enables fraud.
 * Confidence: 0.5 (no context) → 1.0 (strong positive keywords nearby).
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { luhn } from "../validators/luhn";
import { contextScorer } from "~/core/context-scorer";

/* ── Regex ───────────────────────────────────────────────────── */

/**
 * Matches two common card formats (separators stripped before Luhn):
 *   1. Standard (4×4):  NNNN[ -]?NNNN[ -]?NNNN[ -]?N{1..7}  → 13–19 digits
 *   2. Amex (4-6-5):    NNNN[ -]?NNNNNN[ -]?NNNNN           → 15 digits
 *
 * Look-behind/ahead prevent matching inside longer digit sequences.
 */
const PAN_RE = /(?<!\d)(\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,7}|\d{4}[ -]?\d{6}[ -]?\d{5})(?!\d)/g;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "credit card", "card number", "debit card", "payment card",
    "pan", "visa", "mastercard", "maestro", "amex", "discover",
  ],
  negativeKeywords: [
    "loyalty", "membership", "tracking", "order number", "barcode",
    "reference", "invoice", "confirm", "transaction id",
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

export const creditCardDetector: Detector = {
  id: "credit-card",
  categoryId: "myMoney" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    let m: RegExpExecArray | null;

    // Reset lastIndex before each scan (regex is stateful)
    PAN_RE.lastIndex = 0;

    while ((m = PAN_RE.exec(text)) !== null) {
      const raw     = m[0]!;
      const digits  = raw.replace(/[ -]/g, "");

      // Structural gate: 13–19 digit count after stripping separators
      if (digits.length < 13 || digits.length > 19) continue;

      // Luhn gate — Constitution §VII
      if (!luhn(digits)) continue;

      // First digit must be a known BIN prefix (3, 4, 5, 6)
      // Filters out many non-card numeric sequences
      const first = digits[0];
      if (first !== "3" && first !== "4" && first !== "5" && first !== "6") continue;

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
