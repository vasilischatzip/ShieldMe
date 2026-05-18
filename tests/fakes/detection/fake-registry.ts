/**
 * T001 — FakeDetectorRegistry test double.
 *
 * Implements the full DetectorRegistry interface so downstream modules
 * (Document Check, Email Guardian, Drive Audit, etc.) can be tested without
 * importing or initialising real detector barrels.
 *
 * Usage:
 *
 *   const fake = new FakeDetectorRegistry();
 *   fake.register(myDetector);
 *   fake._setActiveOverride([myDetector]);    // control what active() returns
 *   fake._reset();                            // clear between tests
 */
import type {
  Detector,
  DetectorRegistry,
  LocaleTag,
  Rules,
  ShipTier,
} from "~/detectors/types";
import type { CategoryId } from "~/core/rules";

export class FakeDetectorRegistry implements DetectorRegistry {
  private readonly _store = new Map<string, Detector>();
  private _activeOverride: Detector[] | null = null;

  // ── DetectorRegistry interface ─────────────────────────────────

  register(d: Detector): void {
    if (d.shipTier === "planned") {
      throw new Error(
        `[FakeDetectorRegistry] Detector "${d.id}" has shipTier "planned" and MUST NOT be registered.`,
      );
    }
    const existing = this._store.get(d.id);
    if (existing && existing !== d) {
      throw new Error(
        `[FakeDetectorRegistry] ID collision: "${d.id}" registered by a different object.`,
      );
    }
    this._store.set(d.id, d);
  }

  all(): Detector[] {
    return [...this._store.values()];
  }

  byCategory(cat: CategoryId): Detector[] {
    return this.all().filter((d) => d.categoryId === cat);
  }

  byRegion(region: LocaleTag): Detector[] {
    return this.all().filter(
      (d) => d.region === region || d.region === "global",
    );
  }

  byShipTier(tier: ShipTier): Detector[] {
    return this.all().filter((d) => d.shipTier === tier);
  }

  active(rules: Rules, locale: string): Detector[] {
    // If test has injected an override, return it unconditionally.
    if (this._activeOverride !== null) return this._activeOverride;

    // Default: same logic as the real registry.
    return this.all().filter((d) => {
      if (d.shipTier === "planned") return false;
      if (d.shipTier === "beta" && !rules.includeBetaDetectors) return false;
      if (!rules.categories[d.categoryId]) return false;
      if (rules.detectors[d.id] === false) return false;
      if (d.requiresLocales && !d.requiresLocales.includes(locale)) return false;
      return true;
    });
  }

  // ── Test helpers ───────────────────────────────────────────────

  /**
   * Force `active()` to return a specific list regardless of rules/locale.
   * Pass `null` to restore default (rules-based) filtering.
   */
  _setActiveOverride(detectors: Detector[] | null): void {
    this._activeOverride = detectors;
  }

  /** Clear all registered detectors and reset any overrides. */
  _reset(): void {
    this._store.clear();
    this._activeOverride = null;
  }

  /** Convenience: register several detectors at once. */
  _registerAll(detectors: Detector[]): void {
    for (const d of detectors) this.register(d);
  }
}
