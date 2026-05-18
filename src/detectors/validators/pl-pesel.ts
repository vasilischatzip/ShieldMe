/**
 * Polish PESEL checksum validator.
 *
 * PESEL is the Polish national identification number — 11 digits.
 * The final digit is a weighted-sum modulo-10 check.
 *
 * Weights: [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]
 * Checksum: (10 - (weighted_sum mod 10)) mod 10 == digit[10]
 */
export function plPesel(raw: string): boolean {
  const s = raw.replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(s)) return false;

  const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3] as const;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += w[i]! * Number(s[i]!);
  }
  return (10 - (sum % 10)) % 10 === Number(s[10]!);
}
