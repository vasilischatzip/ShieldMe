/**
 * Israeli national identity number validator.
 *
 * Format: up to 9 digits (left-padded with zeros to 9).
 * Validation: Luhn algorithm on the 9-digit string.
 */
import { luhn } from "./luhn";

export function ilId(raw: string): boolean {
  const s = raw.replace(/[\s-]/g, "").padStart(9, "0");
  if (!/^\d{9}$/.test(s)) return false;
  return luhn(s);
}
