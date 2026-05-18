/**
 * US Social Security Number structural blacklist validator.
 *
 * Rejects structurally invalid and known-blacklisted SSNs:
 *  - Area (first 3 digits): 000, 666, or 900–999
 *  - Group (digits 4–5): 00
 *  - Serial (digits 6–9): 0000
 *  - Known published/invalid values (Hilda Schrader Whittle, etc.)
 *
 * Input accepted with or without hyphens (NNN-GG-SSSS or NNNGGSSSS).
 * Pure function; no I/O.
 */

/** Hard blacklist of specific SSNs known to be widely circulated / invalid. */
const BLACKLISTED = new Set<string>([
  "078051120", // Hilda Schrader Whittle — printed in Woolworth's wallets ad
  "123456789", // Widely recognised as obviously fake
]);

export function ssnBlacklist(value: string): boolean {
  // Strip hyphens and whitespace
  const digits = value.replace(/[-\s]/g, "");

  if (!/^\d{9}$/.test(digits)) return false;

  const area   = digits.slice(0, 3); // NNN
  const group  = digits.slice(3, 5); // GG
  const serial = digits.slice(5, 9); // SSSS

  // Area 000 — never assigned
  if (area === "000") return false;

  // Area 666 — reserved
  if (area === "666") return false;

  // Areas 900–999 — not valid individual taxpayer SSNs
  if (parseInt(area, 10) >= 900) return false;

  // Group 00 — never issued
  if (group === "00") return false;

  // Serial 0000 — never issued
  if (serial === "0000") return false;

  // Known blacklisted SSNs
  if (BLACKLISTED.has(digits)) return false;

  return true;
}
