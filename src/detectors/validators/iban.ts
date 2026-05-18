/**
 * IBAN mod-97 validator (ISO 13616).
 *
 * Algorithm:
 *  1. Move first 4 characters to the end.
 *  2. Replace each letter with its numeric value: A=10 … Z=35.
 *  3. Interpret the resulting string as a big integer and compute mod 97.
 *  4. Valid IBANs yield remainder 1.
 *
 * Pure function; no I/O.
 */

/** Maps letter → numeric string (A=10, B=11, …, Z=35). */
function letterToDigits(ch: string): string {
  return String(ch.toUpperCase().charCodeAt(0) - 55); // 'A'.charCodeAt(0) = 65; 65-55=10
}

/** Big-integer mod without BigInt dependency — processes left-to-right. */
function modString(s: string, mod: number): number {
  let remainder = 0;
  for (const ch of s) {
    remainder = (remainder * 10 + Number(ch)) % mod;
  }
  return remainder;
}

/**
 * Returns true when the IBAN string (spaces are stripped) passes mod-97.
 * Does not validate country-specific length rules — callers should strip
 * spaces before passing.
 */
export function ibanMod97(raw: string): boolean {
  const iban = raw.replace(/\s/g, "").toUpperCase();

  // Minimum length: 5 (country 2 + check 2 + at least 1 BBAN char)
  if (iban.length < 5) return false;

  // Basic character set: letters and digits only
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return false;

  // Rearrange: move first 4 chars to end
  const rearranged = iban.slice(4) + iban.slice(0, 4);

  // Expand letters to digits
  let numericString = "";
  for (const ch of rearranged) {
    numericString += /[A-Z]/.test(ch) ? letterToDigits(ch) : ch;
  }

  return modString(numericString, 97) === 1;
}
