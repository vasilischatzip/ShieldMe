/**
 * Spanish NIF (DNI) letter validator.
 *
 * A Spanish NIF is 8 digits followed by a letter.
 * The letter is TABLE[number % 23] where:
 *   TABLE = "TRWAGMYFPDXBNJZSQVHLCKE"
 *
 * Also handles NIE (Foreigner Identification Numbers):
 *   - Start with X, Y, or Z (replaced by 0, 1, 2 respectively before mod)
 *
 * Pure function; no I/O.
 */

const TABLE = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Maps NIE prefix letter to its numeric equivalent. */
const NIE_MAP: Record<string, string> = { X: "0", Y: "1", Z: "2" };

export function nifSpain(value: string): boolean {
  const v = value.trim().toUpperCase();

  // NIF: 8 digits + 1 letter
  const nifMatch = /^(\d{8})([A-Z])$/.exec(v);
  if (nifMatch) {
    const num = parseInt(nifMatch[1]!, 10);
    const letter = nifMatch[2]!;
    return TABLE[num % 23] === letter;
  }

  // NIE: X/Y/Z + 7 digits + 1 letter
  const nieMatch = /^([XYZ])(\d{7})([A-Z])$/.exec(v);
  if (nieMatch) {
    const prefix = NIE_MAP[nieMatch[1]!]!;
    const numStr = prefix + nieMatch[2]!;
    const num = parseInt(numStr, 10);
    const letter = nieMatch[3]!;
    return TABLE[num % 23] === letter;
  }

  return false;
}
