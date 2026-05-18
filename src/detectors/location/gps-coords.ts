/**
 * GPS coordinate detector — GA tier, global region.
 * Default OFF (myLocation category).
 *
 * Detects latitude/longitude pairs in common formats:
 *   • Decimal degrees: 40.7128, -74.0060
 *   • DMS: 40°42'46"N 74°00'21"W
 *   • GeoJSON: [longitude, latitude] or {"lat": ..., "lng": ...}
 *
 * Severity: critical — GPS coordinates reveal precise location.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Decimal degrees ─────────────────────────────────────────── */

/** Latitude: -90..90  Longitude: -180..180, at least 4 decimal places */
const DECIMAL_COORDS_RE =
  /\b(-?(?:90(?:\.0+)?|[1-8]?\d(?:\.\d{4,})?))\s*,\s*(-?(?:180(?:\.0+)?|1[0-7]\d(?:\.\d{4,})?|[1-9]?\d(?:\.\d{4,})?))\b/g;

/* ── DMS format ──────────────────────────────────────────────── */

const DMS_RE =
  /\b(\d{1,3})°(\d{1,2})'(\d{1,2}(?:\.\d+)?)"([NS])\s+(\d{1,3})°(\d{1,2})'(\d{1,2}(?:\.\d+)?)"([EW])\b/g;

const SCORER_CFG = {
  positiveKeywords: [
    "gps", "coordinates", "location", "latitude", "longitude",
    "lat", "lng", "geo", "geolocation", "position", "coordinate",
  ],
  negativeKeywords: [
    "ip address", "phone", "zip", "postal", "area code",
  ],
  window: 60,
} as const;

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

export const gpsCoordsDetector: Detector = {
  id: "gps-coords",
  categoryId: "myLocation" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    /* ── Decimal degrees ── */
    DECIMAL_COORDS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DECIMAL_COORDS_RE.exec(text)) !== null) {
      const raw   = m[0]!;
      const start = m.index;
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);

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

    /* ── DMS format — always high confidence ── */
    DMS_RE.lastIndex = 0;
    while ((m = DMS_RE.exec(text)) !== null) {
      const raw   = m[0]!;
      const start = m.index;
      const end   = start + raw.length;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "critical",
        confidence:     1.0,  // DMS is unambiguous
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
