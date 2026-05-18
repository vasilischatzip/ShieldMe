/**
 * Japanese My Number (個人番号 / マイナンバー) validator.
 *
 * Format: 12 decimal digits.
 * The 12th digit is a check digit computed as follows (行政手続における特定の個人を
 * 識別するための番号の利用等に関する法律施行規則 §1):
 *
 *   1. Weights for d1…d11 (left to right): [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
 *   2. Q = Σ(di × weighti)
 *   3. R = Q mod 11
 *   4. check_digit = (R ≤ 1) ? 0 : 11 − R
 *
 * Source: Cabinet Office Ordinance on My Number Act (番号法施行規則).
 * Pure function; no I/O.
 */

const WEIGHTS = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/**
 * Returns `true` when `value` is a structurally valid 12-digit My Number.
 * Accepts plain digits only (hyphens / spaces are stripped first).
 */
export function jpMyNumber(value: string): boolean {
  const digits = value.replace(/[-\s]/g, "");
  if (!/^\d{12}$/.test(digits)) return false;

  let q = 0;
  for (let i = 0; i < 11; i++) {
    // charCodeAt never returns undefined (NaN only if out-of-bounds, which the
    // regex guard above prevents). WEIGHTS[i] is ?? 0 to satisfy noUncheckedIndexedAccess.
    q += (digits.charCodeAt(i) - 48) * (WEIGHTS[i] ?? 0);
  }

  const r = q % 11;
  const expected = r <= 1 ? 0 : 11 - r;
  return (digits.charCodeAt(11) - 48) === expected;
}
