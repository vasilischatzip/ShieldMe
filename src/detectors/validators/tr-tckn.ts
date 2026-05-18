/**
 * Turkish national identification number (TCKN) validator.
 *
 * Format: 11 digits; first digit ≠ 0.
 *
 * Digit 10: (7*(d1+d2+d3+d4+d5) - (d2+d4+d6+d8)) mod 10
 * Digit 11: (d1+d2+…+d10) mod 10
 */
export function trTckn(raw: string): boolean {
  const s = raw.replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(s) || s[0] === "0") return false;

  const d = s.split("").map(Number) as number[];

  const d10 =
    (7 * (d[0]! + d[2]! + d[4]! + d[6]! + d[8]!) - (d[1]! + d[3]! + d[5]! + d[7]!)) % 10;
  if ((d10 + 10) % 10 !== d[9]!) return false;

  const d11 = (d[0]! + d[1]! + d[2]! + d[3]! + d[4]! + d[5]! + d[6]! + d[7]! + d[8]! + d[9]!) % 10;
  return d11 === d[10]!;
}
