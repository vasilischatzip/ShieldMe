/**
 * SWIFT / BIC code detector — GA tier, global region.
 *
 * Detects SWIFT/BIC codes in the format:
 *   AAAABBCCXXX (11 chars) or AAAABBCC (8 chars):
 *   - AAAA: bank code (4 alpha)
 *   - BB:   country code (2 alpha, ISO-3166-1)
 *   - CC:   location code (2 alphanumeric)
 *   - XXX:  branch code (3 alphanumeric, optional — XXX = primary office)
 *
 * Severity: critical — appears in international wire instructions.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Regex ───────────────────────────────────────────────────── */

/**
 * SWIFT/BIC: 4 alpha + 2 alpha + 2 alphanum + optional 3 alphanum.
 * The word boundary prevents matching inside longer alphanumeric tokens.
 */
const SWIFT_RE =
  /\b([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/g;

/**
 * Known ISO-3166-1 alpha-2 country codes embedded in position 5–6.
 * We only validate a representative set; full ISO-3166-1 has 249 entries.
 * This avoids the need to ship the full table.
 */
const COUNTRY_CODES = new Set([
  "US", "GB", "DE", "FR", "IT", "ES", "PT", "GR", "NL", "AU", "CA", "JP",
  "AT", "BE", "BG", "CH", "CY", "CZ", "DK", "EE", "FI", "HR", "HU", "IE",
  "IS", "LI", "LT", "LU", "LV", "MT", "NO", "PL", "RO", "SE", "SI", "SK",
  "AR", "BR", "CL", "CN", "EG", "HK", "IL", "IN", "KR", "MX", "MY", "NG",
  "NZ", "PH", "QA", "RU", "SA", "SG", "TH", "TR", "TW", "AE", "UA", "ZA",
  "MK", "RS", "XK", "LB", "JO", "KW", "BH", "OM", "PK", "BD", "LK", "MM",
]);

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "swift", "bic", "bank identifier code", "wire", "transfer",
    "international", "iban", "correspondent", "beneficiary bank",
    "routing", "remittance",
  ],
  negativeKeywords: [
    "tracking", "order", "reference", "invoice number", "product code",
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

export const swiftDetector: Detector = {
  id: "swift",
  categoryId: "myMoney" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    let m: RegExpExecArray | null;

    SWIFT_RE.lastIndex = 0;

    while ((m = SWIFT_RE.exec(text)) !== null) {
      const raw = m[1]!;
      if (raw.length !== 8 && raw.length !== 11) continue;

      // Validate country code at positions 4–5 (0-indexed)
      const countryCode = raw.slice(4, 6);
      if (!COUNTRY_CODES.has(countryCode)) continue;

      // "XXX" is a common placeholder — skip standalone XXX branch
      if (raw.endsWith("XXX") && raw.length === 11) {
        // Still valid — primary office code; keep it
      }

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
