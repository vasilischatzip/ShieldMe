/**
 * SeverityResolver — pure function that maps confidence level + instance count
 * + category default + detector thresholds → a final Severity value.
 *
 * Contract: contracts/detection-engine.md — SeverityResolver type.
 *
 * Constitution §VII (correctness): resolves severity deterministically; no I/O,
 * no clock, no side effects.
 *
 * Mapping rules (applied in order):
 *   1. instanceCountForCritical promotion:
 *      If `instanceCount >= thresholds.instanceCountForCritical` → "critical".
 *      This overrides all confidence-based mapping.
 *   2. "high" confidence → "critical"
 *   3. "medium" confidence → categoryDefault
 *   4. "low" confidence → "info"
 *
 * Rationale for rule order: instance-count promotion reflects a policy decision
 * that volume of exposure is independently dangerous even when individual match
 * confidence is low (e.g., 10 low-confidence IBANs in one document likely means
 * a real financial dataset was scanned).
 */
import type { Severity } from "~/detectors/types";

/* ── Types ─────────────────────────────────────────────────────── */

/** Purview-aligned confidence bucket. */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Subset of DetectorThresholds required by resolveSeverity.
 * Deliberately narrow so callers that don't have full threshold objects
 * can still use the resolver.
 */
export type SeverityThresholds = {
  /**
   * When the number of distinct findings for a detector in a single scan
   * reaches this count, severity is unconditionally promoted to "critical".
   * Undefined means promotion never fires.
   */
  instanceCountForCritical?: number;
};

/* ── Numeric confidence midpoints ──────────────────────────────── */

/**
 * Returns a representative numeric Confidence value [0..1] for a
 * ConfidenceLevel bucket, aligned with DEFAULT_THRESHOLDS in the contract:
 *   high:   > 0.85     (midpoint 0.925)
 *   medium: > 0.70     (midpoint 0.775)
 *   low:    < 0.70     (representative 0.50)
 */
export function numericConfidence(level: ConfidenceLevel): number {
  switch (level) {
    case "high":   return 0.925;
    case "medium": return 0.775;
    case "low":    return 0.50;
  }
}

/* ── Resolver ──────────────────────────────────────────────────── */

/**
 * Pure severity resolver. See module-level JSDoc for the mapping rules.
 *
 * @param confidence  - Purview-aligned confidence bucket for this finding.
 * @param instanceCount - Number of distinct findings for this detector in
 *                        the current scan (used for promotion gate).
 * @param categoryDefault - Base severity declared by the detector's category.
 * @param thresholds  - Detector-level threshold overrides (only
 *                       `instanceCountForCritical` is consumed here).
 */
export function resolveSeverity(
  confidence: ConfidenceLevel,
  instanceCount: number,
  categoryDefault: Severity,
  thresholds: SeverityThresholds,
): Severity {
  // Rule 1: instance-count promotion overrides everything.
  if (
    thresholds.instanceCountForCritical !== undefined &&
    instanceCount >= thresholds.instanceCountForCritical
  ) {
    return "critical";
  }

  // Rules 2–4: confidence-based mapping.
  switch (confidence) {
    case "high":   return "critical";
    case "medium": return categoryDefault;
    case "low":    return "info";
  }
}

/**
 * Derive a ConfidenceLevel bucket from a raw numeric confidence [0..1],
 * using the default bucket floors from contracts/detection-engine.md:
 *   ≥ 0.85 → "high"
 *   ≥ 0.70 → "medium"
 *   < 0.70 → "low"
 */
export function toConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.70) return "medium";
  return "low";
}
