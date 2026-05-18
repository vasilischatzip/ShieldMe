/**
 * T049a — Badge display helper unit tests.
 *
 * Verifies that `badgeColor` and `badgeText` map score values to the
 * correct toolbar badge state across all tier boundaries.
 */
import { describe, it, expect } from "vitest";
import { badgeColor, badgeText } from "~/core/badge";

/* ── badgeColor tier boundaries ─────────────────────────────── */

describe("badgeColor", () => {
  it("returns green (#1e8e3e) for score 100 (perfect)", () => {
    expect(badgeColor(100)).toBe("#1e8e3e");
  });

  it("returns green (#1e8e3e) for score 85 (tier boundary)", () => {
    expect(badgeColor(85)).toBe("#1e8e3e");
  });

  it("returns green (#1e8e3e) for score 90", () => {
    expect(badgeColor(90)).toBe("#1e8e3e");
  });

  it("returns amber (#b07b00) for score 84 (just below good tier)", () => {
    expect(badgeColor(84)).toBe("#b07b00");
  });

  it("returns amber (#b07b00) for score 60 (ok tier boundary)", () => {
    expect(badgeColor(60)).toBe("#b07b00");
  });

  it("returns amber (#b07b00) for score 72", () => {
    expect(badgeColor(72)).toBe("#b07b00");
  });

  it("returns orange (#d9540b) for score 59 (just below ok tier)", () => {
    expect(badgeColor(59)).toBe("#d9540b");
  });

  it("returns orange (#d9540b) for score 30 (risk tier boundary)", () => {
    expect(badgeColor(30)).toBe("#d9540b");
  });

  it("returns orange (#d9540b) for score 45", () => {
    expect(badgeColor(45)).toBe("#d9540b");
  });

  it("returns red (#c5221f) for score 29 (just below risk tier)", () => {
    expect(badgeColor(29)).toBe("#c5221f");
  });

  it("returns red (#c5221f) for score 0 (worst)", () => {
    expect(badgeColor(0)).toBe("#c5221f");
  });

  it("returns red (#c5221f) for score 15", () => {
    expect(badgeColor(15)).toBe("#c5221f");
  });

  it("clamps scores above 100 to good tier", () => {
    expect(badgeColor(150)).toBe("#1e8e3e");
  });

  it("clamps negative scores to danger tier", () => {
    expect(badgeColor(-10)).toBe("#c5221f");
  });

  it("rounds fractional scores before comparing", () => {
    // 84.6 rounds to 85 → good tier
    expect(badgeColor(84.6)).toBe("#1e8e3e");
    // 84.4 rounds to 84 → ok tier
    expect(badgeColor(84.4)).toBe("#b07b00");
  });
});

/* ── badgeText ───────────────────────────────────────────────── */

describe("badgeText", () => {
  it("returns '100' for a perfect score", () => {
    expect(badgeText(100)).toBe("100");
  });

  it("returns '0' for the worst score", () => {
    expect(badgeText(0)).toBe("0");
  });

  it("returns the rounded score as a string", () => {
    expect(badgeText(87)).toBe("87");
    expect(badgeText(72.3)).toBe("72");
    expect(badgeText(29.7)).toBe("30");
  });

  it("clamps above 100 to '100'", () => {
    expect(badgeText(200)).toBe("100");
  });

  it("clamps below 0 to '0'", () => {
    expect(badgeText(-5)).toBe("0");
  });
});
