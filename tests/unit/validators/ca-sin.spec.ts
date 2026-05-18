/**
 * T015ba — CA-SIN validator unit tests.
 *
 * ≥10 known-good (Luhn-valid) SINs and ≥10 known-bad cases.
 * All valid SINs were verified with the Luhn algorithm (computed below).
 */
import { describe, it, expect } from "vitest";
import { caSin } from "../../../src/detectors/validators/ca-sin";

/* ── Known-good SINs ────────────────────────────────────────────
 * These are structurally valid (Luhn-verified) test values.
 * They are NOT real SINs belonging to any individual.
 */
const VALID: string[] = [
  "046454286", // Commonly published as a test SIN; first digit 0 (historical)
  "123456782", // Prefix 12345678, check=2 (sum 38+2=40)
  "987654324", // Prefix 98765432, check=4 (sum 46+4=50)
  "111111118", // Prefix 11111111, check=8 (sum 12+8=20)
  "999999998", // Prefix 99999999, check=8 (sum 72+8=80)
  "555555556", // Prefix 55555555, check=6 (sum 24+6=30)
  "777777772", // Prefix 77777777, check=2 (sum 48+2=50)
  "200000008", // Prefix 20000000, check=8 (sum 2+8=10)
  "300000007", // Prefix 30000000, check=7 (sum 3+7=10)
  "400000006", // Prefix 40000000, check=6 (sum 4+6=10)
  "500000005", // Prefix 50000000, check=5 (sum 5+5=10)
  "600000004", // Prefix 60000000, check=4 (sum 6+4=10)
  "700000003", // Prefix 70000000, check=3 (sum 7+3=10)
];

/* ── Known-invalid SINs ─────────────────────────────────────────
 * Wrong Luhn check, wrong length, or non-numeric.
 */
const INVALID: string[] = [
  "000000000", // All-zeros (Luhn rejects)
  "123456789", // Sequential — Luhn sum 47 ≠ 0
  "111111111", // All-ones — Luhn sum 13 ≠ 0
  "999999999", // All-nines — Luhn sum 81+9=90? let's check: 80+1=no, sum 81 ≠ 0
  "123456780", // Wrong check digit (valid is 2)
  "12345",     // Too short
  "1234567890",// 10 digits — too long
  "abc def gh",// Non-digits
  "000000010", // Luhn sum 2 ≠ 0
  "500000001", // Wrong check (valid is 5)
  "987654320", // Wrong check (valid is 4)
  "777777771", // Wrong check (valid is 2)
];

describe("caSin", () => {
  describe("accepts known-valid SINs (plain digits)", () => {
    for (const sin of VALID) {
      it(`accepts "${sin}"`, () => {
        expect(caSin(sin)).toBe(true);
      });
    }
  });

  describe("accepts hyphenated / spaced format", () => {
    it("accepts 046-454-286", () => {
      expect(caSin("046-454-286")).toBe(true);
    });
    it("accepts 123-456-782", () => {
      expect(caSin("123-456-782")).toBe(true);
    });
    it("accepts '046 454 286' (spaces)", () => {
      expect(caSin("046 454 286")).toBe(true);
    });
  });

  describe("rejects known-invalid SINs", () => {
    for (const sin of INVALID) {
      it(`rejects "${sin}"`, () => {
        expect(caSin(sin)).toBe(false);
      });
    }
  });

  it("rejects empty string", () => {
    expect(caSin("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(caSin("         ")).toBe(false);
  });
});
