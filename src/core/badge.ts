/**
 * Badge display helpers — T049.
 *
 * Pure functions that determine toolbar badge text and colour from an
 * exposure score.  Extracted from the service worker so they can be
 * unit-tested without loading the Chrome extension environment.
 *
 * Score tiers (mirrors Dashboard tierColor):
 *   85–100 → good   — #1e8e3e (green)
 *   60–84  → ok     — #b07b00 (amber)
 *   30–59  → risk   — #d9540b (orange)
 *    0–29  → danger — #c5221f (red)
 */

export type ScoreTierColor = "#1e8e3e" | "#b07b00" | "#d9540b" | "#c5221f";

/**
 * Returns the background colour for the toolbar badge.
 * Input is clamped to [0, 100]; non-integers are rounded.
 */
export function badgeColor(score: number): ScoreTierColor {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 85) return "#1e8e3e";
  if (s >= 60) return "#b07b00";
  if (s >= 30) return "#d9540b";
  return              "#c5221f";
}

/**
 * Returns the badge label text for a given score.
 * Always a 1–3 character string (score 0..100).
 */
export function badgeText(score: number): string {
  return String(Math.max(0, Math.min(100, Math.round(score))));
}
