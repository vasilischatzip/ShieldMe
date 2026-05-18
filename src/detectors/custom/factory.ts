/**
 * Custom Rule detector factory.
 *
 * Converts a `CustomRule` authored by the user into a fully-conformant
 * `Detector`.  Two modes:
 *
 *   "keyword" — literal string, case-insensitive.  The pattern is NOT treated
 *               as a regex, so no injection risk and no ReDoS.
 *   "pattern" — user-supplied regex string.  Validated through
 *               `validateCustomPattern` before use; rejected patterns are
 *               returned as `{ error: string }` instead of a Detector.
 *
 * Constitution:
 *   §I  Privacy-first — no I/O; raw match value is kept in memory only.
 *   §IX Fail loud    — invalid rules return a typed error, not a silent no-op.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CustomRule } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { validateCustomPattern } from "./safe-pattern";

/* ── Types ─────────────────────────────────────────────────────── */

export type DetectorOrError = Detector | { error: string };

/* ── Snippet helper ─────────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return `${prefix}•••${suffix}`;
}

/* ── Factory ─────────────────────────────────────────────────────── */

/**
 * Create a `Detector` from a `CustomRule`.
 *
 * Returns `{ error: string }` if the rule is invalid (bad regex, ReDoS risk).
 * Returns a `Detector` otherwise.
 */
export function createCustomDetector(rule: CustomRule): DetectorOrError {
  const catId: CategoryId = (rule.categoryId as CategoryId | undefined) ?? "myDigitalLife";

  if (rule.kind === "keyword") {
    return buildKeywordDetector(rule, catId);
  }

  return buildPatternDetector(rule, catId);
}

/* ── Keyword detector ─────────────────────────────────────────── */

function buildKeywordDetector(rule: CustomRule, catId: CategoryId): Detector {
  const keyword = rule.pattern.toLowerCase();

  return {
    id: rule.id,
    categoryId: catId,
    region: "global",
    shipTier: "ga",

    scan(ctx: DetectorContext): Finding[] {
      const haystack = ctx.text.toLowerCase();
      const findings: Finding[] = [];
      let searchFrom = 0;

      while (searchFrom < haystack.length) {
        const idx = haystack.indexOf(keyword, searchFrom);
        if (idx === -1) break;

        const start = idx;
        const end = idx + keyword.length;

        findings.push({
          detectorId: rule.id,
          categoryId: catId,
          severity: rule.severity,
          confidence: 1.0,
          match: { value: ctx.text.slice(start, end), start, end },
          contextSnippet: buildSnippet(ctx.text, start, end),
        });

        searchFrom = end;
      }

      return findings;
    },
  };
}

/* ── Pattern detector ─────────────────────────────────────────── */

function buildPatternDetector(rule: CustomRule, catId: CategoryId): DetectorOrError {
  // Validate before compiling — returns early on ReDoS risk
  const validation = validateCustomPattern(rule.pattern);
  if (!validation.ok) {
    return { error: validation.reason };
  }

  // Safe to compile now
  const re = new RegExp(rule.pattern, "g");

  return {
    id: rule.id,
    categoryId: catId,
    region: "global",
    shipTier: "ga",

    scan(ctx: DetectorContext): Finding[] {
      const { text } = ctx;
      const findings: Finding[] = [];
      let m: RegExpExecArray | null;

      // Reset lastIndex — regex is stateful; scan() must be reentrant.
      re.lastIndex = 0;

      while ((m = re.exec(text)) !== null) {
        const raw = m[0]!;
        const start = m.index;
        const end = start + raw.length;

        findings.push({
          detectorId: rule.id,
          categoryId: catId,
          severity: rule.severity,
          confidence: 0.9,
          match: { value: raw, start, end },
          contextSnippet: buildSnippet(text, start, end),
        });

        // Guard against zero-width match infinite loop
        if (m[0]!.length === 0) re.lastIndex++;
      }

      return findings;
    },
  };
}
