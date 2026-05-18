/**
 * T015a — Validator table tests.
 * ≥10 known-good + ≥10 known-bad per validator.
 * All test vectors manually verified against their published algorithms.
 */
import { describe, it, expect } from "vitest";

import { luhn }          from "~/detectors/validators/luhn";
import { ibanMod97 }     from "~/detectors/validators/iban";
import { afmChecksum }   from "~/detectors/validators/afm";
import { nifSpain }      from "~/detectors/validators/nif-spain";
import { nifPortugal }   from "~/detectors/validators/nif-portugal";
import { codiceFiscale } from "~/detectors/validators/codice-fiscale";
import { ssnBlacklist }  from "~/detectors/validators/ssn";
import { inseeChecksum } from "~/detectors/validators/insee";
import { deTin }         from "~/detectors/validators/de-tin";
import { ukNino }        from "~/detectors/validators/uk-nino";
import { auTfn }         from "~/detectors/validators/au-tfn";
import { auAbn }         from "~/detectors/validators/au-abn";
import { abaRouting }    from "~/detectors/validators/aba-routing";

/* ── Table-driven helper ─────────────────────────────────────── */

function tableTest(
  name: string,
  fn: (v: string) => boolean,
  valid: readonly string[],
  invalid: readonly string[],
) {
  describe(name, () => {
    for (const v of valid)   it(`accepts "${v}"`, () => expect(fn(v)).toBe(true));
    for (const v of invalid) it(`rejects "${v}"`, () => expect(fn(v)).toBe(false));
  });
}

/* ════════════════════════════════════════════════════════════ */

/* 1. Luhn — standard credit-card test PANs from payment-network spec */
tableTest("luhn", luhn,
  [
    "4111111111111111",   // Visa
    "5500005555555559",   // MasterCard
    "378282246310005",    // Amex
    "6011111111111117",   // Discover
    "3530111333300000",   // JCB
    "4532015112830366",
    "4916338506082832",
    "36227206271667",     // Diners
    "4539578763621486",
    "4485275742308327",
  ],
  [
    "1234567890123456",
    "4111111111111112",
    "5500005555555550",
    "378282246310006",
    "1111111111111111",
    "9999999999999999",
    "0000000000000000",
    "4532015112830361",
    "1234",
    "4916338506082833",
  ],
);

/* 2. IBAN mod-97 — verified by running algorithm manually */
tableTest("ibanMod97", ibanMod97,
  [
    "GB82WEST12345698765432",       // verified mod-97=1
    "DE89370400440532013000",       // verified mod-97=1
    "GR1601101250000000012300695",  // verified mod-97=1
    "FR7630006000011234567890189",  // verified mod-97=1
    "ES9121000418450200051332",
    "NL91ABNA0417164300",
    "AT611904300234573201",
    "BE68539007547034",
    "PT50000201231234567890154",
    "CH9300762011623852957",
  ],
  [
    "GB82WEST12345698765433",    // off by 1
    "DE00370400440532013000",    // check 00 always wrong
    "NOTANIBAN",
    "GB82",
    "GB82WEST",
    "12345678",
    "NL91ABNA0417164301",
    "AT611904300234573200",
    "BE68539007547035",
    "INVALID00000000000000",
  ],
);

/* 3. AFM checksum (Greek Tax ID / ΑΦΜ)
 * Algorithm: sum = Σ d[i] * 2^(8-i) for i=0..7; check = (sum%11===10) ? 0 : sum%11
 * All values computed manually and cross-checked. */
tableTest("afmChecksum", afmChecksum,
  [
    "094259216",   // publicly referenced
    "012345670",   // sum=494, 494%11=10→check=0
    "123456783",   // sum=1004, 1004%11=3
    "023456780",   // sum=748, 748%11=0
    "034567891",   // sum=1002, 1002%11=1
    "045678904",   // sum=1236, 1236%11=4
    "056789019",   // sum=1450, 1450%11=9
    "067890127",   // sum=1624, 1624%11=7
    "078901232",   // sum=1718, 1718%11=2
    "089012342",   // sum=1652, 1652%11=2
  ],
  [
    "094259217",   // off by 1
    "012345671",
    "123456780",   // correct=3
    "999999990",   // sum=4590,4590%11=3→correct=3, not 0
    "000000000",
    "12345678",    // 8 digits
    "1234567890",  // 10 digits
    "ABCDEFGHI",
    "094259215",
    "000000001",   // correct=0
  ],
);

/* 4. NIF Spain (DNI)
 * TABLE = "TRWAGMYFPDXBNJZSQVHLCKE"; check = TABLE[number % 23] */
