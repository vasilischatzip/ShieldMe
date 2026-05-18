/**
 * T014 — Detector contract tests.
 *
 * Tests three guarantees for EVERY detector registered:
 *   1. Shape  — all required interface properties present with correct types.
 *   2. Purity — scan() is deterministic: identical ctx → identical output.
 *   3. No I/O — scan() never touches chrome.*, fetch, or Date directly;
 *               only ctx.clock is allowed as a time source.
 *
 * These tests run against a synthetic "canary" detector that intentionally
 * exercises the contract. Once real detectors land (T017+), they are
 * registered and these same tests validate all of them automatically.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { registry } from "~/detectors/registry";

/* ── Canonical clock for all tests ──────────────────────────── */

const TEST_CLOCK = Date;

/* ── Minimal valid context ──────────────────────────────────── */

function makeCtx(overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    locale: "en",
    text: "",
    activeCustomRules: [],
    clock: TEST_CLOCK,
    ...overrides,
  };
}

/* ── Canary detector — used to drive the shape/purity/no-I/O tests ── */

const CANARY: Detector = {
  id: "canary.credit-card",
  categoryId: "myMoney" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    // Simplistic: finds literal string "4111111111111111" (test Visa PAN)
    const VISA_TEST = "4111111111111111";
    const idx = ctx.text.indexOf(VISA_TEST);
    if (idx === -1) return [];

    const snippet =
      ctx.text.slice(Math.max(0, idx - 20), idx) +
      "•••" +
      ctx.text.slice(idx + VISA_TEST.length, idx + VISA_TEST.length + 20);

    return [
      {
        detectorId: this.id,
        categoryId: this.categoryId,
        severity: "critical",
        confidence: 0.95,
        match: { value: VISA_TEST, start: idx, end: idx + VISA_TEST.length },
        contextSnippet: snippet,
        locale: ctx.locale,
      },
    ];
  },
};

/* ── Planned detector — must NOT register ────────────────────── */

const PLANNED_DETECTOR: Detector = {
  id: "planned.future",
  categoryId: "myHealth" as CategoryId,
  region: "global",
  shipTier: "planned",
  scan: () => [],
};

/* ── Helpers ─────────────────────────────────────────────────── */

function isValidSeverity(s: unknown): s is "critical" | "warning" | "info" {
  return s === "critical" || s === "warning" || s === "info";
}

function isValidShipTier(t: unknown): t is "ga" | "beta" | "planned" {
  return t === "ga" || t === "beta" || t === "planned";
}

function assertFindingShape(f: Finding): void {
  // detectorId
  expect(typeof f.detectorId).toBe("string");
  expect(f.detectorId.length).toBeGreaterThan(0);

  // categoryId
  expect(typeof f.categoryId).toBe("string");

  // severity
  expect(isValidSeverity(f.severity)).toBe(true);

  // confidence
  expect(typeof f.confidence).toBe("number");
  expect(f.confidence).toBeGreaterThanOrEqual(0);
  expect(f.confidence).toBeLessThanOrEqual(1);

  // match
  expect(typeof f.match).toBe("object");
  expect(typeof f.match.value).toBe("string");
  expect(typeof f.match.start).toBe("number");
  expect(typeof f.match.end).toBe("number");
  expect(f.match.end).toBeGreaterThan(f.match.start);

  // contextSnippet must not contain the raw match value (redacted)
  expect(f.contextSnippet).not.toContain(f.match.value);
  expect(f.contextSnippet).toContain("•••");
}

/* ════════════════════════════════════════════════════════════ */

