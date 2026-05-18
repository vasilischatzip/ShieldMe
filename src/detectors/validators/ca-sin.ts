/**
 * Canadian Social Insurance Number (SIN) validator.
 *
 * Format: 9 digits, commonly formatted as NNN-NNN-NNN.
 * Validation: Luhn algorithm (ISO/IEC 7812-1).
 *
 * Assignment notes:
 *   - First digit 1–7: Canadian citizens and permanent residents
 *   - First digit 9:   Temporary residents (valid SINs)
 *   - First digit 0:   Historical; no longer issued but still in use
 *   - First digit 8:   Currently unassigned / reserved
 *
 * Source: Canada Revenue Agency SIN specification.
 * Pure function; no I/O.
 */
import { luhn } from "./luhn";

/**
 * Returns `true` when `value` is a structurally valid Canadian SIN.
 * Accepts input with or without hyphens (NNN-NNN-NNN or NNNNNNNNN).
 */
export function caSin(value: string): boolean {
  const digits = value.replace(/[-\s]/g, "");
  if (!/^\d{9}$/.test(digits)) return false;
  // Luhn rejects all-zero strings; other all-same-digit patterns are
  // caught by failing the Luhn check (none satisfy the algorithm).
  return luhn(digits);
}
