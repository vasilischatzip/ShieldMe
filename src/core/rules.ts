/**
 * Rules store — consumer-facing Protection Categories.
 *
 * Six top-level categories map to detector groups. Each category and detector
 * has an on/off switch that persists in chrome.storage.local under "rules.categories".
 *
 * UI reads via `rulesState` signal; writes via `toggleCategory` / `toggleDetector`.
 * Category OFF ⇒ all detectors in that category are suppressed at scan time, even if
 * individually enabled (category acts as a hard gate).
 */
import { signal } from "@preact/signals";
import { localStore } from "./storage";

export type CategoryId =
  | "myMoney"
  | "myIdentity"
  | "myHealth"
  | "myFamily"
  | "myDigitalLife"
  | "myLocation";

export interface DetectorDef {
  id: string;
  labelKey: string;
  descKey?: string;
}

export interface CategoryDef {
  id: CategoryId;
  labelKey: string;
  descKey: string;
  icon: string;
  detectors: DetectorDef[];
}

export const CATEGORIES: readonly CategoryDef[] = [
  {
    id: "myMoney",
    labelKey: "category_myMoney",
    descKey: "category_myMoney_desc",
    icon: "💳",
    detectors: [
      { id: "credit-card", labelKey: "detector_creditCard" },
      { id: "iban", labelKey: "detector_iban" },
      { id: "us-bank", labelKey: "detector_usBank" },
      { id: "crypto-wallet", labelKey: "detector_cryptoWallet" },
    ],
  },
  {
    id: "myIdentity",
    labelKey: "category_myIdentity",
    descKey: "category_myIdentity_desc",
    icon: "🪪",
    detectors: [
      { id: "ssn", labelKey: "detector_ssn" },
      { id: "passport", labelKey: "detector_passport" },
      { id: "drivers-license", labelKey: "detector_driversLicense" },
      { id: "national-id", labelKey: "detector_nationalId" },
    ],
  },
  {
    id: "myHealth",
    labelKey: "category_myHealth",
    descKey: "category_myHealth_desc",
    icon: "⚕️",
    detectors: [
      { id: "health-id", labelKey: "detector_healthId" },
      { id: "medical-record", labelKey: "detector_medicalRecord" },
      { id: "diagnosis", labelKey: "detector_diagnosis" },
    ],
  },
  {
    id: "myFamily",
    labelKey: "category_myFamily",
    descKey: "category_myFamily_desc",
    icon: "👨‍👩‍👧",
    detectors: [
      { id: "minor-name", labelKey: "detector_minorName" },
      { id: "school-info", labelKey: "detector_schoolInfo" },
      { id: "family-address", labelKey: "detector_familyAddress" },
    ],
  },
  {
    id: "myDigitalLife",
    labelKey: "category_myDigitalLife",
    descKey: "category_myDigitalLife_desc",
    icon: "🔑",
    detectors: [
      { id: "api-key", labelKey: "detector_apiKey" },
      { id: "private-key", labelKey: "detector_privateKey" },
      { id: "password", labelKey: "detector_password" },
      { id: "email", labelKey: "detector_email" },
      { id: "phone-intl", labelKey: "detector_phoneIntl" },
    ],
  },
  {
    id: "myLocation",
    labelKey: "category_myLocation",
    descKey: "category_myLocation_desc",
    icon: "📍",
    detectors: [
      { id: "home-address", labelKey: "detector_homeAddress" },
      { id: "gps-coords", labelKey: "detector_gpsCoords" },
      { id: "itinerary", labelKey: "detector_itinerary" },
    ],
  },
] as const;

export interface RulesState {
  version: 1;
  categories: Record<CategoryId, boolean>;
  detectors: Record<string, boolean>; // detectorId → enabled
  /** Active preset IDs, ordered by apply time. */
  activePresets: string[];
  /** Detector states set directly by the user (never cleared by preset apply/unapply). */
  manualOverrides: {
    enabled: string[];
    disabled: string[];
  };
  /** Master switch: show / scan with Beta-tier detectors. */
  includeBetaDetectors: boolean;
}

const STORAGE_KEY = "rules.categories";

/** Per FR-R1: My Money, My Identity, My Digital Life default ON; others default OFF. */
const CATEGORY_DEFAULTS: Record<CategoryId, boolean> = {
  myMoney: true,
  myIdentity: true,
  myHealth: false,
  myFamily: false,
  myDigitalLife: true,
  myLocation: false,
};

