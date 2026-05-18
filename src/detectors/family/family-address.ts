/**
 * Family home address detector — GA tier, global region.
 * Default OFF (myFamily category).
 *
 * Detects residential addresses that appear in family context.
 * Matches US/UK/EU address patterns near family relationship keywords.
 *
 * Severity: critical — home address + family member names enables stalking.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/**
 * US street address: number + street name + street type
 * e.g. "123 Main Street", "45 Oak Ave"
 */
const US_ADDRESS_RE =
  /\b(\d{1,6}\s+[A-Z][a-zA-Z\s]{2,30}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Circle|Cir|Trail|Tr)\.?)\b/g;

/**
 * UK postcode: letter(s) + digit(s) + space + digit + 2 letters
 * e.g. "SW1A 2AA", "EC1A 1BB"
 */
const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/g;

const SCORER_CFG = {
  positiveKeywords: [
    "home", "address", "lives at", "residence", "family", "house",
    "my address", "children", "kids", "neighborhood",
  ],
  negativeKeywords: [
    "office", "business", "company", "corporate", "headquarters",
    "shipping", "billing", "warehouse",
  ],
  window: 80,
} as const;

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

export const familyAddressDetector: Detector = {
  id: "family-address",
  categoryId: "myFamily" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    for (const re of [US_ADDRESS_RE, UK_POSTCODE_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const raw   = m[1]!;
        const start = m.index;
        const end   = start + raw.length;
        const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

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
    }

    return findings;
  },
};
