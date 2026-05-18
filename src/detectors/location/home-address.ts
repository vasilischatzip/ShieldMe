/**
 * Home / residential address detector — GA tier, global region.
 * Default OFF (myLocation category).
 *
 * Detects residential address patterns without requiring the family
 * keyword gate that the family-address detector uses.
 * More permissive than family-address — surfaces any home address pattern.
 *
 * Severity: critical — precise home address is a stalking enabler.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

const US_ADDRESS_RE =
  /\b(\d{1,6}\s+[A-Z][a-zA-Z\s]{2,30}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Circle|Cir)\.?(?:\s+(?:Apt|Apt\.|Suite|Ste|Unit|#)\s*[A-Z0-9]{1,5})?)\b/g;

const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/g;

const SCORER_CFG = {
  positiveKeywords: [
    "home address", "lives at", "residence", "residential", "address",
    "mailing address", "street address", "my house", "apartment",
  ],
  negativeKeywords: [
    "office", "business", "company", "headquarters", "shipping",
    "billing", "po box", "warehouse",
  ],
  window: 80,
} as const;

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

export const homeAddressDetector: Detector = {
  id: "home-address",
  categoryId: "myLocation" as CategoryId,
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
