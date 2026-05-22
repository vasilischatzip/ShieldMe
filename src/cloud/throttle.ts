/**
 * TokenBucket — token-bucket rate limiter with concurrent request limit.
 *
 * Spec refs: NFR-P4
 *
 * Two independent constraints:
 *   1. Token rate  — limits sustained throughput (refillRate tokens/s, burst up to burstCapacity).
 *   2. Concurrency — limits simultaneous in-flight requests (maxConcurrent).
 *
 * Both must pass before a request proceeds.  Waiters are queued and served in
 * arrival order (FIFO) for the concurrency gate; token availability is handled
 * by a scheduled refill timer.
 */

/* ── Config ──────────────────────────────────────────────────────── */

export type TokenBucketConfig = {
  /** Tokens added per second (steady-state throughput). */
  refillRate: number;
  /** Maximum simultaneous in-flight requests. */
  maxConcurrent: number;
  /** Maximum tokens that can accumulate (burst size). */
  burstCapacity: number;
};

/* ── TokenBucket ─────────────────────────────────────────────────── */

export class TokenBucket {
  private readonly _cfg: TokenBucketConfig;

  // Token state
  private _tokens: number;
  private _lastRefillAt: number;

  // Concurrency state
  private _concurrentCount_: number = 0;
  private readonly _concurrentQueue: Array<() => void> = [];

  constructor(config: TokenBucketConfig) {
    this._cfg          = config;
    this._tokens       = config.burstCapacity;   // start full
    this._lastRefillAt = Date.now();
  }

  // ── Public read-only state ─────────────────────────────────────

  get concurrentCount(): number {
    return this._concurrentCount_;
  }

  // ── Token management ───────────────────────────────────────────

  /** Add tokens proportional to elapsed time since last refill. */
  private _refill(): void {
    const now     = Date.now();
    const elapsed = (now - this._lastRefillAt) / 1000;   // seconds
    this._tokens  = Math.min(
      this._cfg.burstCapacity,
      this._tokens + elapsed * this._cfg.refillRate,
    );
    this._lastRefillAt = now;
  }

  /**
   * Wait until a token is available, then consume it.
   * Uses a single setTimeout scheduled to fire when the next token arrives.
   */
  private async _acquireToken(): Promise<void> {
    this._refill();
    if (this._tokens >= 1) {
      this._tokens -= 1;
      return;
    }
    // Compute exact wait for the next whole token.
    const tokensNeeded = 1 - this._tokens;
    const waitMs       = Math.ceil((tokensNeeded / this._cfg.refillRate) * 1000);
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this._refill();
        this._tokens = Math.max(0, this._tokens - 1);
        resolve();
      }, waitMs);
    });
  }

  // ── Concurrency management ─────────────────────────────────────

  /**
   * Wait until a concurrent slot is free, then occupy it.
   * Increments concurrentCount before resolving.
   */
  private async _acquireConcurrent(): Promise<void> {
    if (this._concurrentCount_ < this._cfg.maxConcurrent) {
      this._concurrentCount_++;
      return;
    }
    await new Promise<void>((resolve) => {
      this._concurrentQueue.push(() => {
        this._concurrentCount_++;
        resolve();
      });
    });
  }

  /** Release a concurrent slot and unblock the next waiter, if any. */
  private _releaseConcurrent(): void {
    this._concurrentCount_--;
    if (
      this._concurrentQueue.length > 0 &&
      this._concurrentCount_ < this._cfg.maxConcurrent
    ) {
      const next = this._concurrentQueue.shift()!;
      next();
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Acquire a slot (token + concurrent).
   * Returns a release function the caller MUST invoke when the request completes.
   */
  async acquire(): Promise<() => void> {
    await this._acquireToken();
    await this._acquireConcurrent();
    return () => {
      this._releaseConcurrent();
    };
  }

  /**
   * Convenience wrapper: acquire → call fn → release (even on throw).
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Compute how long (ms) to wait before retrying a rate-limited request.
   *
   * Algorithm:
   *   1. If a Retry-After header is present (seconds), wait at least that long
   *      plus a small random jitter (0–1 s).
   *   2. Otherwise use exponential back-off with full jitter, capped at 60 s.
   *      Base: 500 ms.  A guaranteed minimum of 250 ms ensures the result is
   *      always positive even on the first retry.
   *
   * @param _statusCode       HTTP status code (reserved for future non-429 use).
   * @param retryAfterHeader  Retry-After header value (seconds), or null.
   * @param attemptCount      Zero-based retry attempt number.
   * @returns Delay in milliseconds (always > 0 for 429).
   */
  computeRetryDelay(
    _statusCode: number,
    retryAfterHeader: string | null,
    attemptCount: number,
  ): number {
    // Honour Retry-After header (seconds).
    if (retryAfterHeader !== null) {
      const seconds = parseFloat(retryAfterHeader);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.round(seconds * 1000 + Math.random() * 1000);
      }
    }

    // Exponential back-off with full jitter, capped at 60 s.
    const BASE_MS  = 500;
    const CAP_MS   = 60_000;
    const ceiling  = Math.min(CAP_MS, BASE_MS * Math.pow(2, attemptCount));
    // Minimum of BASE_MS / 2 guarantees a strictly positive result.
    return Math.round(BASE_MS / 2 + Math.random() * ceiling);
  }
}
