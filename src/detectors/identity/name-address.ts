/**
 * Name + Address combo detector  —  GA tier, global region.
 *
 * Fires when a person name (honorific-prefixed or bare two-word name) appears
 * within 500 characters of a street address / postcode.  Neither name nor
 * address alone triggers a finding — the proximity pairing is what matters.
 *
 * Name tiers:
 *   • Honorific prefix (Mr / Mrs / Dr / Prof etc.)  → confidence 0.95
 *   • Bare two-word capitalized name                → confidence 0.75
 *   • Three-word with middle initial or middle name  → confidence 0.85
 *
 * Address patterns:
 *   • US street address  (e.g. "123 Oak Street", "456 Elm Ave Apt 2B")
 *   • UK postcode        (e.g. "SW1A 1AA", "M1 1AE")
 *   • DE/EU postal code + city (e.g. "10115 Berlin")
 *
 * Severity: critical — full name + address is a stalking / fraud enabler.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";

/* ── Name patterns ──────────────────────────────────────────────── */

// Honorific + one or two surname tokens
const HONORIFIC_RE =
  /\b((?:Mr\.?|Mrs\.?|Ms\.?|Miss\.?|Dr\.?|Prof\.?|Rev\.?|Sir|Lord|Lady|Mx\.?)\s+[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2})\b/g;

// Three-word name: First + Middle/Initial + Last
const THREE_WORD_RE =
  /\b([A-Z][a-z]{1,20}\s+[A-Z]\.?\s+[A-Z][a-z]{1,20})\b/g;

// Bare two-word name: First + Last
const TWO_WORD_RE =
  /\b([A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20})\b/g;

/* ── Address patterns ───────────────────────────────────────────── */

const US_STREET_RE =
  /\b(\d{1,6}\s+[A-Z][a-zA-Z\s]{2,30}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Circle|Cir)\.?(?:\s+(?:Apt|Apt\.|Suite|Ste|Unit|#)\s*[A-Z0-9]{1,5})?)\b/g;

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/g;

// DE / EU: 5-digit postal code followed by city name
const EU_POSTAL_RE =
  /\b(\d{4,5}\s+[A-ZÜÄÖ][a-zäöüß\s]{2,24})\b/g;

/* ── Noise words — two-cap-word pairs that are NOT person names ─── */

const NAME_NOISE = new Set<string>([
  // Geography
  "New York", "New Jersey", "New Mexico", "New Hampshire", "New Zealand",
  "Los Angeles", "San Francisco", "San Diego", "San Jose", "San Antonio",
  "Las Vegas", "El Paso", "Puerto Rico", "Costa Rica",
  "North America", "South America", "North Carolina", "South Carolina",
  "West Virginia", "North Sea", "West End", "East End",
  "United States", "United Kingdom", "South Africa",
  "Pacific Ocean", "Atlantic Ocean", "Indian Ocean",
  // Months / days (title-cased phrase runs)
  "January February", "February March", "March April", "April May",
  "May June", "June July", "July August", "August September",
  "September October", "October November", "November December",
  "Monday Tuesday", "Tuesday Wednesday", "Wednesday Thursday",
  "Thursday Friday", "Friday Saturday", "Saturday Sunday",
  // Ordinals
  "First Second", "Second Third", "Third Fourth", "Fourth Fifth",
]);

/* ── Helpers ────────────────────────────────────────────────────── */

const COMBO_WINDOW = 500;

interface Span { start: number; end: number }

/** Gap in characters between two non-overlapping spans; 0 if they overlap. */
function gap(a: Span, b: Span): number {
  return Math.max(0, Math.max(a.start, b.start) - Math.min(a.end, b.end));
}

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return `${prefix}•••${suffix}`;
}

/** Collect all address spans from text. */
function findAddresses(text: string): Span[] {
  const spans: Span[] = [];
  for (const re of [US_STREET_RE, UK_POSTCODE_RE, EU_POSTAL_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      spans.push({ start: m.index, end: m.index + m[1]!.length });
    }
  }
  return spans;
}

/* ── Detector ───────────────────────────────────────────────────── */

export const nameAddressDetector: Detector = {
  id: "identity.name-address.combo",
  categoryId: "myIdentity" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    const addresses = findAddresses(text);
    if (addresses.length === 0) return [];

    const seenStarts = new Set<number>();

    function tryEmit(raw: string, ns: number, ne: number, conf: number): void {
      if (NAME_NOISE.has(raw)) return;
      if (seenStarts.has(ns)) return;

      const nameSpan: Span = { start: ns, end: ne };
      for (const addr of addresses) {
        // Skip if the name span overlaps with this address span (name IS part of the address)
        const overlaps = ns < addr.end && ne > addr.start;
        if (!overlaps && gap(nameSpan, addr) <= COMBO_WINDOW) {
          seenStarts.add(ns);
          findings.push({
            detectorId:     "identity.name-address.combo",
            categoryId:     "myIdentity" as CategoryId,
            severity:       "critical",
            confidence:     conf,
            match:          { value: raw, start: ns, end: ne },
            contextSnippet: buildSnippet(text, ns, ne),
            locale:         ctx.locale,
          });
          return; // one finding per name span
        }
      }
    }

    // Tier 1 — honorific prefix (highest confidence)
    HONORIFIC_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HONORIFIC_RE.exec(text)) !== null) {
      tryEmit(m[1]!, m.index, m.index + m[1]!.length, 0.95);
    }

    // Tier 2 — three-word name with middle initial / name
    THREE_WORD_RE.lastIndex = 0;
    while ((m = THREE_WORD_RE.exec(text)) !== null) {
      tryEmit(m[1]!, m.index, m.index + m[1]!.length, 0.85);
    }

    // Tier 3 — bare two-word capitalized name (lower confidence)
    TWO_WORD_RE.lastIndex = 0;
    while ((m = TWO_WORD_RE.exec(text)) !== null) {
      tryEmit(m[1]!, m.index, m.index + m[1]!.length, 0.75);
    }

    return findings;
  },
};
