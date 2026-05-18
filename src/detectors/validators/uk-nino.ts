/**
 * UK National Insurance Number (NINO) format validator.
 *
 * Format: XX 999999 X  (spaces optional)
 *   - 2 prefix letters
 *   - 6 decimal digits
 *   - 1 suffix letter (A–D only)
 *
 * Prefix rules (HMRC specification):
 *   - First letter must not be: D, F, I, Q, U, V
 *   - Second letter must not be: D, F, I, O, U, V
 *   - Certain two-letter prefix pairs are entirely forbidden:
 *       BG, GB, KN, NK, NT, TN, ZZ
 *
 * Pure function; no I/O.
 */

const FORBIDDEN_FIRST  = new Set(["D","F","I","Q","U","V"]);
const FORBIDDEN_SECOND = new Set(["D","F","I","O","U","V"]);
const FORBIDDEN_PREFIX = new Set(["BG","GB","KN","NK","NT","TN","ZZ"]);

export function ukNino(value: string): boolean {
  // Strip spaces; normalise to uppercase
  const v = value.replace(/\s/g, "").toUpperCase();

  // Total length must be exactly 9
  if (v.length !== 9) return false;

  // Must match  LL 999999 L  pattern
  if (!/^[A-Z]{2}\d{6}[A-Z]$/.test(v)) return false;

  const first  = v[0]!;
  const second = v[1]!;
  const prefix = v.slice(0, 2);
  const suffix = v[8]!;

  if (FORBIDDEN_FIRST.has(first))   return false;
  if (FORBIDDEN_SECOND.has(second)) return false;
  if (FORBIDDEN_PREFIX.has(prefix)) return false;

  // Suffix must be A, B, C, or D
  if (!["A","B","C","D"].includes(suffix)) return false;

  return true;
}