function defaultState(): RulesState {
  const categories = { ...CATEGORY_DEFAULTS };
  const detectors: Record<string, boolean> = {};
  for (const cat of CATEGORIES) {
    for (const det of cat.detectors) {
      // Detectors inherit their category's default state
      detectors[det.id] = CATEGORY_DEFAULTS[cat.id];
    }
  }
  return {
    version: 1,
    categories,
    detectors,
    activePresets: [],
    manualOverrides: { enabled: [], disabled: [] },
    includeBetaDetectors: false,
  };
}

/** Reactive state — UI subscribes via @preact/signals. */
export const rulesState = signal<RulesState>(defaultState());

let loaded = false;

export async function loadRules(): Promise<RulesState> {
  const stored = await localStore.get<RulesState>(STORAGE_KEY);
  const next = stored?.version === 1 ? mergeWithDefaults(stored) : defaultState();
  rulesState.value = next;
  loaded = true;
  return next;
}

/** Merge stored state with defaults so newly-added detectors get sane defaults. */
function mergeWithDefaults(stored: RulesState): RulesState {
  const base = defaultState();
  return {
    version: 1,
    categories: { ...base.categories, ...stored.categories },
    detectors: { ...base.detectors, ...stored.detectors },
    activePresets: stored.activePresets ?? base.activePresets,
    manualOverrides: stored.manualOverrides ?? base.manualOverrides,
    includeBetaDetectors: stored.includeBetaDetectors ?? base.includeBetaDetectors,
  };
}

async function persist(next: RulesState): Promise<void> {
  rulesState.value = next;
  await localStore.set(STORAGE_KEY, next);
}

export async function toggleCategory(id: CategoryId, enabled: boolean): Promise<void> {
  if (!loaded) await loadRules();
  const current = rulesState.value;
  await persist({
    ...current,
    categories: { ...current.categories, [id]: enabled },
  });
}

export async function toggleDetector(
  detectorId: string,
  enabled: boolean,
): Promise<void> {
  if (!loaded) await loadRules();
  const current = rulesState.value;
  await persist({
    ...current,
    detectors: { ...current.detectors, [detectorId]: enabled },
  });
}

/** Scan-time predicate: is this detector active right now? */
export function isDetectorActive(categoryId: CategoryId, detectorId: string): boolean {
  const s = rulesState.value;
  return (s.categories[categoryId] ?? false) && (s.detectors[detectorId] ?? false);
}

/* ── Preset-aware mutations ─────────────────────────────────────
 * These are the only safe way to apply / unapply presets because
 * they keep the PresetSnapshot in sync with the Rules state.
 * Both load the snapshot from storage, call the pure PresetResolver,
 * then persist the new rules + snapshot atomically.
 */

const SNAPSHOT_KEY = "presetSnapshot";

type SnapshotStore = import("~/detectors/types").PresetSnapshot;

async function loadSnapshot(): Promise<SnapshotStore> {
  const stored = await localStore.get<SnapshotStore>(SNAPSHOT_KEY);
  return stored ?? { version: 1, byPreset: {}, detectorRefCount: {} };
}

/**
 * Apply a preset by ID and persist the updated rules + snapshot.
 * Idempotent: calling twice with the same preset ID is a no-op.
 */
export async function applyPreset(presetId: string): Promise<void> {
  // Import lazily to avoid circular dependency at module load time
  const { presetResolver } = await import("~/core/preset-resolver");
  if (!loaded) await loadRules();
  const rules   = rulesState.value;
  const snap    = await loadSnapshot();
  const preset  = presetResolver.get(presetId);
  const { rules: newRules, snapshot: newSnap } = presetResolver.apply(preset, rules, snap);
  await localStore.set(SNAPSHOT_KEY, newSnap);
  await persist(newRules);
}

/**
 * Unapply a previously applied preset and persist the result.
 * Detectors exclusively owned by this preset (refcount → 0) are disabled,
 * unless the user has them in manualOverrides.enabled.
 */
export async function unapplyPreset(presetId: string): Promise<void> {
  const { presetResolver } = await import("~/core/preset-resolver");
  if (!loaded) await loadRules();
  const rules  = rulesState.value;
  const snap   = await loadSnapshot();
  const { rules: newRules, snapshot: newSnap } = presetResolver.unapply(presetId, rules, snap);
  await localStore.set(SNAPSHOT_KEY, newSnap);
  await persist(newRules);
}

/** Test helper — resets to defaults (in-memory only). */
export function _resetRulesForTests(): void {
  rulesState.value = defaultState();
  loaded = false;
}