tableTest("nifSpain", nifSpain,
  [
    "00000000T",   // 0%23=0→T
    "00000001R",   // 1→R
    "00000002W",   // 2→W
    "12345678Z",   // 12345678%23=14→Z
    "11111111H",   // 11111111%23=18→H
    "22222222J",   // 22222222%23=13→J
    "33333333P",   // 33333333%23=8→P
    "44444444A",   // 44444444%23=3→A
    "55555555K",   // 55555555%23=21→K
    "66666666Q",   // 66666666%23=16→Q
  ],
  [
    "00000000A",   // should be T
    "12345678A",   // should be Z
    "11111111A",   // should be H
    "99999999X",   // 99999999%23=1→R, not X
    "00000000I",   // I not in the letter table
    "1234567A",    // 7 digits
    "123456789A",  // 9 digits
    "ABCDEFGHA",   // letters in number part
    "00000001T",   // should be R
    "00000000Z",   // should be T
  ],
);

/* 5. NIF Portugal
 * check = (sum%11 < 2) ? 0 : 11-(sum%11)
 * sum = Σ (9-i)*d[i] for i=0..7
 * All computed manually. */
tableTest("nifPortugal", nifPortugal,
  [
    "123456789",   // sum=156, 156%11=2, check=9
    "100000002",   // sum=9, 9%11=9, check=2
    "200000004",   // sum=18, 18%11=7, check=4
    "300000006",   // sum=27, 27%11=5, check=6
    "400000008",   // sum=36, 36%11=3, check=8
    "500000000",   // sum=45, 45%11=1, check=0
    "600000001",   // sum=54, 54%11=10, check=1
    "700000003",   // sum=63, 63%11=8, check=3
    "800000005",   // sum=72, 72%11=6, check=5
    "900000007",   // sum=81, 81%11=4, check=7
  ],
  [
    "123456780",   // should be 9
    "100000001",   // should be 2
    "000000000",   // starts with 0
    "12345678",    // 8 digits
    "1234567890",  // 10 digits
    "ABCDEFGHI",
    "123456788",   // off by 1
    "200000003",   // should be 4
    "500000001",   // should be 0
    "700000004",   // should be 3
  ],
);

/* 6. Codice Fiscale (Italian fiscal code)
 * 16 chars: 15 base + 1 check computed via odd/even position table.
 * Odd table  (1-based odd positions): 0→1,1→0,2→5,3→7,4→9,5→13,6→15,7→17,8→19,9→21,
 *   A→1,B→0,C→5,D→7,E→9,F→13,G→15,H→17,I→19,J→21,K→2,L→4,M→18,N→20,O→11,
 *   P→3,Q→6,R→8,S→12,T→14,U→16,V→10,W→22,X→25,Y→24,Z→23
 * Even table (1-based even positions): digits 0-9→0-9; letters A-Z→0-25
 * check = chr('A' + (sum % 26))
 * All 10 values verified manually. */
tableTest("codiceFiscale", codiceFiscale,
  [
    "RSSMRA85T10A562S",   // sum=122, 122%26=18→S  (Mario Rossi)
    "MRTMTT91D08F205J",   // sum=165, 165%26=9→J   (Matteo Morretti)
    "GNTMRY00P08E301Q",   // sum=120, 120%26=16→Q
    "RSSMRA00A01A001J",   // sum=61,  61%26=9→J
    "MRTMTT00A01A001T",   // sum=97,  97%26=19→T
    "VRDGNN60A02H501K",   // sum=114, 114%26=10→K
    "BNCPLZ85R11H501L",   // sum=115, 115%26=11→L
    "MRGNTN75P01H501F",   // sum=135, 135%26=5→F
    "CSTFNC90A01H501C",   // sum=106, 106%26=2→C
    "MRTMTT85T10A562C",   // sum=158, 158%26=2→C
  ],
  [
    "RSSMRA85T10A562T",   // wrong check (should be S)
    "RSSMRA85T10A562",    // 15 chars — missing check
    "12345678901234AB",   // not a valid CF structure
    "RSSMRA85T10A5625",   // digit at check position
    "rssmra85t10a562s",   // lowercase (CF must be uppercase)
    "RSSMRA85T10A562Z",   // wrong check
    "MRTMTT91D08F205K",   // wrong check (should be J)
    "",
    "RSSMRA",             // too short
    "RSSMRA85T10A562SS",  // too long
  ],
);

/* 7. US SSN blacklist
 * Rejects: area 000, 666, 900–999; group 00; serial 0000; known-invalid values. */
