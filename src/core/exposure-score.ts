/**
 * Exposure Score (T027) — single 0..100 number representing "how exposed"
 * a piece of content is.
 *
 * Inputs: a `Finding[]` from the ScanEngine.
 * Output: integer 0..100, where:
 *   - 100 = pristine (no findings)
 *   - 0   = severely exposed (multiple critical findings with high confidence)
 *
 * Algorithm (PRD §8 simplified, deterministic & purely functional):
 *
 *   - Each finding contributes:
 *       weight = severityWeight(severity) * confidence
 *       e.g. critical (1.0) × 1.0 conf = 1.0 weight
 *            warning  (0.5) × 0.7 conf = 0.35 weight
 *            info     (0.2) × 0.5 conf = 0.10 weight
 *   - Total exposure = sum of weights, capped at 10.
 *   - Score = round(100 - 10 * total)        // each unit deducts 10 points
 *   - Diversity multiplier: if findings span 3+ categories, add an extra -5.
 *
 * Properties verified by tests:
 *   - Empty findings → 100
 *   - Single critical-1.0 finding → 90
 *   - Two critical-1.0 findings → 80
 *   - Saturates at 0 (cannot go negative)
 *   - Determinism: same input always yields the same score
 */
import type { Finding } from "~/detectors/types";

const SEVERITY_WEIGHT = {
  critical: 1.0,
  warning:  0.5,
  info:     0.2,
} as const;

const MAX_TOTAL = 10;        // exposure cap before saturation
const POINTS_PER_UNIT = 10;  // each unit deducts this many points
const DIVERSITY_PENALTY = 5; // ≥3 categories → extra deduction
const DIVERSITY_THRESHOLD = 3;

export interface ExposureBreakdown {
  score: number;             // 0..100
  totalFindings: number;
  byCategory: Record<string, number>;
  bySeverity: { critical: number; warning: number; info: number };
}

export function computeExposureScore(findings: readonly Finding[]): number {
  if (findings.length === 0) return 100;

  let total = 0;
  const cats = new Set<string>();
  for (const f of findings) {
    const w = SEVERITY_WEIGHT[f.severity] ?? 0;
    total += w * (f.confidence ?? 0);
    cats.add(f.categoryId);
  }
  const capped = Math.min(total, MAX_TOTAL);
  let score = 100 - capped * POINTS_PER_UNIT;
  if (cats.size >= DIVERSITY_THRESHOLD) score -= DIVERSITY_PENALTY;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function exposureBreakdown(findings: readonly Finding[]): ExposureBreakdown {
  const byCategory: Record<string, number> = {};
  const bySeverity = { critical: 0, warning: 0, info: 0 };
  for (const f of findings) {
    byCategory[f.categoryId] = (byCategory[f.categoryId] ?? 0) + 1;
    bySeverity[f.severity]++;
  }
  return {
    score:         computeExposureScore(findings),
    totalFindings: findings.length,
    byCategory,
    bySeverity,
  };
}

/** Tier label for the dashboard hero. */
export function scoreTier(score: number): "good" | "ok" | "risk" | "danger" {
  if (score >= 85) return "good";
  if (score >= 60) return "ok";
  if (score >= 30) return "risk";
  return "danger";
}
