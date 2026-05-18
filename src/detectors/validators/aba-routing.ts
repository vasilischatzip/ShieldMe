/**
 * ABA Routing Transit Number (RTN) checksum validator.
 *
 * Algorithm (ABA specification):
 *   (3*(d0+d3+d6) + 7*(d1+d4+d7) + (d2+d5+d8)) % 10 === 0
 *
 * Valid RTNs are exactly 9 decimal digits. The leading digit is 0–1 for
 * Federal Reserve routing symbols, 2–9 for others.
 *
 * Pure function; no I/O.
 */

export function abaRouting(value: string): boolean {
  const digits = value.replace(/\s/g, "");

  if (!/^\d{9}$/.test(digits)) return false;

  const d = digits.split("").map(Number);

  const sum =
    3 * (d[0]! + d[3]! + d[6]!) +
    7 * (d[1]! + d[4]! + d[7]!) +
        (d[2]! + d[5]! + d[8]!);

  return sum % 10 === 0;
}
