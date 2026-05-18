/**
 * Preset catalog — static import of all built-in preset JSON files.
 * Vite bundles these into the extension at build time; no network fetch required.
 */
import type { PresetDefinition } from "~/detectors/types";

// Residency presets (12 Tier-1 countries)
import presetResidencyUs from "./preset.residency.us.json";
import presetResidencyUk from "./preset.residency.uk.json";
import presetResidencyDe from "./preset.residency.de.json";
import presetResidencyFr from "./preset.residency.fr.json";
import presetResidencyIt from "./preset.residency.it.json";
import presetResidencyEs from "./preset.residency.es.json";
import presetResidencyPt from "./preset.residency.pt.json";
import presetResidencyGr from "./preset.residency.gr.json";
import presetResidencyNl from "./preset.residency.nl.json";
import presetResidencyAu from "./preset.residency.au.json";
import presetResidencyCa from "./preset.residency.ca.json";
import presetResidencyJp from "./preset.residency.jp.json";

// Global default
import presetDefaultGlobal from "./preset.default.global.json";

// Regional union presets
import presetRegionEu      from "./preset.region.eu.json";
import presetRegionTraveler from "./preset.region.traveler.json";

// Situation presets
import presetWorkPayments   from "./preset.work.payments.json";
import presetWorkHealthcare from "./preset.work.healthcare.json";
import presetWorkDeveloper  from "./preset.work.developer.json";
import presetLifeParent     from "./preset.life.parent.json";
import presetLifeTraveler   from "./preset.life.traveler.json";
import presetLifePrivacyMax from "./preset.life.privacy-max.json";

// Radar preset
import presetRadarEssentials from "./preset.radar.essentials.json";

export const ALL_PRESETS: readonly PresetDefinition[] = [
  presetDefaultGlobal    as unknown as PresetDefinition,
  presetResidencyUs      as unknown as PresetDefinition,
  presetResidencyUk      as unknown as PresetDefinition,
  presetResidencyDe      as unknown as PresetDefinition,
  presetResidencyFr      as unknown as PresetDefinition,
  presetResidencyIt      as unknown as PresetDefinition,
  presetResidencyEs      as unknown as PresetDefinition,
  presetResidencyPt      as unknown as PresetDefinition,
  presetResidencyGr      as unknown as PresetDefinition,
  presetResidencyNl      as unknown as PresetDefinition,
  presetResidencyAu      as unknown as PresetDefinition,
  presetResidencyCa      as unknown as PresetDefinition,
  presetResidencyJp      as unknown as PresetDefinition,
  presetRegionEu         as unknown as PresetDefinition,
  presetRegionTraveler   as unknown as PresetDefinition,
  presetWorkPayments     as unknown as PresetDefinition,
  presetWorkHealthcare   as unknown as PresetDefinition,
  presetWorkDeveloper    as unknown as PresetDefinition,
  presetLifeParent       as unknown as PresetDefinition,
  presetLifeTraveler     as unknown as PresetDefinition,
  presetLifePrivacyMax   as unknown as PresetDefinition,
  presetRadarEssentials  as unknown as PresetDefinition,
];
