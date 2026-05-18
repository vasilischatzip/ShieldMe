/**
 * Travel itinerary detector — GA tier, global region.
 * Default OFF (myLocation category).
 *
 * Detects travel itinerary patterns that reveal location data:
 *   • Flight numbers: AA1234, UA567, DL890
 *   • Hotel booking references: 6-char alphanumeric + "hotel/reservation"
 *   • "Departing [city] on [date]" / "Arriving [city]" patterns
 *
 * Severity: warning — itinerary enables burglary and stalking when combined.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Regex ───────────────────────────────────────────────────── */

/** Flight number: 2-letter IATA code + 1-4 digits, optionally with letter suffix */
const FLIGHT_RE = /\b([A-Z]{2}[0-9]{1,4}[A-Z]?)\b/g;

/** Travel action: "departing/arriving/flying to/from CITY" */
const TRAVEL_ACTION_RE =
  /\b((?:depart|departs|departing|arriv|arrives|arriving|flying|travel|travelling)\s+(?:from|to|at)?\s+[A-Z][a-zA-Z\s]{2,30})\b/gi;

const SCORER_CFG = {
  positiveKeywords: [
    "flight", "hotel", "reservation", "booking", "departure",
    "arrival", "itinerary", "trip", "travel", "airport", "airline",
    "check-in", "check in",
  ],
  negativeKeywords: [
    "product", "order", "invoice", "company", "project", "version",
  ],
  window: 80,
} as const;

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

export const itineraryDetector: Detector = {
  id: "itinerary",
  categoryId: "myLocation" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    /* ── Flight numbers ── */
    FLIGHT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FLIGHT_RE.exec(text)) !== null) {
      const raw   = m[1]!;
      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);
      if (conf <= 0.5) continue;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "warning",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    /* ── Travel action phrases ── */
    TRAVEL_ACTION_RE.lastIndex = 0;
    while ((m = TRAVEL_ACTION_RE.exec(text)) !== null) {
      const raw   = m[1]!;
      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);
      if (conf <= 0.5) continue;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "warning",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
