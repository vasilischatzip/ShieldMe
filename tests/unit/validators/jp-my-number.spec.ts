/**
 * T015ba — JP-MyNumber validator unit tests.
 *
 * ≥10 known-good (check-digit-valid) My Numbers and ≥10 known-bad cases.
 * All valid numbers were computed using the official Cabinet Office formula:
 *   weights = [6,5,4,3,2,7,6,5,4,3,2]; Q = Σ(di×wi); check = Q%11≤1 ? 0 : 11-Q%11
 */
import { describe, it, expect } from "vitest";
import { jpMyNumber } from "../../../src/detectors/validators/jp-my-number";

/* ── Known-valid My Numbers ─────────────────────────────────────
 * These are structurally valid test values — NOT real personal numbers.
 */
const VALID: string[] = [
  "123456789018", // check=8
  "100000000005", // check=5
  "999999999996", // check=6
  "200000000000", // check=0 (R=1 → check=0)
  "300000000004", // check=4
  "400000000009", // check=9
  "500000000003", // check=3
  "600000000008", // check=8
  "700000000002", // check=2
  "111100000004", // check=4
  "112233445501", // check=1
  "987654321000", // check=0
  "121212121217", // check=7
];

/* ── Known-invalid My Numbers ───────────────────────────────────
 * Wrong check digit, wrong length, or non-numeric.
 */
const INVALID: string[] = [
  "000000000001", // All-zeros prefix: check=0, so d12=1 ≠ 0 → invalid
  "123456789019", // Wrong check (valid is 8, not 9)
  "100000000004", // Wrong check (valid is 5)
  "999999999990", // Wrong check (valid is 6)
  "200000000001", // Wrong check (valid is 0)
  "12345678901",  // 11 digits — too short
  "1234567890123",// 13 digits — too long
  "abcdefghijkl", // Non-digits
  "111111111111", // check=1≠8 → invalid (Q=47, R=3, expected=8; actual=1)
  "222222222222", // check=2≠5 → invalid
  "123456789001", // Wrong check (prefix 12345678900 → check=0, not 1)
  "100000000009", // Wrong check (valid is 5)
];

describe("jpMyNumber", () => {
  describe("accepts known-valid My Numbers", () => {
    for (const n of VALID) {
      it(`accepts "${n}"`, () => {
        expect(jpMyNumber(n)).toBe(true);
      });
    }
  });

  describe("accepts with hyphens/spaces stripped", () => {
    it("accepts 1234-5678-9018", () => {
      expect(jpMyNumber("1234-5678-9018")).toBe(true);
    });
    it("accepts '1234 5678 9018'", () => {
      expect(jpMyNumber("1234 5678 9018")).toBe(true);
    });
  });

  describe("rejects known-invalid My Numbers", () => {
    for (const n of INVALID) {
      it(`rejects "${n}"`, () => {
        expect(jpMyNumber(n)).toBe(false);
      });
    }
  });

  it("rejects empty string", () => {
    expect(jpMyNumber("")).toBe(false);
  });

  it("rejects whitespace-only", () => {
    expect(jpMyNumber("            ")).toBe(false);
  });
});
