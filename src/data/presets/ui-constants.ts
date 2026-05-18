/**
 * Preset ID lists used by Settings and Onboarding UIs.
 * Kept in one place so both UIs stay in sync.
 */

/** Residency preset IDs shown in the country dropdown (GA tier, one-pick). */
export const RESIDENCY_PRESET_IDS: string[] = [
  "preset.residency.us",
  "preset.residency.uk",
  "preset.residency.de",
  "preset.residency.fr",
  "preset.residency.it",
  "preset.residency.es",
  "preset.residency.pt",
  "preset.residency.gr",
  "preset.residency.nl",
  "preset.residency.au",
  "preset.residency.ca",
  "preset.residency.jp",
];

export const RESIDENCY_ID_SET = new Set<string>(RESIDENCY_PRESET_IDS);

/** Situation preset IDs shown as multi-select checkboxes (GA tier). */
export const SITUATION_PRESET_IDS: string[] = [
  "preset.region.eu",
  "preset.work.payments",
  "preset.work.healthcare",
  "preset.work.developer",
  "preset.life.parent",
  "preset.life.traveler",
  "preset.life.privacy-max",
];

export const SITUATION_ID_SET = new Set<string>(SITUATION_PRESET_IDS);
