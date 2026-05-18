/**
 * International phone number detector — GA tier, global region.
 *
 * Detects phone numbers in two formats:
 *
 *   1. E.164-style international: +[country code][rest]
 *      e.g. +44 7911 123456, +1-800-555-0100, +49 30 12345678
 *
 *   2. NANP (North American Numbering Plan): (NXX) NXX-XXXX
 *      e.g. (212) 555-0100, 415-867-5309
 *
 * When both patterns match overlapping regions (e.g. +1 (555) 867-5309),
 * the longer (international) match is kept via span deduplication.
 *
 * Severity: warning — phone numbers are PII but lower risk than financial
 *   or government identifiers.
 * Confidence: 0.85 — some number sequences may be false positives in
 *   heavily numeric documents.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";

/* ── Patterns ────────────────────────────────────────────────────── */

/**
 * E.164-style: + then 1-3 digit country code, then 4-20 chars of
 * digits and phone separators (spaces, hyphens, dots, parentheses).
 *
 * After matching, the digit count is validated (≥ 7) to discard
 * short / clearly non-phone matches (e.g. "+1 ext").
 */
const INTL_RE = /\+\d{1,3}[\s\-.()\d]{4,20}/g;

/**
 * NANP: (NXX) NXX-XXXX or NXX-NXX-XXXX with exactly 10 digits
 * and standard separators. The pattern is specific enough to not
 * require a digit-count post-check.
 */
const NANP_RE = /\b\(?\d{3}\)?[\s\-.]\d{3}[\s\-.]\d{4}\b/g;

/* ── Helpers ─────────────────────────────────────────────────────── */

function digitCount(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) count++;
  }
  return count;
}

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

type Span = { start: number; end: number; value: string };

function collectMatches(re: RegExp, text: string, minDigits: number): Span[] {
  const spans: Span[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw   = m[0]!.trimEnd(); // drop any trailing whitespace consumed
    const start = m.index;
    const end   = start + raw.length;
    if (digitCount(raw) < minDigits) continue;
    spans.push({ start, end, value: raw });
  }
  return spans;
}

/**
 * Merge overlapping spans, keeping the longest match on overlap.
 * Assumes the earlier (longer) match wins when starts are equal.
 */
function mergeSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return [];
  // Sort by start asc; ties broken by length desc (longer first)
  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out: Span[] = [spans[0]!];
  for (let i = 1; i < spans.length; i++) {
    const last = out[out.length - 1]!;
    const cur  = spans[i]!;
    if (cur.start < last.end) {
      // Overlapping: extend if cur reaches further
      if (cur.end > last.end) out[out.length - 1] = cur;
    } else {
      out.push(cur);
    }
  }
  return out;
}

/* ── Detector ────────────────────────────────────────────────────── */

export const phoneIntlDetector: Detector = {
  id: "phone-intl",
  categoryId: "myDigitalLife" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;

    const intlSpans  = collectMatches(INTL_RE, text, 7);
    const nanpSpans  = collectMatches(NANP_RE, text, 10);
    const merged     = mergeSpans([...intlSpans, ...nanpSpans]);

    return merged.map(({ start, end, value }) => ({
      detectorId:     this.id,
      categoryId:     this.categoryId,
      severity:       "warning",
      confidence:     0.85,
      match:          { value, start, end },
      contextSnippet: buildSnippet(text, start, end),
      locale:         ctx.locale,
    }));
  },
};
