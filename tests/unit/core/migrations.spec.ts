import { describe, it, expect, beforeEach } from "vitest";
import { FakeLocalStore } from "../../fakes/fake-storage";
import { runMigrations, CURRENT_META_VERSION, type MetaRecord } from "~/core/migrations";

describe("runMigrations", () => {
  let store: FakeLocalStore;

  beforeEach(() => {
    store = new FakeLocalStore();
  });

  it("cold-boot: seeds meta with installId + wrappingKey", async () => {
    const result = await runMigrations(store);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.migrationsRun).toContain("meta:init");

    const meta = await store.get<MetaRecord>("meta");
    expect(meta).toBeDefined();
    expect(meta!.installId).toBeTruthy();
    expect(meta!.wrappingKey).toBeTruthy();
    expect(meta!.installedAt).toBeTruthy();
    expect(meta!.version).toBe(CURRENT_META_VERSION);
  });

  it("cold-boot: wrappingKey is a valid base64 string (44 chars, 32 raw bytes)", async () => {
    await runMigrations(store);
    const meta = await store.get<MetaRecord>("meta");
    expect(meta!.wrappingKey.length).toBe(44);
    // Valid base64 charset
    expect(meta!.wrappingKey).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("idempotent: running twice does not re-seed or overwrite the wrapping key", async () => {
    await runMigrations(store);
    const meta1 = await store.get<MetaRecord>("meta");

    await runMigrations(store);
    const meta2 = await store.get<MetaRecord>("meta");

    expect(meta2!.installId).toBe(meta1!.installId);
    expect(meta2!.wrappingKey).toBe(meta1!.wrappingKey);
  });

  it("second run returns empty migrationsRun (nothing to migrate)", async () => {
    await runMigrations(store);
    const result2 = await runMigrations(store);
    expect(result2.status).toBe("ok");
    if (result2.status === "ok") expect(result2.migrationsRun).toHaveLength(0);
  });

  it("migrates rules v1 → v2: seeds activePresets, presetLocale, includeBetaDetectors, manualOverrides", async () => {
    // Pre-seed a v1 rules record
    await store.set("rules", {
      version: 1,
      categories: {},
      customRules: [],
      whitelists: { recipients: [], domains: [] },
    });

    await runMigrations(store);

    const rules = await store.get<Record<string, unknown>>("rules");
    expect(rules!["version"]).toBe(2);
    expect(rules!["activePresets"]).toEqual(["preset.default.global"]);
    expect(rules!["presetLocale"]).toBe("global");
    expect(rules!["includeBetaDetectors"]).toBe(false);
    expect(rules!["manualOverrides"]).toEqual({ enabled: [], disabled: [] });
  });

  it("does not migrate rules that are already v2", async () => {
    await store.set("rules", { version: 2, categories: {}, customRules: [], whitelists: {} });
    await runMigrations(store);
    const rules = await store.get<Record<string, unknown>>("rules");
    // Still v2, no additional fields broken
    expect(rules!["version"]).toBe(2);
  });
});
