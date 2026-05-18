/**
 * Italian Codice Fiscale (tax code) check character validator.
 *
 * Format: 6 letters (surname) + 6 letters (name) + 2 digits (year) +
 *         1 letter (month) + 2 chars (day+sex) + 4 chars (municipality) +
 *         1 letter (check character) = 16 chars total.
 *
 * Check character algorithm:
 *  - Positions are 1-based; odd positions use ODD_VALUES, even use EVEN_VALUES.
 *  - Sum the values for positions 1–15 (chars 0–14).
 *  - check = chr('A' + sum % 26)
 *
 * Pure function; no I/O.
 */

/** Values for characters at ODD positions (1, 3, 5, …, 15). */
const ODD_VALUES: Record<string, number> = {
  "0": 1,  "1": 0,  "2": 5,  "3": 7,  "4": 9,
  "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1,  B: 0,  C: 5,  D: 7,  E: 9,  F: 13,
  G: 15, H: 17, I: 19, J: 21, K: 2,  L: 4,
  M: 18, N: 20, O: 11, P: 3,  Q: 6,  R: 8,
  S: 12, T: 14, U: 16, V: 10, W: 22, X: 25,
  Y: 24, Z: 23,
};

/** Values for characters at EVEN positions (2, 4, 6, …, 14). */
const EVEN_VALUES: Record<string, number> = {
  "0": 0,  "1": 1,  "2": 2,  "3": 3,  "4": 4,
  "5": 5,  "6": 6,  "7": 7,  "8": 8,  "9": 9,
  A: 0,  B: 1,  C: 2,  D: 3,  E: 4,  F: 5,
  G: 6,  H: 7,  I: 8,  J: 9,  K: 10, L: 11,
  M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17,
  S: 18, T: 19, U: 20, V: 21, W: 22, X: 23,
  Y: 24, Z: 25,
};

export function codiceFiscale(value: string): boolean {
  // No case-normalisation: CF must be presented in uppercase per the spec.
  const cf = value.trim();

  // Basic format: 16 chars, alphanumeric
  if (!/^[A-Z0-9]{16}$/.test(cf)) return false;

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const ch = cf[i]!;
    // Position is 1-based; odd positions: i+1 is odd ↔ i is even (0-based)
    if (i % 2 === 0) {
      // 0-based even index = 1-based odd position
      const val = ODD_VALUES[ch];
      if (val === undefined) return false;
      sum += val;
    } else {
      // 0-based odd index = 1-based even position
      const val = EVEN_VALUES[ch];
      if (val === undefined) return false;
      sum += val;
    }
  }

  const expectedCheck = String.fromCharCode("A".charCodeAt(0) + (sum % 26));
  return cf[15] === expectedCheck;
}
