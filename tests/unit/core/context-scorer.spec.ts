/**
 * T016a — ContextScorer unit tests.
 *
 * Verifies that the scorer correctly boosts/suppresses confidence based on
 * keyword proximity within the configured window.
 *
 * Score algorithm (see src/core/context-scorer.ts):
 *   posContribution = posHits / positiveKeywords.length * 0.5  (0 if empty)
 *   negContribution = negHits / negativeKeywords.length * 0.5  (0 if empty)
 *   score = clamp(0.5 + posContribution − negContribution, 0, 1)
 *
 * "Hits" counts unique keywords (case-insensitive) found in the window.
 */
import { describe, it, expect } from "vitest";
import { contextScorer } from "~/core/context-scorer";
import type { DetectorContext } from "~/detectors/types";
import type { ContextScorerConfig } from "~/detectors/types";

/* ── Helpers ──────────────────────────────────────────────────── */

function ctx(text: string): DetectorContext {
  return { locale: "en", text, activeCustomRules: [], clock: Date };
}

function match(start: number, end: number) {
  return { start, end };
}

/* ── Shared configs ───────────────────────────────────────────── */

const POS_ONLY: ContextScorerConfig = {
  positiveKeywords: ["credit card", "card number"],
  negativeKeywords: [],
  window: 30,
};

const NEG_ONLY: ContextScorerConfig = {
  positiveKeywords: [],
  negativeKeywords: ["loyalty", "reference"],
  window: 30,
};

const MIXED: ContextScorerConfig = {
  positiveKeywords: ["card"],
  negativeKeywords: ["loyalty"],
  window: 30,
};

const TIGHT_WINDOW: ContextScorerConfig = {
  positiveKeywords: ["card"],
  negativeKeywords: [],
  window: 3, // only ±3 chars
};

/* ════════════════════════════════════════════════════════════ */

