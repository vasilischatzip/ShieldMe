/**
 * German Tax ID (Steueridentifikationsnummer) validator.
 *
 * ISO 7064 MOD 11,10 variant — 11 decimal digits, first digit ≠ 0.
 *
 * Algorithm (processes digits 0–9, validates digit 10):
 *   product = 10
 *   for each d in digits[0..9]:
 *     sum     = (d + product) % 10   →  if sum === 0, use 10 instead
 *     product = (sum * 2) % 11
 *   expectedCheck = 11 - product     →  if result === 10, use 0
 *   digits[10] must equal expectedCheck
 *
 * Pure function; no I/O.
 */

export function deTin(value: string): boolean {
  const digits = value.replace(/\s/g, "");

  if (!/^\d{11}$/.test(digits)) return false;

  // First digit must not be 0
  if (digits[0] === "0") return false;

  let product = 10;

  for (let i = 0; i < 10; i++) {
    let sum = (Number(digits[i]) + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }

  const expectedCheck = product === 1 ? 0 : 11 - product;

  return Number(digits[10]) === expectedCheck;
}
