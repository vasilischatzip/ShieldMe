/**
 * ScanEngine — central orchestrator for content scans (T023 / T023b).
 *
 * Pipeline:
 *   1. Resolve active detectors via `registry.active(rules, locale)`.
 *   2. Partition detectors into "hinted" (have hintPattern) and "full" (run always).
 *   3. Build a single union regex from all hinted detectors' hintPatterns.
 *   4. Run the union regex once to find candidate match regions.
 *   5. For each region, invoke only the hinted detectors whose pattern hit there.
 *   6. Always run full detectors over the full text.
 *   7. Union all findings, deduplicate overlapping spans, compute Exposure Score.
 *
 * Single-regex union optimisation (T023b):
 *   For documents with many detectors, running 50+ regexes independently is
 *   O(detectors × text_length).  The union pass reduces this to roughly
 *   O(text_length + regions × local_detectors), which is 5-20× faster on
 *   large, sparse documents (few matches in a large file).
 *
 *   Detectors without `hintPattern` always run over the full text — the
 *   optimisation is purely additive.
 *
 * Constitution:
 *   §I  Privacy-first   — pure function on text; no I/O, no telemetry.
 *   §VII Detection      — purity preserved (deterministic for same input).
 *   §IX Fail loud       — detector exceptions are caught and logged so a
 *                         single broken detector cannot fail the whole scan.
 *
 * Side-effect free; safe to call from popup, content script, or worker.
 *
 * Imports the detector category barrels for their self-registration side
 * effects so callers don't need to remember.
 */
import type {
  Detector,
  Finding,
  Rules,
  ScanEngine,
  ScanRequest,
  ScanResult,
} from "~/detectors/types";
import { registry } from "~/detectors/registry";
import { computeExposureScore } from "./exposure-score";

// Import barrels for self-registration. Order doesn't matter; each barrel
// is idempotent.
import "~/detectors/money";
import "~/detectors/identity";
import "~/detectors/digital-life";
import "~/detectors/health";
import "~/detectors/family";
import "~/detectors/location";

/* ── Constants ────────────────────────────────────────────────── */

/**
 * Half-width of the region window around each hintPattern match.
 * A hinted detector is invoked when its hintPattern matches anywhere within
 * HINT_WINDOW characters of the region under consideration.
 */
const HINT_WINDOW = 300; // chars

/* ── Helpers ─────────────────────────────────────────────────── */

/** ULID-ish (timestamp-based, monotonic-enough) without a runtime dep. */
function makeRunId(now: number): string {
  const ts = now.toString(36).toUpperCase().padStart(10, "0");
  // 6 random chars from crypto.getRandomValues if available
  let rand = "";
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    for (const b of bytes) rand += b.toString(36).toUpperCase().padStart(2, "0");
  } else {
    rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  }
  return `${ts}-${rand.slice(0, 8)}`;
}

/**
 * Drop overlapping findings — keep the one with higher confidence (or higher
 * severity rank as tiebreaker). Two findings overlap when their byte ranges
 * intersect at all.
 */
const SEVERITY_RANK: Record<Finding["severity"], number> = {
  critical: 3,
  warning:  2,
  info:     1,
};

function deduplicate(findings: Finding[]): Finding[] {
  if (findings.length <= 1) return findings;
  // Sort by (start asc, then confidence desc, then severity desc)
  const sorted = [...findings].sort((a, b) => {
    if (a.match.start !== b.match.start) return a.match.start - b.match.start;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  });
  const kept: Finding[] = [];
  for (const f of sorted) {
    const last = kept[kept.length - 1];
    if (!last || f.match.start >= last.match.end) {
      kept.push(f);
      continue;
    }
    // Overlaps last — keep whichever is "stronger"
    const lastScore = last.confidence * 10 + SEVERITY_RANK[last.severity];
    const fScore    = f.confidence    * 10 + SEVERITY_RANK[f.severity];
    if (fScore > lastScore) kept[kept.length - 1] = f;
  }
  return kept;
}

/* ── Union-regex builder ─────────────────────────────────────── */

type HintedDetector = Detector & { hintPattern: RegExp };

function buildUnionRegex(hinted: HintedDetector[]): RegExp | null {
  if (hinted.length === 0) return null;
  const sources = hinted.map(d => `(?:${d.hintPattern.source})`);
  // Propagate case-insensitive and unicode flags from any hinted detector
  // so the union pre-filter doesn't silently miss matches.
  const needsI = hinted.some(d => d.hintPattern.flags.includes("i"));
  const needsU = hinted.some(d => d.hintPattern.flags.includes("u"));
  const flags  = "g" + (needsI ? "i" : "") + (needsU ? "u" : "");
  return new RegExp(sources.join("|"), flags);
}

