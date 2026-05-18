/**
 * Date of Birth — in-context detector  —  GA tier, global region.
 *
 * Fires on a date pattern ONLY when a DOB/birthday keyword appears within
 * an 80-character window.  Supports 10 languages + CJK/Arabic scripts.
 *
 * Date formats detected
 *   ISO 8601 ........... 1985-03-15
 *   US numeric ......... 03/15/1985
 *   EU numeric (dots) .. 15.03.1985
 *   Long-form DMY ...... 15 March 1985 / 15th March 1985 / 15th of March 1985
 *   Long-form MDY ...... March 15, 1985 / March 15th, 1985
 *
 * Severity: critical — exact DOB enables identity theft and KBA bypass.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";

/* ── Date patterns ──────────────────────────────────────────────── */

// ISO 8601: 1985-03-15
const ISO_DATE_RE =
  /\b(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/g;

// US numeric: 03/15/1985
const US_DATE_RE =
  /\b((?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2})\b/g;

// EU numeric (dots): 15.03.1985
const EU_DOT_DATE_RE =
  /\b((?:0[1-9]|[12]\d|3[01])\.(?:0[1-9]|1[0-2])\.(?:19|20)\d{2})\b/g;

// EU numeric (slashes, day-first): 19/07/1988  — day > 12 disambiguates from US
// We accept day 01-31 and trust the DOB keyword gate to suppress noise.
const EU_SLASH_DATE_RE =
  /\b((?:0[1-9]|[12]\d|3[01])\/(?:0[1-9]|1[0-2])\/(?:19|20)\d{2})\b/g;

const MONTH_ALT =
  "January|February|March|April|May|June|July|August|September|" +
  "October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec";

// Long-form DMY: "15 March 1985", "15th of March 1985"
const LONG_DMY_RE = new RegExp(
  `\\b(\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of)?\\s+(?:${MONTH_ALT})\\.?\\s+(?:19|20)\\d{2})\\b`,
  "gi",
);

// Long-form MDY: "March 15, 1985", "March 15th 1985"
const LONG_MDY_RE = new RegExp(
  `\\b((?:${MONTH_ALT})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2})\\b`,
  "gi",
);

/* ── DOB keyword patterns ──────────────────────────────────────── */

// Build a single RegExp matching any DOB keyword in any supported language.
const DOB_KW_RE = new RegExp(
  [
    // English
    "\\bDOB\\b",
    "\\bd\\.o\\.b\\b",
    "date\\s+of\\s+birth",
    "birth\\s+date",
    "birthdate",
    "\\bborn\\b",
    "\\bbirthday\\b",
    // German
    "Geburtsdatum",
    "geboren\\s+am",
    "Geburtstag",
    // French
    "date\\s+de\\s+naissance",
    "n[eé]e?\\s+le",
    // Greek
    "ημερομηνία\\s+γέννησης",
    "γεννήθηκε",
    // Spanish
    "fecha\\s+de\\s+nacimiento",
    "nacid[ao]\\s+el",
    // Italian
    "data\\s+di\\s+nascita",
    "nat[ao]\\s+il",
    // Dutch
    "geboortedatum",
    "geboren\\s+op",
    // Portuguese
    "data\\s+de\\s+nascimento",
    "nascido\\s+em",
    // Japanese
    "生年月日",
    // Chinese
    "出生日期",
    // Arabic
    "تاريخ\\s+الميلاد",
  ].join("|"),
  "i",
);

/* ── Helpers ────────────────────────────────────────────────────── */

const KW_WINDOW = 80;

/** Returns true if a DOB keyword appears within KW_WINDOW chars of [start,end]. */
function hasKeywordNear(text: string, start: number, end: number): boolean {
  const lo = Math.max(0, start - KW_WINDOW);
  const hi = Math.min(text.length, end + KW_WINDOW);
  return DOB_KW_RE.test(text.slice(lo, hi));
}

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return `${prefix}•••${suffix}`;
}

/* ── Detector ───────────────────────────────────────────────────── */

export const dobDetector: Detector = {
  id: "identity.dob.in-context",
  categoryId: "myIdentity" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    for (const re of [ISO_DATE_RE, US_DATE_RE, EU_DOT_DATE_RE, EU_SLASH_DATE_RE, LONG_DMY_RE, LONG_MDY_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const raw   = m[1]!;
        const start = m.index;
        const end   = start + raw.length;

        if (!hasKeywordNear(text, start, end)) continue;

        findings.push({
          detectorId:     this.id,
          categoryId:     this.categoryId,
          severity:       "critical",
          confidence:     0.9,
          match:          { value: raw, start, end },
          contextSnippet: buildSnippet(text, start, end),
          locale:         ctx.locale,
        });
      }
    }

    // Deduplicate by match start position (keep first found per position)
    const seen = new Set<number>();
    return findings.filter(f => {
      if (seen.has(f.match.start)) return false;
      seen.add(f.match.start);
      return true;
    });
  },
};