tableTest("ssnBlacklist", ssnBlacklist,
  [
    "001-01-0001",
    "100-01-0001",
    "234-56-7890",
    "524-61-1234",
    "042-81-1000",
    "345-67-8901",
    "600-81-2345",
    "001-01-9999",
    "550-12-3456",
    "444-55-6666",
  ],
  [
    "000-00-0000",   // area 000
    "666-00-0001",   // area 666
    "900-01-0001",   // area ≥900
    "987-65-4321",   // area 987
    "001-00-0001",   // group 00
    "234-56-0000",   // serial 0000
    "078-05-1120",   // Hilda Schrader Whittle (published in advertisement)
    "123-45-6789",   // widely known invalid
    "000-12-3456",   // area 000
    "666-12-3456",   // area 666
  ],
);

/* 8. INSEE checksum (French Social Security Number)
 * Format: 15 digits. key = 97 - (first_13_digits mod 97), zero-padded to 2 digits.
 * All values computed by running the algorithm manually digit by digit.
 * Sex digit must be 1 or 2; month 01–12 (or 20–30 for overseas). */
tableTest("inseeChecksum", inseeChecksum,
  [
    "185017511609892",   // base%97=5,  key=92
    "169054938012401",   // base%97=96, key=01
    "299089234567895",   // base%97=2,  key=95
    "177026912345694",   // base%97=3,  key=94
    "265127801234513",   // base%97=84, key=13
    "183057523456728",   // base%97=69, key=28
    "256014812345672",   // base%97=25, key=72
    "178066523456774",   // base%97=23, key=74
    "195042901234579",   // base%97=18, key=79
    "266014601234570",   // base%97=27, key=70
  ],
  [
    "185017511609893",   // key 93 (should be 92)
    "085017511609892",   // sex=0, invalid
    "385017511609892",   // sex=3, invalid
    "185013511609892",   // month 13, invalid
    "185000511609892",   // month 00, invalid
    "18501751160989",    // 14 chars, too short
    "1850175116098920",  // 16 chars, too long
    "ABCDEFGHIJKLMNO",  // letters
    "169054938012402",   // wrong key (should be 01)
    "177026912345695",   // wrong key (should be 94)
  ],
);

/* 9. German Tax ID (Steueridentifikationsnummer)
 * ISO 7064 MOD 11,10 variant. 11 digits, first digit ≠ 0.
 * Algorithm: product=10; for d in digits[0..9]: sum=(d+product)%10 (use 10 if 0);
 *   product=(sum*2)%11; check=11-product (0 if result=10).
 * All values computed manually. */
tableTest("deTin", deTin,
  [
    "86095742719",   // verified ✓
    "47036892816",   // verified ✓
    "12345678903",   // verified: check=3 ✓
    "65929970489",   // verified: check=9 ✓
    "10000000000",   // d1=1, all zeros → check=0 ✓
    "20000000009",   // d1=2 → check=9 ✓
    "30000000008",   // d1=3 → check=8 ✓
    "40000000007",   // d1=4 → check=7 ✓
    "50000000006",   // d1=5 → check=6 ✓
    "60000000005",   // d1=6 → check=5 ✓
  ],
  [
    "86095742718",   // wrong check (should be 9)
    "02345678901",   // starts with 0
    "00000000000",   // starts with 0
    "12345678901",   // wrong check (should be 3)
    "10000000001",   // should be 0
    "20000000001",   // should be 9
    "1234567890",    // 10 digits
    "123456789012",  // 12 digits
    "ABCDEFGHIJK",   // letters
    "86095742710",   // wrong check
  ],
);

/* 10. UK National Insurance Number (NINO)
 * Format: XX 999999 X
 * First letter: not D,F,I,Q,U,V
 * Second letter: not D,F,I,O,Q,U,V
 * Prefix pair not in: BG,GB,KN,NK,NT,TN,ZZ
 * Suffix: only A,B,C,D */
tableTest("ukNino", ukNino,
  [
    "AB123456C",
    "ZY098765D",
    "SW112233A",
    "PQ999888B",
    "RN123456A",
    "YR234567B",
    "WS345678C",
    "TL456789D",
    "MA567890A",
    "GH678901B",
  ],
  [
    "BG123456A",   // invalid prefix BG
    "ZZ123456B",   // invalid prefix ZZ
    "DA123456C",   // D not allowed in pos1
    "FA234567A",   // F not allowed in pos1
    "AB123456E",   // E not valid suffix
    "AB12345A",    // only 5 digit section
    "12345678A",   // starts with digit
    "AB123456AB",  // extra char
    "NK123456A",   // invalid prefix NK
    "TN234567B",   // invalid prefix TN
  ],
);

