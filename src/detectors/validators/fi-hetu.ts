/**
 * Finnish HETU (Henkilötunnus) validator.
 *
 * Format: DDMMYY[+-A]SSSCC
 *   -  century: - (1900–1999), + (1800–1899), A (2000–2099)
 *   SSS: individual number (002–899)
 *   CC:  2-character checksum from lookup table
 *
 * Checksum: 10-digit number DDMMYYSSS mod 31 → index into lookup string.
 */
const LOOKUP = "0123456789ABCDEFHJKLMNPRSTUVWXY";

export function fiHetu(raw: string): boolean {
  const m = /^(\d{6})[+\-A](\d{3})([0-9A-Y])$/i.exec(raw.trim());
  if (!m) return false;

  const base   = m[1]! + m[2]!;
  const expect = m[3]!.toUpperCase();
  const n      = Number(base);
  if (!isFinite(n)) return false;

  return LOOKUP[n % 31] === expect;
}
