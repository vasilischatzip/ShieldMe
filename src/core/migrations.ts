/**
 * Migration runner — runs at service-worker startup.
 * Compares stored schema versions to code versions, applies ordered migrations.
 * Seeds installId + wrappingKey on first run.
 */
import type { LocalStore } from "./storage";
import { generateWrappingKey } from "./crypto";

/** Increment this when adding a new migration. */
export const CURRENT_META_VERSION  = 1;
export const CURRENT_RULES_VERSION = 2;
export const CURRENT_PREFS_VERSION = 1;
export const CURRENT_TIER_VERSION  = 2;

/** Number of accounts allowed per tier in TierStatus v2. */
const TIER_ACCOUNTS_MAX: Record<string, number> = {
  "free":            1,
  "premium-preview": 0, // 0 = unlimited (preview)
  "pro":             0, // 0 = unlimited
};

export interface MetaRecord {
  version: number;
  installId: string;
  wrappingKey: string; // base64 AES-GCM key
  installedAt: string;
}

export type MigrationResult =
  | { status: "ok"; migrationsRun: string[] }
  | { status: "error"; error: unknown };

function ulid(): string {
  // Lightweight ULID-like ID (timestamp + random). No external dep.
  const ts = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const rnd = Math.random().toString(36).slice(2, 12).toUpperCase().padStart(10, "0");
  return `${ts}${rnd}`;
}

export async function runMigrations(store: LocalStore): Promise<MigrationResult> {
  const applied: string[] = [];

  try {
    // ── Meta / first-run seed ──────────────────────────────────────────────
    const meta = await store.get<MetaRecord>("meta");

    if (!meta) {
      // First install — seed meta
      const wrappingKey = await generateWrappingKey();
      const newMeta: MetaRecord = {
        version: CURRENT_META_VERSION,
        installId: ulid(),
        wrappingKey,
        installedAt: new Date().toISOString(),
      };
      await store.set("meta", newMeta);
      applied.push("meta:init");
    } else if (meta.version < CURRENT_META_VERSION) {
      // Future meta migrations go here
      await store.patch<MetaRecord>("meta", { version: CURRENT_META_VERSION });
      applied.push(`meta:v${meta.version}→v${CURRENT_META_VERSION}`);
    }

    // ── Rules v1 → v2 ─────────────────────────────────────────────────────
    const rules = await store.get<{ version?: number }>( "rules");
    if (rules && (rules.version ?? 1) < CURRENT_RULES_VERSION) {
      const v1 = rules as Record<string, unknown>;

      // Infer presetLocale from Prefs.locale ("el"→"gr", everything else→"global").
      const prefs = await store.get<{ locale?: string }>("prefs");
      const locale = prefs?.locale ?? "en";
      const presetLocale = locale === "el" ? "gr" : "global";

      // Detect custom toggles: compare stored categories to known defaults.
      // If the user deviated from defaults, they made intentional choices — don't
      // override with a preset (set activePresets = []).
      const DEFAULTS: Record<string, boolean> = {
        myMoney:       true,
        myIdentity:    true,
        myDigitalLife: true,
        myHealth:      false,
        myFamily:      false,
        myLocation:    false,
      };
      const storedCats = (v1["categories"] as Record<string, boolean> | undefined) ?? {};
      const hasCustomToggles = Object.entries(DEFAULTS).some(
        ([catId, defaultVal]) => {
          const stored = storedCats[catId];
          return stored !== undefined && stored !== defaultVal;
        },
      );

      const activePresets = hasCustomToggles ? [] : ["preset.default.global"];

      const v2 = {
        ...v1,
        version: 2,
        activePresets,
        presetLocale,
        includeBetaDetectors: false,
        manualOverrides: { enabled: [], disabled: [] },
      };
      await store.set("rules", v2);

      // Seed a blank presetSnapshot — PresetResolver will populate it lazily.
      await store.set("presetSnapshot", {
        version: 1,
        byPreset: {},
        detectorRefCount: {},
      });

      applied.push("rules:v1→v2");
    }

    // ── Tier v1 → v2 ──────────────────────────────────────────────────────
    const tier = await store.get<{ version?: number; tier?: string }>( "tier");
    if (tier && (tier.version ?? 1) < CURRENT_TIER_VERSION) {
      const oldTier = tier.tier ?? "free";

      // Rename legacy tier keys to new scheme
      const tierMap: Record<string, string> = {
        "premium":    "pro",
        "pro-family": "pro",
      };
      const newTierName = tierMap[oldTier] ?? oldTier;
      const accountsMax = TIER_ACCOUNTS_MAX[newTierName] ?? 0;

      await store.set("tier", {
        ...tier,
        version:     CURRENT_TIER_VERSION,
        tier:        newTierName,
        accountsMax,
      });
      applied.push("tier:v1→v2");
    }

    return { status: "ok", migrationsRun: applied };
  } catch (error) {
    return { status: "error", error };
  }
}
