/**
 * T029da — Rules v1→v2 migration tests for preset fields.
 *
 * Per data-model.md §2 Migration v1→v2:
 *   - activePresets = ["preset.default.global"] if no custom toggles; else []
 *   - presetLocale inferred from Prefs.locale ("en"→"global", "el"→"gr")
 *   - includeBetaDetectors = false
 *   - manualOverrides = { enabled: [], disabled: [] }
 *   - presetSnapshot seeded in store
 *
 * Four branches covered:
 *   1. default  — no custom toggles
 *   2. custom   — user modified categories from defaults
 *   3. el-locale — Prefs.locale = "el" → presetLocale = "gr"
 *   4. en-locale — Prefs.locale = "en" → presetLocale = "global"
 */
import { describe, it, expect, beforeEach } from "vitest";
import { FakeLocalStore } from "../../fakes/fake-storage";
import { runMigrations } from "~/core/migrations";

/* ── Default CATEGORY state (FR-R1) ──────────────────────────────── */
const DEFAULT_CATEGORIES = {
  myMoney:       true,
  myIdentity:    true,
  myDigitalLife: true,
  myHealth:      false,
  myFamily:      false,
  myLocation:    false,
};

function v1Rules(categoriesOverride?: Record<string, boolean>) {
  return {
    version: 1,
    categories: { ...DEFAULT_CATEGORIES, ...categoriesOverride },
    detectors: {},
    customRules: [],
    whitelists: { recipients: [], domains: [] },
  };
}

/* ════════════════════════════════════════════════════════════════ */

describe("T029da — Rules v1→v2 migration: four branches", () => {
  let store: FakeLocalStore;

  beforeEach(() => {
    store = new FakeLocalStore();
  });

  /* ── Branch 1: Default (no custom toggles) ───────────────────── */

  it("branch default — no custom toggles → activePresets = [global default]", async () => {
    await store.set("rules", v1Rules());
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["activePresets"]).toEqual(["preset.default.global"]);
  });

  it("branch default — presetLocale = 'global' when no prefs", async () => {
    await store.set("rules", v1Rules());
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["presetLocale"]).toBe("global");
  });

  /* ── Branch 2: Custom toggles ────────────────────────────────── */

  it("branch custom — myHealth turned ON → activePresets = []", async () => {
    await store.set("rules", v1Rules({ myHealth: true }));
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["activePresets"]).toEqual([]);
  });

  it("branch custom — myMoney turned OFF → activePresets = []", async () => {
    await store.set("rules", v1Rules({ myMoney: false }));
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["activePresets"]).toEqual([]);
  });

  it("branch custom — myFamily turned ON → activePresets = []", async () => {
    await store.set("rules", v1Rules({ myFamily: true }));
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["activePresets"]).toEqual([]);
  });

  /* ── Branch 3: el-locale ─────────────────────────────────────── */

  it("branch el-locale — Prefs.locale = 'el' → presetLocale = 'gr'", async () => {
    await store.set("rules", v1Rules());
    await store.set("prefs", { version: 1, locale: "el" });
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["presetLocale"]).toBe("gr");
  });

  it("branch el-locale — activePresets still set to default (no custom toggles)", async () => {
    await store.set("rules", v1Rules());
    await store.set("prefs", { version: 1, locale: "el" });
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["activePresets"]).toEqual(["preset.default.global"]);
  });

  /* ── Branch 4: en-locale ─────────────────────────────────────── */

  it("branch en-locale — Prefs.locale = 'en' → presetLocale = 'global'", async () => {
    await store.set("rules", v1Rules());
    await store.set("prefs", { version: 1, locale: "en" });
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["presetLocale"]).toBe("global");
  });

  /* ── Common fields seeded correctly ─────────────────────────── */

  it("seeds includeBetaDetectors = false", async () => {
    await store.set("rules", v1Rules());
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["includeBetaDetectors"]).toBe(false);
  });

  it("seeds manualOverrides = { enabled: [], disabled: [] }", async () => {
    await store.set("rules", v1Rules());
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["manualOverrides"]).toEqual({ enabled: [], disabled: [] });
  });

  it("seeds presetSnapshot in storage", async () => {
    await store.set("rules", v1Rules());
    await runMigrations(store);
    const snap = await store.get<Record<string, unknown>>("presetSnapshot");
    expect(snap).toBeDefined();
    expect(snap!["version"]).toBe(1);
    expect(snap!["byPreset"]).toBeDefined();
    expect(snap!["detectorRefCount"]).toBeDefined();
  });

  /* ── Idempotency (second run on v2 rules) ────────────────────── */

  it("idempotent — running migration twice does not clobber v2 rules", async () => {
    await store.set("rules", v1Rules());
    await runMigrations(store);
    const rules1 = await store.get<Record<string, unknown>>("rules");

    await runMigrations(store);
    const rules2 = await store.get<Record<string, unknown>>("rules");

    expect(rules2!["activePresets"]).toEqual(rules1!["activePresets"]);
    expect(rules2!["presetLocale"]).toBe(rules1!["presetLocale"]);
  });
});
