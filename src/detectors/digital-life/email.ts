/**
 * Email address detector — GA tier, global region.
 *
 * Detects RFC 5321-compatible email addresses in document text.
 * Addresses found in documents, emails, or shared files are PII
 * regardless of whether they are "personal" or "corporate".
 *
 * Pattern: local-part@domain.tld
 *   local-part: letters, digits, dots, underscores, percent, plus, hyphen
 *   domain:     letters, digits, dots, hyphens
 *   tld:        2+ letters
 *
 * Severity: warning — email addresses are PII but lower risk than
 *   financial or government identifiers.
 * Confidence: 0.95 — the format is highly specific; false positives are rare.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";

/* ── Regex ───────────────────────────────────────────────────────── */

/**
 * Matches a standard email address.
 * Word-boundary anchors prevent partial matches inside larger tokens.
 *
 * Not anchored to start/end so it finds addresses embedded in prose.
 */
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;

/* ── Snippet builder ─────────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

/* ── Detector ────────────────────────────────────────────────────── */

export const emailDetector: Detector = {
  id: "email",
  categoryId: "myDigitalLife" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    EMAIL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EMAIL_RE.exec(text)) !== null) {
      const raw   = m[0]!;
      const start = m.index;
      const end   = start + raw.length;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "warning",
        confidence:     0.95,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
