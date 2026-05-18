/**
 * Document Check route — T061.
 *
 * Exposes a pure `scanFile()` function that orchestrates the full Document
 * Check scan flow:
 *
 *   1. TierGate: scan:monthly-limit check (free tier: 5/month).
 *   2. TierGate: scan:file-size check (free tier: 10 MB).
 *   3. parseFile() — text extraction (PDF, DOCX, XLSX, TXT, …).
 *   4. scanText() — detection engine.
 *
 * The function is pure (no Preact state, no chrome.* calls) so it is fully
 * unit-testable. UI state management wraps this function.
 *
 * Spec refs: FR-D1, FR-D2, FR-D3, FR-D4, FR-D7, AC-D1, AC-D2, AC-D3
 * Test: tests/unit/popup/routes/document-check.spec.tsx
 */
import { parseFile }              from "~/parsers/dispatch";
import { scanText }               from "~/core/scan-engine";
import type { TierGate }          from "~/core/tier-gate";
import type { Finding, Rules }    from "~/detectors/types";

/* ── Result types ────────────────────────────────────────────────── */

export type ScanFlowError =
  | { kind: "too-large";        sizeBytes: number;  limitBytes: number }
  | { kind: "monthly-limit";    usedScans: number;  limit: number }
  | { kind: "parse-failed";     detail: string }
  | { kind: "unsupported-format"; ext: string; mime: string }
  | { kind: "scan-failed";      detail: string };

export type ScanFlowResult =
  | {
      ok:          true;
      findings:    Finding[];
      score:       number;
      text:        string;
      sourceLabel: string;
      durationMs:  number;
    }
  | { ok: false; reason: ScanFlowError };

export interface ScanFileOpts {
  tierGate:       TierGate;
  rules:          Rules;
  locale:         string;
  /** Number of document scans performed so far in the current billing month. */
  scansThisMonth: number;
}

/* ── Core logic ──────────────────────────────────────────────────── */

/**
 * Orchestrate a full Document Check scan for a single File.
 *
 * Errors are returned as `{ ok: false, reason }` — never thrown — so the
 * caller can discriminate over `reason.kind` to show the right UI message.
 */
export async function scanFile(
  file: File,
  opts: ScanFileOpts,
): Promise<ScanFlowResult> {
  const { tierGate, rules, locale, scansThisMonth } = opts;

  // ── Step 1: monthly-limit gate ────────────────────────────────
  const monthlyCheck = await tierGate.check("scan:monthly-limit", {
    scansThisMonth,
  });
  if (!monthlyCheck.allowed) {
    return {
      ok: false,
      reason: {
        kind:      "monthly-limit",
        usedScans: scansThisMonth,
        limit:     typeof monthlyCheck.limit === "number" ? monthlyCheck.limit : 0,
      },
    };
  }

  // ── Step 2: file-size gate ────────────────────────────────────
  const sizeCheck = await tierGate.check("scan:file-size", { value: file.size });
  if (!sizeCheck.allowed) {
    return {
      ok: false,
      reason: {
        kind:       "too-large",
        sizeBytes:  file.size,
        limitBytes: typeof sizeCheck.limit === "number" ? sizeCheck.limit : 0,
      },
    };
  }

  // ── Step 3: parse file ────────────────────────────────────────
  let text: string;
  try {
    const parsed = await parseFile(file);
    if (!parsed.ok) {
      const r = parsed.reason;
      if (r.kind === "too-large") {
        return { ok: false, reason: { kind: "too-large", sizeBytes: r.sizeBytes, limitBytes: r.limitBytes } };
      }
      if (r.kind === "unsupported-format") {
        return { ok: false, reason: { kind: "unsupported-format", ext: r.ext, mime: r.mime } };
      }
      // decode-failed
      return { ok: false, reason: { kind: "parse-failed", detail: r.detail } };
    }
    text = parsed.text;
  } catch (err) {
    return {
      ok: false,
      reason: { kind: "parse-failed", detail: err instanceof Error ? err.message : String(err) },
    };
  }

  // ── Step 4: scan ──────────────────────────────────────────────
  try {
    const result = await scanText(text, rules, { locale });
    return {
      ok:          true,
      findings:    result.findings,
      score:       result.score,
      text,
      sourceLabel: file.name,
      durationMs:  result.durationMs,
    };
  } catch (err) {
    return {
      ok: false,
      reason: { kind: "scan-failed", detail: err instanceof Error ? err.message : String(err) },
    };
  }
}
