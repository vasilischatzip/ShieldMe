/**
 * Argentine CUIT / CUIL validator.
 *
 * Format: XX-XXXXXXXX-X  or  11 unformatted digits.
 * Prefix codes: 20/23/24/27 (natural person), 30/33/34 (legal entity),
 *               33/34 (mixed-type).
 * Check digit: 11 − ((weighted_sum) mod 11), where weights cycle [5,4,3,2,7,6,5,4,3,2].
 * If result is 11 → 0; if result is 10 → invalid.
 */
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export function arCuit(raw: string): boolean {
  const s = raw.replace(/[-\s]/g, "");
  if (!/^\d{11}$/.test(s)) return false;

  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(s[i]!), 0);
  const rem = sum % 11;
  const k   = rem === 0 ? 0 : rem === 1 ? null : 11 - rem;
  if (k === null) return false; // remainder 1 → no valid check digit
  return k === Number(s[10]!);
}