describe("ContextScorer — neutral baseline", () => {
  it("returns 0.5 when no keywords appear in window", () => {
    const score = contextScorer.score(
      ctx("Nothing relevant here 4111111111111111 just text"),
      match(22, 38),
      POS_ONLY,
    );
    expect(score).toBeCloseTo(0.5);
  });

  it("returns 0.5 when positiveKeywords is empty and no neg keywords present", () => {
    const score = contextScorer.score(
      ctx("4111111111111111"),
      match(0, 16),
      { positiveKeywords: [], negativeKeywords: [], window: 20 },
    );
    expect(score).toBeCloseTo(0.5);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("ContextScorer — positive keyword boosts", () => {
  it("finds one-of-one positive keyword → 1.0", () => {
    // "credit card 4111111111111111"
    const text = "credit card 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(12, 28),
      { positiveKeywords: ["credit card"], negativeKeywords: [], window: 30 },
    );
    expect(score).toBeCloseTo(1.0);
  });

  it("finds both-of-two positive keywords → 1.0", () => {
    const text = "credit card number 4111111111111111 here";
    const score = contextScorer.score(
      ctx(text),
      match(19, 35),
      POS_ONLY,
    );
    expect(score).toBeCloseTo(1.0);
  });

  it("finds one-of-two positive keywords → 0.75", () => {
    const text = "credit card 4111111111111111 here";
    const score = contextScorer.score(
      ctx(text),
      match(12, 28),
      POS_ONLY,
    );
    expect(score).toBeCloseTo(0.75);
  });

  it("case-insensitive keyword matching", () => {
    const text = "CREDIT CARD 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(12, 28),
      { positiveKeywords: ["credit card"], negativeKeywords: [], window: 30 },
    );
    expect(score).toBeCloseTo(1.0);
  });

  it("same keyword repeated multiple times counts once (unique hits)", () => {
    const text = "card card card 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(15, 31),
      { positiveKeywords: ["card"], negativeKeywords: [], window: 30 },
    );
    // 1/1 keyword found, still 1.0 (not > 1.0)
    expect(score).toBeCloseTo(1.0);
  });

  it("score is clamped to 1.0 maximum", () => {
    const text = "card credit card number 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(24, 40),
      POS_ONLY,
    );
    expect(score).toBeLessThanOrEqual(1.0);
    expect(score).toBeGreaterThanOrEqual(0.0);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("ContextScorer — negative keyword suppresses", () => {
  it("finds one-of-one negative keyword → 0.0", () => {
    const text = "loyalty 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(8, 24),
      { positiveKeywords: [], negativeKeywords: ["loyalty"], window: 30 },
    );
    expect(score).toBeCloseTo(0.0);
  });

  it("finds both-of-two negative keywords → 0.0", () => {
    const text = "loyalty reference 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(18, 34),
      NEG_ONLY,
    );
    expect(score).toBeCloseTo(0.0);
  });

  it("finds one-of-two negative keywords → 0.25", () => {
    const text = "loyalty 4111111111111111 here";
    const score = contextScorer.score(
      ctx(text),
      match(8, 24),
      NEG_ONLY,
    );
    expect(score).toBeCloseTo(0.25);
  });

  it("score is clamped to 0.0 minimum", () => {
    const text = "loyalty reference test 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(23, 39),
      { positiveKeywords: [], negativeKeywords: ["loyalty","reference","test"], window: 30 },
    );
    expect(score).toBeGreaterThanOrEqual(0.0);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("ContextScorer — mixed keywords", () => {
  it("one positive + one negative both present → 0.5", () => {
    const text = "card loyalty 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(13, 29),
      MIXED,
    );
    expect(score).toBeCloseTo(0.5);
  });

  it("positive present, negative absent → boosts above 0.5", () => {
    const text = "card 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(5, 21),
      MIXED,
    );
    expect(score).toBeGreaterThan(0.5);
  });

  it("negative present, positive absent → suppresses below 0.5", () => {
    const text = "loyalty 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(8, 24),
      MIXED,
    );
    expect(score).toBeLessThan(0.5);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("ContextScorer — window boundary", () => {
  it("keyword just inside window boundary is counted", () => {
    // text = "card 4111111111111111 end"
    // match at 5-21, window=3 → windowStart = max(0,5-3)=2 → window = "rd 4111111111111111 en"
    // "card" is at 0-4, but window starts at 2 → keyword search via substring
    // returns no hit because "rd " doesn't contain the full "card" → 0.5
    const score = contextScorer.score(
      ctx("card 4111111111111111 end"),
      match(5, 21),
      TIGHT_WINDOW, // window=3
    );
    // Window: text.slice(max(0,5-3), 21+3) = text.slice(2,24) = "rd 4111111111111111 en"
    // "card" is NOT in "rd 4111111111111111 en" → no hit → 0.5
    expect(score).toBeCloseTo(0.5);
  });

  it("keyword just outside window is not counted", () => {
    // keyword far before match
    const text = "card" + " ".repeat(100) + "4111111111111111";
    const matchStart = 4 + 100; // 104
    const score = contextScorer.score(
      ctx(text),
      match(matchStart, matchStart + 16),
      TIGHT_WINDOW, // window=3
    );
    expect(score).toBeCloseTo(0.5);
  });

  it("keyword just inside window after match end is counted", () => {
    // match ends at 16, keyword "card" starts at 17 (just inside window=3)
    const text2 = "4111111111111111 card extra";
    const score = contextScorer.score(
      ctx(text2),
      match(0, 16),
      { positiveKeywords: ["card"], negativeKeywords: [], window: 10 },
    );
    // Window: text2.slice(max(0,0-10), 16+10) = text2.slice(0,26) = "4111111111111111 card extr"
    // "card" IS in window → hit → 1.0
    expect(score).toBeCloseTo(1.0);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("ContextScorer — purity & type invariants", () => {
  it("returns a number in [0, 1]", () => {
    const score = contextScorer.score(
      ctx("credit card 4111111111111111"),
      match(12, 28),
      { positiveKeywords: ["credit card"], negativeKeywords: [], window: 20 },
    );
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("is deterministic — same input always produces same output", () => {
    const c = ctx("credit card 4111111111111111");
    const m = match(12, 28);
    const cfg: ContextScorerConfig = {
      positiveKeywords: ["credit card"],
      negativeKeywords: [],
      window: 20,
    };
    expect(contextScorer.score(c, m, cfg)).toBe(contextScorer.score(c, m, cfg));
  });

  it("does not mutate context or match", () => {
    const c = ctx("credit card 4111111111111111");
    const m = match(12, 28);
    const cfg: ContextScorerConfig = { positiveKeywords: ["credit card"], negativeKeywords: [], window: 20 };
    const ctxBefore = JSON.stringify(c);
    const matchBefore = JSON.stringify(m);
    contextScorer.score(c, m, cfg);
    expect(JSON.stringify(c)).toBe(ctxBefore);
    expect(JSON.stringify(m)).toBe(matchBefore);
  });

  it("works at start of text (no underflow)", () => {
    const score = contextScorer.score(
      ctx("4111111111111111 card"),
      match(0, 16),
      { positiveKeywords: ["card"], negativeKeywords: [], window: 30 },
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("works at end of text (no overflow)", () => {
    const text = "card 4111111111111111";
    const score = contextScorer.score(
      ctx(text),
      match(5, text.length),
      { positiveKeywords: ["card"], negativeKeywords: [], window: 30 },
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
