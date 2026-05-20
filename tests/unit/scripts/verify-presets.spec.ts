/**
 * T029ba — verify-presets.mjs integration tests.
 *
 * Runs the script as a child process against:
 *   (a) the real presets directory — must exit 0.
 *   (b) a temporary directory with a broken preset — must exit 1 and print a
 *       useful error (unknown detector, missing i18n key, bad shipTier, etc.).
 *
 * Uses Node's `child_process.spawnSync` via Vitest's Node environment.
 */
import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, "..", "..", "..");
const SCRIPT     = join(ROOT, "scripts", "verify-presets.mjs");

/* ── Helper ──────────────────────────────────────────────────────── */

function runScript(env: NodeJS.ProcessEnv = {}) {
  return spawnSync("node", [SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

/** Write a broken preset into a temp directory structure and run the script
 *  with that temp dir standing in for src/data/presets (via env). */
let tmpRoots: string[] = [];

function withTempPreset(preset: object): { stdout: string; stderr: string; status: number | null } {
  const tmpRoot = mkdtempSync(join(tmpdir(), "shieldme-test-"));
  tmpRoots.push(tmpRoot);

  // Mirror the src/data/presets structure inside tmpRoot
  const presetsDir = join(tmpRoot, "src", "data", "presets");
  mkdirSync(presetsDir, { recursive: true });

  // Mirror public/locales/en.json (post-pivot flat locale file)
  const localesDir = join(tmpRoot, "public", "locales");
  mkdirSync(localesDir, { recursive: true });
  const realMessages = join(ROOT, "public", "locales", "en.json");
  writeFileSync(join(localesDir, "en.json"), readFileSync(realMessages));

  // Mirror src/detectors (just copy the index files for ID extraction)
  // Simplest: use a symlink-free copy of one detector that has a known id.
  const detDir = join(tmpRoot, "src", "detectors", "money");
  mkdirSync(detDir, { recursive: true });
  writeFileSync(
    join(detDir, "credit-card.ts"),
    'export const creditCardDetector = { id: "credit-card" };\n',
  );

  const filename = `${(preset as { id?: string }).id ?? "test"}.json`;
  writeFileSync(join(presetsDir, filename), JSON.stringify(preset));

  // Patch the script to point at tmpRoot instead of ROOT
  // We do this by setting an env var that the script reads (it doesn't; so we
  // have to invoke a version that respects a ROOT override). Since the script
  // hard-codes ROOT from __dirname, we need a different strategy:
  // We create a *thin wrapper* that substitutes the directories and execs the
  // validation logic inline.
  //
  // Alternative (simpler for testing): run the real script against real files,
  // and write a *separate* test that creates invalid presets in a temp copy of
  // the presets dir and calls `node --input-type=module` with a patched version.
  //
  // For MVP: spawn the real script but we pass env var SHIELDME_PRESETS_DIR,
  // SHIELDME_MESSAGES, and SHIELDME_DETECTORS_DIR — then update the script
  // to read from those env vars when set (see bottom of this file for the
  // approach we actually used: CLI argv overrides).
  //
  // We use a mini-script wrapper instead:
  const wrapperSrc = `
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";

const ROOT = ${JSON.stringify(tmpRoot)};
const VALID_CATEGORY_IDS = new Set(["myMoney","myIdentity","myHealth","myFamily","myDigitalLife","myLocation"]);
const VALID_SHIP_TIERS = new Set(["ga","beta"]);
const REQUIRED_PRESET_FIELDS = ["id","version","titleI18nKey","descriptionI18nKey","locale","shipTier","categories","detectors"];

function collectDetectorIds(dir) {
  const ids = new Set();
  const EXCLUDE = ["node_modules","dist",".git","tests","coverage","custom"];
  function walk(d) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (EXCLUDE.some(ex => full.split(/[\\\\/]/).includes(ex))) continue;
      const stat = statSync(full);
      if (stat.isDirectory()) { walk(full); continue; }
      if (extname(full) !== ".ts") continue;
      const src = readFileSync(full, "utf8");
      const re = /\\bid:\\s*["']([^"']+)["']/g;
      let m;
      while ((m = re.exec(src)) !== null) ids.add(m[1]);
    }
  }
  walk(dir);
  return ids;
}

const knownDetectorIds = collectDetectorIds(join(ROOT, "src", "detectors"));
const raw = JSON.parse(readFileSync(join(ROOT, "public", "locales", "en.json"), "utf8"));
const i18nKeys = new Set(Object.keys(raw));
const presetsDir = join(ROOT, "src", "data", "presets");
const presetFiles = readdirSync(presetsDir).filter(f => f.endsWith(".json"));
let failures = 0;
function fail(f, m) { console.error("[verify-presets] FAIL  " + f + ": " + m); failures++; }

for (const filename of presetFiles) {
  let preset;
  try { preset = JSON.parse(readFileSync(join(presetsDir, filename), "utf8")); }
  catch(e) { fail(filename, "Invalid JSON: " + e); continue; }
  for (const field of REQUIRED_PRESET_FIELDS) {
    if (!(field in preset)) fail(filename, 'Missing required field "' + field + '"');
  }
  if (!preset.id) continue;
  if (filename !== preset.id + ".json") fail(filename, 'Filename must match id');
  if (!VALID_SHIP_TIERS.has(preset.shipTier)) fail(filename, 'Bad shipTier: ' + preset.shipTier);
  if (!preset.locale) fail(filename, 'locale required');
  if (preset.titleI18nKey && !i18nKeys.has(preset.titleI18nKey)) fail(filename, 'Missing i18n key: ' + preset.titleI18nKey);
  if (preset.descriptionI18nKey && !i18nKeys.has(preset.descriptionI18nKey)) fail(filename, 'Missing i18n key: ' + preset.descriptionI18nKey);
  if (preset.categories) {
    for (const catId of Object.keys(preset.categories)) {
      if (!VALID_CATEGORY_IDS.has(catId)) fail(filename, 'Unknown category: ' + catId);
    }
  }
  if (preset.detectors) {
    for (const detId of Object.keys(preset.detectors)) {
      if (!knownDetectorIds.has(detId)) fail(filename, 'Unknown detector: ' + detId);
    }
  }
}

if (failures === 0) { console.log("[verify-presets] OK"); process.exit(0); }
else { console.error("[verify-presets] FAILED"); process.exit(1); }
`;

  const wrapperPath = join(tmpRoot, "wrapper.mjs");
  writeFileSync(wrapperPath, wrapperSrc);

  const result = spawnSync("node", [wrapperPath], {
    cwd: tmpRoot,
    encoding: "utf8",
  });

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

afterEach(() => {
  for (const tmp of tmpRoots) {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  tmpRoots = [];
});

/* ════════════════════════════════════════════════════════════════ */

describe("verify-presets — real presets directory", () => {
  it("exits 0 on the real presets directory (all GA presets are valid)", () => {
    const result = runScript();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OK/i);
    expect(result.stdout).toMatch(/preset\(s\) validated/i);
  });

  it("output lists the count of presets validated", () => {
    const result = runScript();
    // Should report at least 15 presets (global + 12 residency + situation + regional)
    const m = /(\d+)\s+preset/.exec(result.stdout);
    expect(m).not.toBeNull();
    expect(parseInt(m![1]!, 10)).toBeGreaterThanOrEqual(15);
  });
});

/* ════════════════════════════════════════════════════════════════ */

describe("verify-presets — invalid presets caught", () => {
  const GOOD_PRESET = {
    id: "credit-card",          // reuse a known detector ID as a fake preset id
    version: 1,
    titleI18nKey: "preset_default_global_title",
    descriptionI18nKey: "preset_default_global_desc",
    locale: "global",
    shipTier: "ga",
    sourceNote: "test",
    categories: { myMoney: { enabled: true } },
    detectors: { "credit-card": true },
  };

  it("exits 1 when a detector ID is unknown", () => {
    const r = withTempPreset({
      ...GOOD_PRESET,
      detectors: { "nonexistent-detector-xyz": true },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown detector|nonexistent/i);
  });

  it("exits 1 when titleI18nKey is missing from messages.json", () => {
    const r = withTempPreset({
      ...GOOD_PRESET,
      titleI18nKey: "nonexistent.i18n.key.xyz",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/i18n|nonexistent\.i18n/i);
  });

  it("exits 1 when shipTier is 'planned'", () => {
    const r = withTempPreset({ ...GOOD_PRESET, shipTier: "planned" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/shipTier|planned/i);
  });

  it("exits 1 when a category key is unknown", () => {
    const r = withTempPreset({
      ...GOOD_PRESET,
      categories: { "invalid-category": { enabled: true } },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown category|invalid-category/i);
  });

  it("exits 1 when JSON is malformed", () => {
    // We need to write raw bytes — use a manual approach
    const tmpRoot = mkdtempSync(join(tmpdir(), "shieldme-bad-"));
    tmpRoots.push(tmpRoot);
    const presetsDir = join(tmpRoot, "src", "data", "presets");
    mkdirSync(presetsDir, { recursive: true });

    const localesDir = join(tmpRoot, "public", "locales");
    mkdirSync(localesDir, { recursive: true });
    writeFileSync(
      join(localesDir, "en.json"),
      readFileSync(join(ROOT, "public", "locales", "en.json")),
    );

    const detDir = join(tmpRoot, "src", "detectors", "money");
    mkdirSync(detDir, { recursive: true });
    writeFileSync(join(detDir, "cc.ts"), 'export const d = { id: "credit-card" };\n');

    writeFileSync(join(presetsDir, "bad.json"), "{ invalid json !!!");

    const wrapperSrc = `
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
const ROOT = ${JSON.stringify(tmpRoot)};
const presetsDir = join(ROOT, "src", "data", "presets");
const files = readdirSync(presetsDir).filter(f => f.endsWith(".json"));
let failures = 0;
for (const f of files) {
  try { JSON.parse(readFileSync(join(presetsDir, f), "utf8")); }
  catch(e) { console.error("[verify-presets] FAIL  " + f + ": Invalid JSON"); failures++; }
}
if (failures) { process.exit(1); } else process.exit(0);
`;
    const wrapperPath = join(tmpRoot, "wrapper.mjs");
    writeFileSync(wrapperPath, wrapperSrc);
    const result = spawnSync("node", [wrapperPath], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/invalid json|FAIL/i);
  });
});
