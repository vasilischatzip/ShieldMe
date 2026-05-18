/**
 * PresetResolver — pure implementation of the PresetResolver contract.
 *
 * Contract: specs/001-shieldme-mvp/contracts/detection-engine.md §PresetResolver
 *
 * All methods are:
 *   - Pure (no I/O, no chrome.*)
 *   - Immutable (never mutate inputs; return new objects)
 *   - Deterministic (same input → same output)
 *
 * Preset JSON files live in src/data/presets/*.json and are compiled into the
 * bundle by Vite at build time.
 */
import type {
  PresetDefinition,
  PresetId,
  PresetDiff,
  PresetSnapshot,
  DetectorId,
} from "~/detectors/types";
import type { CategoryId, RulesState } from "~/core/rules";
import { ALL_PRESETS } from "~/data/presets/index";

/* ── Preset catalog ─────────────────────────────────────────────── */

const PRESET_CATALOG = new Map<PresetId, PresetDefinition>(
  ALL_PRESETS.map((p) => [p.id, p]),
);

/* ── Helpers ─────────────────────────────────────────────────────── */

function cloneRules(r: RulesState): RulesState {
  return {
    version: r.version,
    categories: { ...r.categories },
    detectors: { ...r.detectors },
    activePresets: [...r.activePresets],
    manualOverrides: {
      enabled: [...r.manualOverrides.enabled],
      disabled: [...r.manualOverrides.disabled],
    },
    includeBetaDetectors: r.includeBetaDetectors,
  };
}

function cloneSnapshot(s: PresetSnapshot): PresetSnapshot {
  const byPreset: Record<PresetId, DetectorId[]> = {};
  for (const [k, v] of Object.entries(s.byPreset)) {
    byPreset[k] = [...v];
  }
  const detectorRefCount: Record<DetectorId, PresetId[]> = {};
  for (const [k, v] of Object.entries(s.detectorRefCount)) {
    detectorRefCount[k] = [...v];
  }
  return { version: 1, byPreset, detectorRefCount };
}

function computePreviewDiff(
  preset: PresetDefinition,
  rules: RulesState,
): PresetDiff {
  const categoriesEnabled: CategoryId[] = [];
  const categoriesDisabled: CategoryId[] = [];
  const detectorsEnabled: DetectorId[] = [];
  const detectorsDisabled: DetectorId[] = [];

  for (const [catId, catState] of Object.entries(preset.categories)) {
    const cat = catId as CategoryId;
    if (catState.enabled && !rules.categories[cat]) {
      categoriesEnabled.push(cat);
    } else if (!catState.enabled && rules.categories[cat]) {
      categoriesDisabled.push(cat);
    }
  }

  for (const [detId, wantEnabled] of Object.entries(preset.detectors)) {
    const current = rules.detectors[detId] ?? false;
    if (wantEnabled && !current) {
      detectorsEnabled.push(detId);
    } else if (!wantEnabled && current) {
      detectorsDisabled.push(detId);
    }
  }

  return {
    categoriesEnabled,
    categoriesDisabled,
    detectorsEnabled,
    detectorsDisabled,
    humanReadable: { added: detectorsEnabled, removed: detectorsDisabled },
  };
}

/* ── PresetResolver interface implementation ─────────────────────── */

