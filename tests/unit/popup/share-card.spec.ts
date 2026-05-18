/**
 * T029a — ShareCard unit tests.
 *
 * Key acceptance criterion: AC-D4
 *   "The share card image must contain zero PII detectable by the scan engine."
 *
 * Approach: `cardTextLines()` is a pure function that returns exactly the text
 * that would appear on the rendered PNG.  We scan those lines with ALL active
 * detectors (GA + Beta, every category ON) and assert zero findings.
 *
 * Canvas rendering (renderToCanvas) is smoke-tested for crash-safety only —
 * jsdom's canvas stubs return null for getContext(), which the implementation
 * must handle gracefully.
 */
import { describe, it, expect } from "vitest";
import {
  cardTextLines,
  renderToCanvas,
} from "../../../src/app/components/ShareCard";
import type { ShareCardProps } from "../../../src/detectors/types";
// scanText imports all detector barrels via its own side-effect imports
import { scanText } from "~/core/scan-engine";
import type { Rules } from "~/detectors/types";

/* ── Helpers ─────────────────────────────────────────────────── */

function allRules(): Rules {
  return {
    categories: {
      myMoney:       true,
      myIdentity:    true,
      myHealth:      true,
      myFamily:      true,
      myDigitalLife: true,
      myLocation:    true,
    },
    detectors:            {},
    includeBetaDetectors: true,
  };
}

function safeProps(overrides: Partial<ShareCardProps> = {}): ShareCardProps {
  return {
    score:         87,
    criticalCount: 0,
    warningCount:  2,
    url:           "https://shieldme.app",
    ...overrides,
  };
}

/* ── AC-D4: card text must be PII-free ───────────────────────── */

describe("ShareCard — AC-D4 zero PII in card text", () => {
  it("high-score card text (87, Good) produces zero detector findings", async () => {
    const text = cardTextLines(safeProps({ score: 87, criticalCount: 0, warningCount: 0 })).join("\n");
    const result = await scanText(text, allRules(), { locale: "en" });
    expect(result.findings).toHaveLength(0);
  });

  it("low-score card text (12, High Risk) produces zero detector findings", async () => {
    const text = cardTextLines(safeProps({ score: 12, criticalCount: 5, warningCount: 8 })).join("\n");
    const result = await scanText(text, allRules(), { locale: "en" });
    expect(result.findings).toHaveLength(0);
  });

  it("perfect score 100 produces zero detector findings", async () => {
    const text = cardTextLines(safeProps({ score: 100, criticalCount: 0, warningCount: 0 })).join("\n");
    const result = await scanText(text, allRules(), { locale: "en" });
    expect(result.findings).toHaveLength(0);
  });

  it("score 0 (worst) produces zero detector findings", async () => {
    const text = cardTextLines(safeProps({ score: 0, criticalCount: 10, warningCount: 3 })).join("\n");
    const result = await scanText(text, allRules(), { locale: "en" });
    expect(result.findings).toHaveLength(0);
  });

  it("mid-range score (55, OK) produces zero detector findings", async () => {
    const text = cardTextLines(safeProps({ score: 55, criticalCount: 1, warningCount: 4 })).join("\n");
    const result = await scanText(text, allRules(), { locale: "en" });
    expect(result.findings).toHaveLength(0);
  });
});

/* ── Card text structure ─────────────────────────────────────── */

describe("cardTextLines structure", () => {
  it("returns at least 5 lines", () => {
    expect(cardTextLines(safeProps()).length).toBeGreaterThanOrEqual(5);
  });

  it("includes 'ShieldMe' branding", () => {
    const lines = cardTextLines(safeProps());
    expect(lines.some(l => l.includes("ShieldMe"))).toBe(true);
  });

  it("includes the score as a string", () => {
    expect(cardTextLines(safeProps({ score: 73 }))).toContain("73");
  });

  it("includes 'Good' label for score >= 85", () => {
    const lines = cardTextLines(safeProps({ score: 90 }));
    expect(lines.some(l => /good/i.test(l))).toBe(true);
  });

  it("includes a risk label for score < 30", () => {
    const lines = cardTextLines(safeProps({ score: 15 }));
    expect(lines.some(l => /risk/i.test(l))).toBe(true);
  });

  it("includes 'OK' label for score in 60-84 range", () => {
    const lines = cardTextLines(safeProps({ score: 72 }));
    expect(lines.some(l => /\bOK\b/i.test(l))).toBe(true);
  });

  it("includes the URL", () => {
    const lines = cardTextLines(safeProps({ url: "https://shieldme.app" }));
    expect(lines.some(l => l.includes("shieldme.app"))).toBe(true);
  });

  it("line containing score has no surrounding noise (just the number)", () => {
    const lines = cardTextLines(safeProps({ score: 42 }));
    expect(lines).toContain("42");
  });
});

/* ── renderToCanvas crash safety ─────────────────────────────── */

describe("renderToCanvas", () => {
  it("does not throw when canvas 2D context is unavailable (jsdom)", () => {
    const canvas = document.createElement("canvas");
    // jsdom returns null from getContext("2d") — must not throw
    expect(() => renderToCanvas(safeProps(), canvas)).not.toThrow();
  });

  it("sets canvas width and height unconditionally", () => {
    const canvas = document.createElement("canvas");
    renderToCanvas(safeProps(), canvas);
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
  });

  it("width is greater than height (landscape card)", () => {
    const canvas = document.createElement("canvas");
    renderToCanvas(safeProps(), canvas);
    expect(canvas.width).toBeGreaterThan(canvas.height);
  });
});
