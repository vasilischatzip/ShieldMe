/**
 * Portuguese NIF (Número de Identificação Fiscal) validator.
 *
 * 9 decimal digits. The 9th is a check digit.
 * Algorithm:
 *  - sum = Σ (9 - i) * digit[i]  for i = 0..7
 *  - remainder = sum % 11
 *  - check = (remainder < 2) ? 0 : 11 - remainder
 *  - digit[8] must equal check
 *
 * First digit must be 1–9 (0 is not a valid NIF start).
 *
 * Pure function; no I/O.
 */

export function nifPortugal(value: string): boolean {
  const digits = value.replace(/\s/g, "");

  if (!/^\d{9}$/.test(digits)) return false;

  // First digit must be 1-9
  if (digits[0] === "0") return false;

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += (9 - i) * Number(digits[i]);
  }

  const remainder = sum % 11;
  const check = remainder < 2 ? 0 : 11 - remainder;

  return Number(digits[8]) === check;
}
