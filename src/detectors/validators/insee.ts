/**
 * French INSEE number (Numéro de Sécurité Sociale) checksum validator.
 *
 * Format: 15 digits
 *   d[0]     — sex (1 = male, 2 = female)
 *   d[1-2]   — year of birth (00–99)
 *   d[3-4]   — month of birth (01–12; overseas extensions 20–30 are excluded here)
 *   d[5-12]  — department / commune / order (8 digits)
 *   d[13-14] — control key, 2 digits, zero-padded
 *
 * Key algorithm:
 *   key = 97 − (d[0..12] mod 97), zero-padded to 2 digits.
 *   The last two digits must equal the computed key.
 *
 * Pure function; no I/O.
 */

/** Process a numeric string as a big integer and return its value mod `m`. */
function modString(s: string, m: number): number {
  let r = 0;
  for (const ch of s) r = (r * 10 + Number(ch)) % m;
  return r;
}

export function inseeChecksum(value: string): boolean {
  const s = value.replace(/\s/g, "");

  if (!/^\d{15}$/.test(s)) return false;

  // Sex digit: must be 1 or 2
  const sex = s[0]!;
  if (sex !== "1" && sex !== "2") return false;

  // Month: digits [3-4] must be 01–12
  const month = parseInt(s.slice(3, 5), 10);
  if (month < 1 || month > 12) return false;

  // Compute expected key from the first 13 digits
  const base    = s.slice(0, 13);
  const mod     = modString(base, 97);
  const key     = 97 - mod;
  const keyStr  = key.toString().padStart(2, "0");

  return s.slice(13, 15) === keyStr;
}
