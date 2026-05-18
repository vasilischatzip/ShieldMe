/**
 * T001 — FakeScanEngine test double.
 *
 * Implements the ScanEngine interface so callers (popup, background, content
 * scripts) can be tested without actually running detectors.
 *
 * Usage:
 *
 *   const fake = new FakeScanEngine();
 *
 *   // Return a specific result every call:
 *   fake._setResult({ findings: [...], score: 42, durationMs: 1, detectorRunId: "X" });
 *
 *   // Return a specific finding list (result fields auto-filled):
 *   fake._setFindings([myFinding]);
 *
 *   // Assert calls:
 *   expect(fake.callCount).toBe(1);
 *   expect(fake.lastRequest).toMatchObject({ module: "document-check" });
 *
 *   // Reset between tests:
 *   fake._reset();
 */
import type {
  Finding,
  ScanEngine,
  ScanRequest,
  ScanResult,
} from "~/detectors/types";

const EMPTY_RESULT: ScanResult = {
  findings: [],
  score: 0,
  durationMs: 0,
  detectorRunId: "FAKE-00000000",
};

export class FakeScanEngine implements ScanEngine {
  private _result: ScanResult = EMPTY_RESULT;

  // ── Observability ──────────────────────────────────────────────

  /** Number of times scan() has been called since last _reset(). */
  callCount = 0;

  /** The most recent ScanRequest received by scan(). */
  lastRequest: ScanRequest | null = null;

  /** All requests received since last _reset(), in order. */
  allRequests: ScanRequest[] = [];

  // ── ScanEngine interface ───────────────────────────────────────

  async scan(req: ScanRequest): Promise<ScanResult> {
    this.callCount++;
    this.lastRequest = req;
    this.allRequests.push(req);
    return structuredClone
      ? structuredClone(this._result)
      : JSON.parse(JSON.stringify(this._result)) as ScanResult;
  }

  // ── Test helpers ───────────────────────────────────────────────

  /** Set the full result object returned by every subsequent scan() call. */
  _setResult(result: ScanResult): void {
    this._result = result;
  }

  /**
   * Convenience: set just the findings list; score and other fields
   * are derived from a sensible default.
   */
  _setFindings(findings: Finding[], score = 0): void {
    this._result = {
      findings,
      score,
      durationMs: 0,
      detectorRunId: "FAKE-FINDINGS",
    };
  }

  /** Reset call tracking and restore empty result. */
  _reset(): void {
    this._result = EMPTY_RESULT;
    this.callCount = 0;
    this.lastRequest = null;
    this.allRequests = [];
  }
}