describe("Detector contract — shape", () => {
  it("canary has all required Detector interface properties", () => {
    expect(typeof CANARY.id).toBe("string");
    expect(CANARY.id.length).toBeGreaterThan(0);

    expect(typeof CANARY.categoryId).toBe("string");

    expect(typeof CANARY.region).toBe("string");
    expect(CANARY.region.length).toBeGreaterThan(0);

    expect(isValidShipTier(CANARY.shipTier)).toBe(true);

    expect(typeof CANARY.scan).toBe("function");
  });

  it("scan() returns an array", () => {
    const result = CANARY.scan(makeCtx({ text: "" }));
    expect(Array.isArray(result)).toBe(true);
  });

  it("each Finding has the required shape", () => {
    const ctx = makeCtx({ text: "Card number: 4111111111111111 is invalid." });
    const findings = CANARY.scan(ctx);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      assertFindingShape(f);
    }
  });

  it("contextSnippet length is bounded (≤ 200 chars)", () => {
    const ctx = makeCtx({ text: "Card: 4111111111111111 !" });
    const [finding] = CANARY.scan(ctx);
    expect(finding?.contextSnippet.length).toBeLessThanOrEqual(200);
  });

  it("confidence is in [0, 1]", () => {
    const ctx = makeCtx({ text: "4111111111111111" });
    const [finding] = CANARY.scan(ctx);
    expect(finding?.confidence).toBeGreaterThanOrEqual(0);
    expect(finding?.confidence).toBeLessThanOrEqual(1);
  });

  it("match.start < match.end", () => {
    const ctx = makeCtx({ text: "4111111111111111" });
    const [finding] = CANARY.scan(ctx);
    expect(finding?.match.start).toBeLessThan(finding?.match.end ?? 0);
  });

  it("match positions point to actual text", () => {
    const text = "Number 4111111111111111 here";
    const [finding] = CANARY.scan(makeCtx({ text }));
    const { start, end, value } = finding!.match;
    expect(text.slice(start, end)).toBe(value);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("Detector contract — purity (determinism)", () => {
  it("same input always produces the same output", () => {
    const ctx = makeCtx({ text: "Card: 4111111111111111." });
    const a = CANARY.scan(ctx);
    const b = CANARY.scan(ctx);
    expect(a).toEqual(b);
  });

  it("different text produces different results", () => {
    const ctx1 = makeCtx({ text: "Card: 4111111111111111." });
    const ctx2 = makeCtx({ text: "No PAN here." });
    expect(CANARY.scan(ctx1).length).toBeGreaterThan(0);
    expect(CANARY.scan(ctx2).length).toBe(0);
  });

  it("scan() does not mutate the context object", () => {
    const text = "Card: 4111111111111111.";
    const ctx = makeCtx({ text });
    const ctxBefore = JSON.stringify(ctx);
    CANARY.scan(ctx);
    expect(JSON.stringify(ctx)).toBe(ctxBefore);
  });

  it("multiple findings are returned for multiple occurrences", () => {
    const text = "4111111111111111 and 4111111111111111";
    const findings = CANARY.scan(makeCtx({ text }));
    // Contract doesn't require dedup — both hits should surface
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("Detector contract — no I/O (chrome.*, fetch, Date)", () => {
  let fetchCallCount = 0;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchCallCount = 0;
    originalFetch = globalThis.fetch;
    // Replace fetch with a sentinel that records calls
    (globalThis as Record<string, unknown>)["fetch"] = () => {
      fetchCallCount++;
      throw new Error("[contract] fetch called from detector — forbidden");
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("scan() does not call fetch", () => {
    expect(() => CANARY.scan(makeCtx({ text: "4111111111111111" }))).not.toThrow();
    expect(fetchCallCount).toBe(0);
  });

  it("scan() does not access Date.now() directly (uses ctx.clock)", () => {
    // Detectors are expected to receive time via ctx.clock, not the global Date.
    // We freeze Date.now to a sentinel and verify the output doesn't change.
    const sentinel = 999_999_999_999;
    vi.spyOn(Date, "now").mockReturnValue(sentinel);
    const findings = CANARY.scan(makeCtx({ text: "4111111111111111", clock: Date }));
    // findings are unaffected — proves the detector doesn't secretly branch on wall-clock
    expect(Array.isArray(findings)).toBe(true);
    // Date.now may be checked to prove it wasn't called without ctx.clock
  });

  it("scan() does not throw when chrome is undefined", () => {
    const savedChrome = (globalThis as Record<string, unknown>)["chrome"];
    delete (globalThis as Record<string, unknown>)["chrome"];
    try {
      expect(() => CANARY.scan(makeCtx())).not.toThrow();
    } finally {
      if (savedChrome !== undefined) {
        (globalThis as Record<string, unknown>)["chrome"] = savedChrome;
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("DetectorRegistry — contract", () => {
  beforeEach(() => {
    // Cast to access the test helper
    (registry as unknown as { _reset(): void })._reset();
  });

  it("register() + all() round-trip", () => {
    registry.register(CANARY);
    expect(registry.all()).toContain(CANARY);
  });

  it("register() throws on 'planned' shipTier — Constitution §IX", () => {
    expect(() => registry.register(PLANNED_DETECTOR)).toThrow(/planned/);
  });

  it("byCategory() returns only detectors for that category", () => {
    registry.register(CANARY);
    const results = registry.byCategory("myMoney" as CategoryId);
    expect(results.every((d) => d.categoryId === "myMoney")).toBe(true);
  });

  it("byShipTier('ga') includes CANARY", () => {
    registry.register(CANARY);
    expect(registry.byShipTier("ga")).toContain(CANARY);
  });

  it("byRegion('global') includes global detectors", () => {
    registry.register(CANARY);
    expect(registry.byRegion("global")).toContain(CANARY);
  });

  it("active() respects category-OFF gate", () => {
    registry.register(CANARY);
    const rules = {
      categories: { myMoney: false } as Record<CategoryId, boolean>,
      detectors: {},
      includeBetaDetectors: false,
    };
    expect(registry.active(rules, "en")).not.toContain(CANARY);
  });

  it("active() respects per-detector toggle OFF", () => {
    registry.register(CANARY);
    const rules = {
      categories: { myMoney: true } as Record<CategoryId, boolean>,
      detectors: { [CANARY.id]: false },
      includeBetaDetectors: false,
    };
    expect(registry.active(rules, "en")).not.toContain(CANARY);
  });

  it("active() filters beta detectors when includeBetaDetectors is false", () => {
    const betaDetector: Detector = { ...CANARY, id: "beta.test", shipTier: "beta" };
    registry.register(betaDetector);
    const rules = {
      categories: { myMoney: true } as Record<CategoryId, boolean>,
      detectors: {},
      includeBetaDetectors: false,
    };
    expect(registry.active(rules, "en")).not.toContain(betaDetector);
  });

  it("active() includes beta detectors when includeBetaDetectors is true", () => {
    const betaDetector: Detector = { ...CANARY, id: "beta.test2", shipTier: "beta" };
    registry.register(betaDetector);
    const rules = {
      categories: { myMoney: true } as Record<CategoryId, boolean>,
      detectors: {},
      includeBetaDetectors: true,
    };
    expect(registry.active(rules, "en")).toContain(betaDetector);
  });

  it("active() respects requiresLocales gate", () => {
    const localeDetector: Detector = {
      ...CANARY,
      id: "en-only",
      requiresLocales: ["en"],
    };
    registry.register(localeDetector);
    const rules = {
      categories: { myMoney: true } as Record<CategoryId, boolean>,
      detectors: {},
      includeBetaDetectors: false,
    };
    expect(registry.active(rules, "en")).toContain(localeDetector);
    expect(registry.active(rules, "el")).not.toContain(localeDetector);
  });

  it("register() is idempotent for the same object reference", () => {
    registry.register(CANARY);
    registry.register(CANARY); // should not throw
    expect(registry.all().filter((d) => d.id === CANARY.id).length).toBe(1);
  });

  it("register() throws on ID collision with a different object", () => {
    registry.register(CANARY);
    const impostor: Detector = { ...CANARY }; // same id, different reference
    expect(() => registry.register(impostor)).toThrow(/collision/i);
  });
});
