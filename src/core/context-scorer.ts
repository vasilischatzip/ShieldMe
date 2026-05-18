/**
 * ContextScorer — pure proximity-keyword confidence adjuster.
 *
 * Constitution §VII: "Context window scoring: proximity to keywords scales
 * confidence; naked 9-digit strings are low-confidence."
 *
 * Score algorithm:
 *   1. Extract text window = text[max(0, match.start−window) .. match.end+window].
 *   2. Count unique positive keywords (case-insensitive) found in the window → posHits.
 *   3. Count unique negative keywords (case-insensitive) found in the window → negHits.
 *   4. posContribution = (posHits / positiveKeywords.length) × 0.5  (0 when list is empty)
 *      negContribution = (negHits / negativeKeywords.length) × 0.5  (0 when list is empty)
 *   5. score = clamp(0.5 + posContribution − negContribution, 0, 1)
 *
 * Baseline 0.5 means "neutral context" — callers layer this on top of their
 * own algorithmic confidence as needed.
 *
 * Pure; no I/O. Implements the ContextScorer interface from detectors/types.
 */
import type {
  ContextScorer,
  ContextScorerConfig,
  DetectorContext,
  Confidence,
} from "~/detectors/types";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Count unique keywords (case-insensitive) found within `haystack`.
 * Duplicate occurrences of the same keyword count as one hit.
 */
function countUniqueHits(haystack: string, keywords: readonly string[]): number {
  let hits = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw.toLowerCase())) hits++;
  }
  return hits;
}

class ContextScorerImpl implements ContextScorer {
  score(
    ctx: DetectorContext,
    match: { start: number; end: number },
    cfg: ContextScorerConfig,
  ): Confidence {
    const { text } = ctx;
    const { positiveKeywords, negativeKeywords, window } = cfg;

    // Extract window around the match
    const wStart = Math.max(0, match.start - window);
    const wEnd   = Math.min(text.length, match.end + window);
    const windowText = text.slice(wStart, wEnd).toLowerCase();

    // Count unique keyword hits
    const posHits = countUniqueHits(windowText, positiveKeywords);
    const negHits = countUniqueHits(windowText, negativeKeywords);

    const posContribution = positiveKeywords.length > 0
      ? (posHits / positiveKeywords.length) * 0.5
      : 0;

    const negContribution = negativeKeywords.length > 0
      ? (negHits / negativeKeywords.length) * 0.5
      : 0;

    return clamp(0.5 + posContribution - negContribution, 0, 1);
  }
}

/** Singleton scorer instance — stateless, safe to share. */
export const contextScorer: ContextScorer = new ContextScorerImpl();
