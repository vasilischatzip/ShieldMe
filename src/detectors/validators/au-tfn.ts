/**
 * Australian Tax File Number (TFN) checksum validator.
 *
 * Algorithm (ATO specification):
 *   weights = [1, 4, 3, 7, 5, 8, 6, 9, 10]
 *   Σ( digit[i] * weight[i] ) for i = 0..8 must be divisible by 11.
 *
 * Input: 8 or 9 digits (historical TFNs were 8 digits; current are 9).
 * This implementation validates 9-digit TFNs only.
 *
 * Pure function; no I/O.
 */

const WEIGHTS = [1, 4, 3, 7, 5, 8, 6, 9, 10] as const;

export function auTfn(value: string): boolean {
  const digits = value.replace(/\s/g, "");

  if (!/^\d{9}$/.test(digits)) return false;

  // All-zero is structurally invalid
  if (digits === "000000000") return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * WEIGHTS[i]!;
  }

  return sum % 11 === 0;
}
