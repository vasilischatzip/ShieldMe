/**
 * Password-in-plaintext detector — GA tier, global region.
 *
 * Detects patterns where a password value appears in clear text, typically:
 *   • password = "secretValue"
 *   • password: secretValue
 *   • passwd=MyP@ssw0rd
 *   • "password": "value"  (JSON/YAML config)
 *
 * This detector does NOT try to identify specific passwords; it flags the
 * presence of a password field assignment pattern. The matched value is the
 * assigned string, not the keyword.
 *
 * Severity: critical — plaintext passwords in documents/emails are a direct
 *   account takeover vector.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Regex ───────────────────────────────────────────────────── */

/**
 * Matches: (password|passwd|pwd|pass|secret|token|apikey) DELIM value
 * where DELIM is =, :, or whitespace+:
 * and value is a non-whitespace string (optionally quoted).
 *
 * Group 1: the keyword
 * Group 2: the assigned value (possibly quoted)
 */
const PASSWORD_RE =
  /\b(password|passwd|pwd|pass|secret|api[_-]?key|auth[_-]?token)\s*[:=]\s*["']?([^\s"',;{}\[\]]{6,}?)["']?(?=[\s,;{}\[\]\n]|$)/gi;

/* ── Known benign placeholders ───────────────────────────────── */

const PLACEHOLDER_RE = /^(?:your[_-]?password|example|changeme|placeholder|<[^>]+>|\*+|x{4,}|null|undefined|none|empty|secret_here)$/i;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "password", "secret", "credential", "login", "auth",
    "api key", "token", "access",
  ],
  negativeKeywords: [
    "example", "sample", "placeholder", "documentation", "readme",
    "tutorial", "demo", "test",
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

export const passwordDetector: Detector = {
  id: "password",
  categoryId: "myDigitalLife" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    PASSWORD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PASSWORD_RE.exec(text)) !== null) {
      const value = m[2]!;

      // Skip obvious placeholders / example values
      if (PLACEHOLDER_RE.test(value)) continue;

      const fullMatch = m[0]!;
      const start     = m.index;
      const end       = start + fullMatch.length;

      // Find where the value starts within the full match
      const valueStart = text.indexOf(value, start + fullMatch.length - value.length);

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "critical",
        confidence:     contextScorer.score(ctx, { start, end }, SCORER_CFG),
        // Expose the value (password itself) so it can be redacted — never persisted
        match:          { value, start: valueStart, end: valueStart + value.length },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
