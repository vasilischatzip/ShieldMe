/**
 * Swedish national identification number (personnummer) validator.
 *
 * Formats accepted:
 *   YYYYMMDD-SSSC  (12 + separator + 4)
 *   YYYYMMDDSSSC   (12 digits, no separator)
 *   YYMMDD-SSSC    (6  + separator + 4)
 *   YYMMDDSSSC     (10 digits, no separator)
 *
 * Validation: Luhn checksum on the 10-digit string YYMMDDSSSC.
 */
import { luhn } from "./luhn";

export function seNin(raw: string): boolean {
  // Strip separators and reduce to 10 digits (drop the century prefix if present)
  const s = raw.replace(/[\s+-]/g, "");
  if (!/^\d{10,12}$/.test(s)) return false;
  const ten = s.length === 12 ? s.slice(2) : s;   // drop YYYY→YY
  if (ten.length !== 10) return false;
  return luhn(ten);
}