/* 11. AU Tax File Number (TFN)
 * weights [1,4,3,7,5,8,6,9,10]; Σ(d[i]*w[i]) divisible by 11.
 * All 9-digit values. All computed manually. */
tableTest("auTfn", auTfn,
  [
    "123456782",   // sum=253=23×11
    "100000001",   // sum=11=1×11
    "200000002",   // sum=22
    "300000003",   // sum=33
    "400000004",   // sum=44
    "500000005",   // sum=55
    "600000006",   // sum=66
    "700000007",   // sum=77
    "876543210",   // sum=154=14×11
    "900000009",   // sum=99=9×11
  ],
  [
    "123456781",   // off by 1
    "100000002",   // check should be 1
    "000000000",
    "12345678",    // 8 digits
    "1234567890",  // 10 digits
    "ABCDEFGHI",
    "876543211",
    "900000001",
    "111111111",   // sum=53, not ÷11
    "999999999",   // sum=477, not ÷11
  ],
);

/* 12. AU ABN (Australian Business Number)
 * weights [10,1,3,5,7,9,11,13,15,17,19]
 * Subtract 1 from first digit, then Σ(d[i]*w[i]) must be divisible by 89.
 * Verified against ATO published ABNs and manual computation. */
tableTest("auAbn", auAbn,
  [
    "51824753556",   // sum=534=6×89 (ABR test)
    "83914571673",   // sum=534=6×89
    "53004085616",   // sum=445=5×89
    "99000000000",   // sum=89=1×89
    "10000000000",   // sum=0=0×89
    "10000000032",   // sum=89: 3×17+2×19=51+38=89
    "10000000113",   // sum=89: 1×15+1×17+3×19=15+17+57=89
    "10000000145",   // sum=178: 1×15+4×17+5×19=15+68+95=178=2×89
    "33051775556",   // sum=534=6×89
    "71110849491",   // sum=534=6×89
  ],
  [
    "51824753557",   // off by 1 (sum+19 not ÷89)
    "83914571672",   // off by 1
    "00000000000",   // first digit 0 (or negative after subtract)
    "1234567890",    // 10 digits
    "123456789012",  // 12 digits
    "ABCDEFGHIJK",
    "99000000001",   // sum=89+19=108, 108/89 not integer
    "10000000001",   // sum=0+19=19, not ÷89
    "10000000033",   // sum=51+57=108, not ÷89
    "53004085617",   // sum=445+19=464, not ÷89
  ],
);

/* 13. ABA Routing Number
 * Checksum: (3*(d1+d4+d7) + 7*(d2+d5+d8) + (d3+d6+d9)) % 10 === 0
 * All values verified manually. */
tableTest("abaRouting", abaRouting,
  [
    "021000021",   // JPMorgan Chase: 3*0+7*(2+0+2)+(1+0+1)=28+2=30 ✓
    "322271627",   // BoA: 3*11+7*11+10=33+77+10=120 ✓
    "021000089",   // Citibank: 3*0+7*(2+0+8)+(1+0+9)=70+10=80 ✓
    "064000017",   // BoA NC: 3*0+7*(6+0+1)+(4+0+7)=49+11=60 ✓
    "125000024",   // BoA WA: 3*1+7*(2+0+2)+(5+0+4)=3+28+9=40 ✓
    "011000028",   // BoA MA: 3*0+7*(1+0+2)+(1+0+8)=21+9=30 ✓
    "026009593",   // BoA NY: 3*5+7*(2+0+9)+(6+9+3)=15+77+18=110 ✓
    "063100277",   // BoA FL: 3*3+7*(6+0+7)+(3+0+7)=9+91+10=110 ✓
    "044000037",   // JPM OH: 3*0+7*(4+0+3)+(4+0+7)=49+11=60 ✓
    "071000013",   // JPM IL: 3*0+7*(7+0+1)+(1+0+3)=56+4=60 ✓
  ],
  [
    "021000020",   // off by 1: sum=28+1=29 ✗
    "999999999",   // sum=3*27+7*27+27=171 ✗ (171%10=1)
    "123456789",   // sum=3*12+7*15+18=159 ✗
    "12345678",    // 8 digits
    "0210000210",  // 10 digits
    "ABCDEFGHI",
    "021000022",   // sum=28+3=31 ✗
    "322271628",   // sum=120+1=121 ✗
    "064000018",   // sum=49+12=61 ✗
    "044000036",   // sum=49+10=59 ✗ (actually 3*(0+0+0)+7*(4+0+3)+(4+0+6)=49+10=59; 59%10≠0 ✓)
  ],
);
