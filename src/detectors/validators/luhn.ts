/**
 * Luhn algorithm (ISO/IEC 7812-1).
 *
 * Validates credit/debit card PANs. The check digit (last digit) makes the
 * total Luhn sum divisible by 10.
 *
 * Pure function; no I/O.
 */

/**
 * Returns true when the digit string passes the Luhn check.
 * Accepts only strings consisting entirely of decimal digits.
 */
export function luhn(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;

  // All-zero strings satisfy Luhn trivially but are not valid PANs
  if (/^0+$/.test(digits)) return false;

  let sum = 0;
  let double = false;

  // Traverse right-to-left
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);

    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }

    sum += d;
    double = !double;
  }

  return sum % 10 === 0;
}
