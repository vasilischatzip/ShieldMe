/**
 * ReDoS-safe pattern validator for user-supplied regexes.
 *
 * Rejects patterns that are structurally likely to cause catastrophic
 * backtracking (polynomial or exponential time on adversarial input):
 *
 *   1. Length > 500 chars — sanity cap.
 *   2. Invalid regex syntax — caught by `new RegExp(…)`.
 *   3. Nested quantifiers — `(a+)+`, `(a+)*`, `(\\d+)+`, etc.
 *      Detected by a character-by-character parser that tracks which groups
 *      contain quantifiers or alternation.  A group that contains either and
 *      is itself quantified (+ * or {n,}) triggers rejection.
 *
 * This is intentionally conservative: some rejected patterns are technically
 * safe on modern JIT engines, but we prefer false rejections to ReDoS.
 *
 * @see https://owasp.org/www-community/attacks/ReDoS
 */

const MAX_PATTERN_LENGTH = 500;

export type PatternValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/* ── Public API ─────────────────────────────────────────────────── */

export function validateCustomPattern(pattern: string): PatternValidationResult {
  // 1. Length gate
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      ok: false,
      reason: `Pattern too long (${pattern.length} chars; max ${MAX_PATTERN_LENGTH}).`,
    };
  }

  // 2. Syntax check
  try {
    new RegExp(pattern);
  } catch (e) {
    return { ok: false, reason: `Invalid pattern syntax: ${String(e)}` };
  }

  // 3. ReDoS structural check
  if (hasNestedQuantifiers(pattern)) {
    return {
      ok: false,
      reason:
        "Pattern may cause catastrophic backtracking: nested quantifiers or " +
        "alternation inside a quantified group detected. Simplify the pattern.",
    };
  }

  return { ok: true };
}

/* ── Internal: nested-quantifier parser ─────────────────────────── */

/**
 * Returns true if the pattern contains a quantifier-wrapped group that itself
 * contains a quantifier or an alternation (`|`).
 *
 * The parse is a simplified walk — it handles:
 *   • escaped characters (`\x`) → skipped as a unit
 *   • character classes (`[…]`) → treated as a single atom
 *   • groups (`(…)`) → depth-tracked with per-group state
 *   • quantifiers: `+`, `*`, `{n,}` (bare `{n}` is NOT an unbounded quantifier)
 *   • alternation: `|`
 *
 * False negatives: deeply nested parentheses beyond the simple "contains
 * quantifier" heuristic may be missed, but the length cap + practical user
 * input means this is acceptable for MVP.
 */
function hasNestedQuantifiers(source: string): boolean {
  /** Per-group frame on the stack. */
  const stack: Array<{ hasQuantifier: boolean; hasAlternation: boolean }> = [];

  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i]!;

    // ── Escaped character ──
    if (ch === "\\") {
      i += 2; // skip the escape + the next char
      continue;
    }

    // ── Character class ──
    if (ch === "[") {
      i++; // skip `[`
      // Handle negation `[^`
      if (source[i] === "^") i++;
      // Consume until `]`, respecting escapes inside
      while (i < len) {
        if (source[i] === "\\") { i += 2; continue; }
        if (source[i] === "]") { i++; break; }
        i++;
      }
      // Character class acts as a single atom; the following +/* is handled
      // in the next loop iteration naturally.
      continue;
    }

    // ── Open group ──
    if (ch === "(") {
      stack.push({ hasQuantifier: false, hasAlternation: false });
      i++;
      continue;
    }

    // ── Close group ──
    if (ch === ")") {
      const frame = stack.pop();
      i++; // skip `)`

      if (!frame) continue; // unbalanced — already caught by syntax check

      // Look ahead: is this group followed by an unbounded quantifier?
      const next = source[i];
      const isQuantified =
        next === "+" ||
        next === "*" ||
        isUnboundedBrace(source, i);

      if (isQuantified && (frame.hasQuantifier || frame.hasAlternation)) {
        return true; // nested quantifier or catastrophic alternation
      }

      // Propagate: the enclosing group now knows it contains a quantified sub-group
      if (isQuantified && stack.length > 0) {
        stack[stack.length - 1]!.hasQuantifier = true;
      }

      continue;
    }

    // ── Quantifier markers (inside a group) ──
    if ((ch === "+" || ch === "*") && stack.length > 0) {
      stack[stack.length - 1]!.hasQuantifier = true;
      i++;
      continue;
    }

    // ── Brace quantifier `{n,}` or `{n,m}` (inside a group) ──
    if (ch === "{" && stack.length > 0 && isUnboundedBrace(source, i)) {
      stack[stack.length - 1]!.hasQuantifier = true;
      // Advance past the `{…}` token
      i++;
      while (i < len && source[i] !== "}") i++;
      i++; // skip `}`
      continue;
    }

    // ── Alternation ──
    if (ch === "|" && stack.length > 0) {
      stack[stack.length - 1]!.hasAlternation = true;
      i++;
      continue;
    }

    i++;
  }

  return false;
}

/**
 * Returns true if the `{` at `source[pos]` starts an *unbounded* quantifier:
 * `{n,}` or `{n,m}` (both are potentially problematic, especially `{n,}` which
 * is equivalent to a `+` with minimum n).
 *
 * Bounded `{n}` (exact) is NOT considered unbounded.
 */
function isUnboundedBrace(source: string, pos: number): boolean {
  if (source[pos] !== "{") return false;
  // Match {digits,} or {digits,digits}
  const rest = source.slice(pos);
  return /^\{\d+,/.test(rest);
}
