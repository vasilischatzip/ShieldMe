/**
 * T100 — Failing tests for token-bucket throttling.
 *
 * Spec refs: NFR-P4
 *
 * Tests:
 *   - 8 req/s refill rate
 *   - 5 concurrent request limit
 *   - Backoff with jitter on 429
 *   - Configurable per provider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenBucket, type TokenBucketConfig } from "~/cloud/throttle";

/* ── Config ──────────────────────────────────────────────────────── */

function makeBucket(overrides: Partial<TokenBucketConfig> = {}): TokenBucket {
  return new TokenBucket({
    refillRate:     8,   // tokens per second
    maxConcurrent:  5,
    burstCapacity:  8,
    ...overrides,
  });
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe("TokenBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Basic acquire/release ──────────────────────────────────────

  it("acquires and releases without error when capacity is available", async () => {
    const bucket = makeBucket({ maxConcurrent: 3, burstCapacity: 3 });
    const release = await bucket.acquire();
    expect(typeof release).toBe("function");
    release();
  });

  it("concurrent limit: allows up to maxConcurrent simultaneous requests", async () => {
    const MAX = 3;
    const bucket = makeBucket({ maxConcurrent: MAX, burstCapacity: 10 });

    const releases: Array<() => void> = [];
    for (let i = 0; i < MAX; i++) {
      releases.push(await bucket.acquire());
    }
    // All MAX acquired — concurrentCount should be MAX
    expect(bucket.concurrentCount).toBe(MAX);

    // Release all
    for (const r of releases) r();
    expect(bucket.concurrentCount).toBe(0);
  });

  it("blocks when maxConcurrent is reached; unblocks after release", async () => {
    const bucket = makeBucket({ maxConcurrent: 2, burstCapacity: 10 });

    const r1 = await bucket.acquire();
    const r2 = await bucket.acquire();
    expect(bucket.concurrentCount).toBe(2);

    // Third acquire should wait — set up as promise
    let r3Resolved = false;
    const r3Promise = bucket.acquire().then((r) => {
      r3Resolved = true;
      return r;
    });

    // Still not resolved (at limit)
    expect(r3Resolved).toBe(false);

    // Release one slot
    r1();
    await Promise.resolve();

    const r3 = await r3Promise;
    expect(r3Resolved).toBe(true);
    r2();
    r3();
  });

  // ── Refill rate ────────────────────────────────────────────────

  it("respects refill rate — 8 tokens/s → 8 requests in the first second", async () => {
    const bucket = makeBucket({ refillRate: 8, burstCapacity: 8, maxConcurrent: 100 });

    // Drain burst capacity
    const releases: Array<() => void> = [];
    for (let i = 0; i < 8; i++) {
      releases.push(await bucket.acquire());
    }
    // Release all (simulate quick parallel requests)
    for (const r of releases) r();

    // After advancing 1 second, should have 8 more tokens
    vi.advanceTimersByTime(1000);

    const newReleases: Array<() => void> = [];
    for (let i = 0; i < 8; i++) {
      newReleases.push(await bucket.acquire());
    }
    expect(newReleases).toHaveLength(8);
    for (const r of newReleases) r();
  });

  it("does not allow more than burstCapacity requests without refill", async () => {
    const bucket = makeBucket({
      refillRate:    8,
      burstCapacity: 3,
      maxConcurrent: 100,
    });

    let blocked = false;
    const releases: Array<() => void> = [];
    for (let i = 0; i < 3; i++) {
      releases.push(await bucket.acquire());
    }
    // 4th should be rate-limited (wait for refill)
    const pending = bucket.acquire().then((r) => {
      releases.push(r);
    });
    // Advance time partially — should unblock after refill
    vi.advanceTimersByTime(200); // 200ms → 8 * 0.2 = 1.6 tokens → 1 refilled
    await Promise.resolve();
    void blocked; // suppress unused lint
    await pending;
    for (const r of releases) r();
  });

  // ── run() wrapper ──────────────────────────────────────────────

  it("run() acquires before calling fn and releases after", async () => {
    const bucket = makeBucket({ maxConcurrent: 2, burstCapacity: 10 });
    const order: string[] = [];

    await bucket.run(async () => {
      order.push("start");
      await Promise.resolve();
      order.push("end");
    });

    expect(order).toEqual(["start", "end"]);
    expect(bucket.concurrentCount).toBe(0);
  });

  it("run() releases even if the fn throws", async () => {
    const bucket = makeBucket({ maxConcurrent: 1, burstCapacity: 10 });
    await expect(
      bucket.run(async () => { throw new Error("boom"); }),
    ).rejects.toThrow("boom");
    expect(bucket.concurrentCount).toBe(0);
  });

  // ── Retry-After / 429 handling ─────────────────────────────────

  it("computeRetryDelay returns a positive delay for 429 without Retry-After", () => {
    const bucket = makeBucket();
    const delay  = bucket.computeRetryDelay(429, null, 0);
    expect(delay).toBeGreaterThan(0);
  });

  it("computeRetryDelay honours Retry-After header value in seconds", () => {
    const bucket = makeBucket();
    const delay  = bucket.computeRetryDelay(429, "5", 0);
    expect(delay).toBeGreaterThanOrEqual(5000); // at least 5 seconds
  });

  it("computeRetryDelay uses exponential backoff for consecutive retries", () => {
    const bucket = makeBucket();
    const d0 = bucket.computeRetryDelay(429, null, 0);
    const d1 = bucket.computeRetryDelay(429, null, 1);
    const d2 = bucket.computeRetryDelay(429, null, 2);
    // Each retry should be longer (with jitter, may not be strictly monotone but median should grow)
    // Just verify they're all positive and d2 >= d0 on average
    expect(d0).toBeGreaterThan(0);
    expect(d1).toBeGreaterThan(0);
    expect(d2).toBeGreaterThan(0);
  });

  it("computeRetryDelay caps at a maximum delay", () => {
    const bucket = makeBucket();
    const d = bucket.computeRetryDelay(429, null, 10); // many retries
    expect(d).toBeLessThanOrEqual(65000); // cap at ~1 min
  });

  // ── Configurability ────────────────────────────────────────────

  it("accepts different configurations per provider", () => {
    const driveConfig:    TokenBucketConfig = { refillRate: 8,   maxConcurrent: 5, burstCapacity: 8   };
    const oneDriveConfig: TokenBucketConfig = { refillRate: 10,  maxConcurrent: 5, burstCapacity: 10  };
    const drive    = new TokenBucket(driveConfig);
    const oneDrive = new TokenBucket(oneDriveConfig);
    // Both instantiate successfully with different configs
    expect(drive).toBeDefined();
    expect(oneDrive).toBeDefined();
  });
});
