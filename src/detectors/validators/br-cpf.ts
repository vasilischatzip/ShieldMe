/**
 * Brazilian CPF (Cadastro de Pessoas Físicas) validator.
 *
 * Format: DDD.DDD.DDD-DD  or  11 unformatted digits.
 * Two check digits computed via modulo-11.
 *
 * Well-known invalid all-same-digit strings (000.000.000-00, etc.) rejected.
 */
export function brCpf(raw: string): boolean {
  const s = raw.replace(/[.\-\s]/g, "");
  if (!/^\d{11}$/.test(s)) return false;
  if (/^(\d)\1{10}$/.test(s)) return false; // e.g. "11111111111"

  function digit(digits: string, weights: number[]): number {
    const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]!), 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  }

  const d1 = digit(s, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(s[9]!)) return false;

  const d2 = digit(s, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(s[10]!);
}
