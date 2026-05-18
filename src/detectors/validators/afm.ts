/**
 * Greek AFM (ΑΦΜ) checksum validator.
 *
 * Greek Tax Identification Number: 9 decimal digits.
 * Algorithm:
 *  - Sum the first 8 digits, each multiplied by 2^(8-position) (0-based).
 *  - Check digit = sum % 11, but if the result is 10, check digit = 0.
 *  - The 9th digit must equal the computed check digit.
 *
 * Pure function; no I/O.
 */

export function afmChecksum(value: string): boolean {
  const digits = value.replace(/\s/g, "");

  if (!/^\d{9}$/.test(digits)) return false;

  // All-zero satisfies the checksum trivially but is not a valid AFM
  if (digits === "000000000") return false;

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(digits[i]) * Math.pow(2, 8 - i);
  }

  const check = sum % 11 === 10 ? 0 : sum % 11;

  return Number(digits[8]) === check;
}