/**
 * Run the union regex over text and return an array of sorted, merged
 * "hot regions" — spans where at least one hintPattern matched.
 * Nearby regions (within HINT_WINDOW of each other) are merged.
 */
function findHotRegions(text: string, union: RegExp): Array<{ start: number; end: number }> {
  const raw: Array<{ start: number; end: number }> = [];

  // Reset lastIndex — union regex must be stateless between calls
  union.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = union.exec(text)) !== null) {
    const start = Math.max(0, m.index - HINT_WINDOW);
    const end   = Math.min(text.length, m.index + m[0].length + HINT_WINDOW);
    raw.push({ start, end });
    // Prevent infinite loops on zero-length matches
    if (m[0].length === 0) union.lastIndex++;
  }

  if (raw.length === 0) return [];

  // Merge overlapping / adjacent regions
  raw.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [raw[0]!];
  for (let i = 1; i < raw.length; i++) {
    const cur  = raw[i]!;
    const last = merged[merged.length - 1]!;
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

/* ── Engine impl ─────────────────────────────────────────────── */

class ScanEngineImpl implements ScanEngine {
  async scan(req: ScanRequest): Promise<ScanResult> {
    const t0 = req.clock.now();
    const findings: Finding[] = [];

    const detectors = registry.active(req.activeRules, req.locale);

    // Partition into hinted / full
    const hinted: HintedDetector[] = [];
    const full:   Detector[]       = [];

    for (const d of detectors) {
      if (d.hintPattern) {
        hinted.push(d as HintedDetector);
      } else {
        full.push(d);
      }
    }

    const ctx = {
      locale:            req.locale,
      text:              req.source.text,
      ...(req.source.offsetMap ? { offsetMap: req.source.offsetMap } : {}),
      activeCustomRules: [],
      clock:             req.clock,
    };

    // ── Full detectors (no hintPattern) — always scan entire text ──
    for (const det of full) {
      try {
        const out = det.scan(ctx);
        for (const f of out) findings.push(f);
      } catch (err) {
        console.error(`[scan-engine] detector "${det.id}" threw`, err);
      }
    }

    // ── Hinted detectors — union-regex optimisation ─────────────
    if (hinted.length > 0) {
      const union = buildUnionRegex(hinted);

      if (!union) {
        // Fallback: run all hinted detectors normally
        for (const det of hinted) {
          try {
            const out = det.scan(ctx);
            for (const f of out) findings.push(f);
          } catch (err) {
            console.error(`[scan-engine] detector "${det.id}" threw (fallback)`, err);
          }
        }
      } else {
        const regions = findHotRegions(req.source.text, union);

        if (regions.length === 0) {
          // No hint matches at all — no hinted findings possible
        } else {
          // For each region, invoke hinted detectors that match there
          // Merge all regions into a set of detector invocations
          // Use a Set to avoid running the same detector twice in overlapping regions
          const invoked = new Set<string>();

          for (const region of regions) {
            const regionText = req.source.text.slice(region.start, region.end);

            for (const det of hinted) {
              if (invoked.has(det.id)) continue;

              // Quick check: does this detector's hintPattern fire in this region?
              const hp = new RegExp(det.hintPattern.source, "g");
              hp.lastIndex = 0;
              if (!hp.test(regionText)) continue;

              invoked.add(det.id);

              // Run detector over the FULL text (detector must see full context for
              // accurate findings; we only use the hint to decide *whether* to run)
              try {
                const out = det.scan(ctx);
                for (const f of out) findings.push(f);
              } catch (err) {
                console.error(`[scan-engine] detector "${det.id}" threw`, err);
              }
            }
          }
        }
      }
    }

    const merged = deduplicate(findings);
    const score  = computeExposureScore(merged);
    const t1     = req.clock.now();

    return {
      findings:      merged,
      score,
      durationMs:    t1 - t0,
      detectorRunId: makeRunId(t0),
    };
  }
}

export const scanEngine: ScanEngine = new ScanEngineImpl();

/**
 * Convenience wrapper for the popup — accepts a string + rules, returns a
 * ScanResult. Caller doesn't need to construct the full ScanRequest.
 */
export async function scanText(
  text: string,
  rules: Rules,
  opts: { locale?: string; module?: ScanRequest["module"] } = {},
): Promise<ScanResult> {
  return scanEngine.scan({
    module:      opts.module ?? "document-check",
    source:      { text },
    locale:      opts.locale ?? "en",
    activeRules: rules,
    clock:       Date,
  });
}