export const presetResolver = {
  /** Load a preset by ID. Throws for unknown IDs. */
  get(id: PresetId): PresetDefinition {
    const preset = PRESET_CATALOG.get(id);
    if (!preset) {
      throw new Error(`[PresetResolver] Unknown preset ID: "${id}"`);
    }
    return preset;
  },

  /** All built-in preset definitions. */
  list(): PresetDefinition[] {
    return [...PRESET_CATALOG.values()];
  },

  /**
   * Compute the diff that applying this preset would produce, WITHOUT
   * mutating rules. Runs in <1 ms for any current preset (contracts say ≤10ms).
   */
  preview(preset: PresetDefinition, rules: RulesState): PresetDiff {
    return computePreviewDiff(preset, rules);
  },

  /**
   * Apply a preset to rules.
   *
   * Union semantics: only enables detectors/categories; never disables what
   * another preset or the user already enabled.
   * Idempotent: applying the same preset twice is a no-op.
   */
  apply(
    preset: PresetDefinition,
    rules: RulesState,
    snapshot: PresetSnapshot,
  ): { rules: RulesState; snapshot: PresetSnapshot; diff: PresetDiff } {
    const diff = computePreviewDiff(preset, rules);

    const newRules = cloneRules(rules);
    const newSnap  = cloneSnapshot(snapshot);

    // 1. Apply category enables (union: never disable)
    for (const [catId, catState] of Object.entries(preset.categories)) {
      if (catState.enabled) {
        newRules.categories[catId as CategoryId] = true;
      }
    }

    // 2. Apply detector toggles and track which ones this preset "claims"
    //    (any detector the preset wants ON — even if already enabled by another
    //    preset — is tracked so unapply can do correct refcount-based removal).
    const claimedByThisPreset: DetectorId[] = [];
    for (const [detId, wantEnabled] of Object.entries(preset.detectors)) {
      if (wantEnabled) {
        newRules.detectors[detId] = true;
        claimedByThisPreset.push(detId);
      }
    }

    // 3. Update snapshot (idempotent: skip if already registered)
    if (!newSnap.byPreset[preset.id]) {
      newSnap.byPreset[preset.id] = claimedByThisPreset;
      for (const detId of claimedByThisPreset) {
        if (!newSnap.detectorRefCount[detId]) {
          newSnap.detectorRefCount[detId] = [];
        }
        if (!newSnap.detectorRefCount[detId]!.includes(preset.id)) {
          newSnap.detectorRefCount[detId]!.push(preset.id);
        }
      }
    }
    // Idempotent: if already in byPreset, do nothing more

    // 4. Track active preset
    if (!newRules.activePresets.includes(preset.id)) {
      newRules.activePresets.push(preset.id);
    }

    return { rules: newRules, snapshot: newSnap, diff };
  }, // end apply

  /**
   * Unapply a previously applied preset.
   *
   * Disables detectors that:
   *   - were enabled exclusively by this preset (refCount drops to 0), AND
   *   - are NOT in manualOverrides.enabled.
   */
  unapply(
    presetId: PresetId,
    rules: RulesState,
    snapshot: PresetSnapshot,
  ): { rules: RulesState; snapshot: PresetSnapshot; diff: PresetDiff } {
    const newRules = cloneRules(rules);
    const newSnap  = cloneSnapshot(snapshot);

    const detectorsToDisable: DetectorId[] = [];
    const detectorsEnabled: DetectorId[] = [];
    const categoriesEnabled: CategoryId[] = [];
    const categoriesDisabled: CategoryId[] = [];

    const ownedDetectors = newSnap.byPreset[presetId] ?? [];

    for (const detId of ownedDetectors) {
      // Remove this preset from the refcount list
      const refs = newSnap.detectorRefCount[detId] ?? [];
      const idx  = refs.indexOf(presetId);
      if (idx !== -1) refs.splice(idx, 1);

      // If no other preset references this detector, and it's not manually overridden, disable it
      if (
        refs.length === 0 &&
        !newRules.manualOverrides.enabled.includes(detId)
      ) {
        newRules.detectors[detId] = false;
        detectorsToDisable.push(detId);
      }
    }

    // Remove from snapshot
    delete newSnap.byPreset[presetId];

    // Remove from activePresets
    const idx = newRules.activePresets.indexOf(presetId);
    if (idx !== -1) newRules.activePresets.splice(idx, 1);

    const diff: PresetDiff = {
      categoriesEnabled,
      categoriesDisabled,
      detectorsEnabled,
      detectorsDisabled: detectorsToDisable,
      humanReadable: { added: [], removed: detectorsToDisable },
    };

    return { rules: newRules, snapshot: newSnap, diff };
  },

  /**
   * Record that the user manually overrode a detector's state.
   * Future preset apply/unapply cycles will not clobber this choice.
   */
  recordManualOverride(
    rules: RulesState,
    detectorId: DetectorId,
    enabled: boolean,
  ): RulesState {
    const newRules = cloneRules(rules);

    if (enabled) {
      if (!newRules.manualOverrides.enabled.includes(detectorId)) {
        newRules.manualOverrides.enabled.push(detectorId);
      }
      // Remove from disabled list if present
      const idx = newRules.manualOverrides.disabled.indexOf(detectorId);
      if (idx !== -1) newRules.manualOverrides.disabled.splice(idx, 1);
      // Actually apply the toggle
      newRules.detectors[detectorId] = true;
    } else {
      if (!newRules.manualOverrides.disabled.includes(detectorId)) {
        newRules.manualOverrides.disabled.push(detectorId);
      }
      // Remove from enabled list if present
      const idx = newRules.manualOverrides.enabled.indexOf(detectorId);
      if (idx !== -1) newRules.manualOverrides.enabled.splice(idx, 1);
      // Actually apply the toggle
      newRules.detectors[detectorId] = false;
    }

    return newRules;
  },
};
