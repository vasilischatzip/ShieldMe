/**
 * Brazilian CNPJ (Cadastro Nacional da Pessoa Jurídica) validator.
 *
 * Format: XX.XXX.XXX/XXXX-DD  or  14 unformatted digits.
 * Two check digits via modulo-11 with different weight cycles.
 */
export function brCnpj(raw: string): boolean {
  const s = raw.replace(/[.\-\/\s]/g, "");
  if (!/^\d{14}$/.test(s)) return false;
  if (/^(\d)\1{13}$/.test(s)) return false;

  function digit(digits: string, weights: number[]): number {
    const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]!), 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  }

  const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = digit(s, W1);
  if (d1 !== Number(s[12]!)) return false;

  const d2 = digit(s, W2);
  return d2 === Number(s[13]!);
}
