/**
 * Norwegian national identity number (fødselsnummer) validator.
 *
 * Format: DDMMYYIIIKK  (11 digits)
 *   III = individual digits (SSS)
 *   K1  = first check digit
 *   K2  = second check digit
 *
 * Both check digits are computed as 11 - (weighted_sum mod 11).
 * If the result is 10 the number is invalid; if 11 the digit is 0.
 *
 * K1 weights: 3,7,6,1,8,9,4,5,2
 * K2 weights: 5,4,3,2,7,6,5,4,3,2
 */
export function noNin(raw: string): boolean {
  const s = raw.replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(s)) return false;

  const d = s.split("").map(Number) as number[];

  function check(weights: readonly number[], digits: number[], expected: number): boolean {
    const sum = weights.reduce((acc, w, i) => acc + w * digits[i]!, 0);
    const rem = sum % 11;
    const k   = rem === 0 ? 0 : 11 - rem;
    return k < 10 && k === expected;
  }

  const W1 = [3, 7, 6, 1, 8, 9, 4, 5, 2] as const;
  const W2 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

  return check(W1, d, d[9]!) && check(W2, d, d[10]!);
}
