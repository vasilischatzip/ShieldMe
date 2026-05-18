/**
 * Detector registry — singleton that detector modules self-register into.
 *
 * T014: Skeleton with register/all/byCategory/byRegion/byShipTier.
 * T020d: Extends active() with rules + locale + includeBetaDetectors logic.
 *
 * Constitution §IX: register() throws on "planned" detectors — fail loud.
 */
import type {
  Detector,
  DetectorId,
  DetectorRegistry,
  LocaleTag,
  Rules,
  ShipTier,
} from "./types";
import type { CategoryId } from "~/core/rules";

class DetectorRegistryImpl implements DetectorRegistry {
  private readonly _detectors = new Map<DetectorId, Detector>();

  register(d: Detector): void {
    if (d.shipTier === "planned") {
      throw new Error(
        `[registry] Detector "${d.id}" has shipTier "planned" and MUST NOT be registered in production.`,
      );
    }
    if (this._detectors.has(d.id)) {
      // Idempotent re-registration (e.g. HMR) — silently overwrite.
      // Non-idempotent conflicts (different detector, same id) are a bug.
      const existing = this._detectors.get(d.id)!;
      if (existing !== d) {
        throw new Error(
          `[registry] Detector ID collision: "${d.id}" is already registered by a different object.`,
        );
      }
    }
    this._detectors.set(d.id, d);
  }

  all(): Detector[] {
    return [...this._detectors.values()];
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

  /**
   * Effective detector set for a scan.
   * Full implementation in T020d — for now returns all registered GA detectors
   * that satisfy the active category/detector rules.
   */
  active(rules: Rules, locale: string): Detector[] {
    return this.all().filter((d) => {
      // "planned" already blocked at register() — defensive guard
      if (d.shipTier === "planned") return false;

      // Beta filtered out unless includeBetaDetectors is ON
      if (d.shipTier === "beta" && !rules.includeBetaDetectors) return false;

      // Category must be enabled
      if (!rules.categories[d.categoryId]) return false;

      // Per-detector toggle (default ON if not set)
      if (rules.detectors[d.id] === false) return false;

      // Locale gate — detector only active for specific locales
      if (d.requiresLocales && !d.requiresLocales.includes(locale)) return false;

      return true;
    });
  }

  /** Test helper — wipe all registrations between test suites. */
  _reset(): void {
    this._detectors.clear();
  }
}

export const registry: DetectorRegistry & { _reset(): void } =
  new DetectorRegistryImpl();
