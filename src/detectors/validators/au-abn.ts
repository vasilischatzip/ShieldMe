/**
 * Australian Business Number (ABN) checksum validator.
 *
 * Algorithm (ATO specification):
 *   weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
 *   1. Subtract 1 from the first digit.
 *   2. Compute sum = Σ( adjusted_digit[i] * weight[i] ) for i = 0..10.
 *   3. sum must be divisible by 89.
 *
 * The first digit of a valid ABN is 1–9 (after subtracting 1 it is 0–8;
 * a first digit of 0 yields a negative start and is structurally invalid).
 *
 * Pure function; no I/O.
 */

const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

export function auAbn(value: string): boolean {
  const digits = value.replace(/\s/g, "");

  if (!/^\d{11}$/.test(digits)) return false;

  // First digit must be ≥ 1 (0 → sum starts negative, never ÷89)
  if (digits[0] === "0") return false;

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const d = i === 0 ? Number(digits[0]) - 1 : Number(digits[i]);
    sum += d * WEIGHTS[i]!;
  }

  // sum === 0 is valid: (1-1)*10 = 0, and 0 is divisible by 89.
  return sum % 89 === 0;
}
