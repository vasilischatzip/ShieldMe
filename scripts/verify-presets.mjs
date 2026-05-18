#!/usr/bin/env node
/**
 * verify-presets.mjs — CI gate for preset data files.
 *
 * Checks performed for every file in src/data/presets/*.json:
 *   1. Valid JSON and required fields present (id, version, titleI18nKey,
 *      descriptionI18nKey, locale, shipTier, categories, detectors).
 *   2. shipTier is "ga" or "beta" (never "planned").
 *   3. Every key in "categories" is a valid CategoryId.
 *   4. Every key in "detectors" is a known detector ID
 *      (discovered by scanning src/detectors/**\/*.ts for `id:` declarations).
 *   5. Every titleI18nKey and descriptionI18nKey exists in
 *      _locales/en/messages.json.
 *   6. "locale" is a non-empty string (ISO-3166-1 alpha-2 | "eu" | "global").
 *
 * Exits 0 when all checks pass, 1 on any failure.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, "..");

/* ── Constants ─────────────────────────────────────────────────── */

const VALID_CATEGORY_IDS = new Set([
  "myMoney",
  "myIdentity",
  "myHealth",
  "myFamily",
  "myDigitalLife",
  "myLocation",
]);

const VALID_SHIP_TIERS = new Set(["ga", "beta"]);

const REQUIRED_PRESET_FIELDS = [
  "id",
  "version",
  "titleI18nKey",
  "descriptionI18nKey",
  "locale",
  "shipTier",
  "categories",
  "detectors",
];

/* ── Step 1: Collect known detector IDs from source ─────────────── */

function collectDetectorIds(dir) {
  const ids = new Set();
  const EXCLUDE = ["node_modules", "dist", ".git", "tests", "coverage", "custom"];

  function walk(d) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (EXCLUDE.some((ex) => full.split(/[\\/]/).includes(ex))) continue;
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (extname(full) !== ".ts") continue;
      const src = readFileSync(full, "utf8");
      // Match `id: "some-detector-id"` and `id: 'some-detector-id'`
      const re = /\bid:\s*["']([^"']+)["']/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        ids.add(m[1]);
      }
    }
  }

  walk(dir);
  return ids;
}

const knownDetectorIds = collectDetectorIds(join(ROOT, "src", "detectors"));

/* ── Step 2: Load i18n keys ─────────────────────────────────────── */

const messagesPath = join(ROOT, "_locales", "en", "messages.json");
let i18nKeys;
try {
  const raw = JSON.parse(readFileSync(messagesPath, "utf8"));
  i18nKeys = new Set(Object.keys(raw));
} catch (e) {
  console.error(`[verify-presets] Could not read ${messagesPath}: ${e}`);
  process.exit(1);
}

/* ── Step 3: Load and validate each preset ─────────────────────── */

const presetsDir = join(ROOT, "src", "data", "presets");

if (!existsSync(presetsDir)) {
  console.log("[verify-presets] No presets directory yet. Skipping.");
  process.exit(0);
}

let presetFiles;
try {
  presetFiles = readdirSync(presetsDir).filter((f) => f.endsWith(".json"));
} catch (e) {
  console.error(
    `[verify-presets] Could not read presets directory (${presetsDir}): ${e}`,
  );
  process.exit(1);
}

if (presetFiles.length === 0) {
  console.log("[verify-presets] 0 preset files found. OK.");
  process.exit(0);
}

let failures = 0;

function fail(file, msg) {
  console.error(`[verify-presets] FAIL  ${file}: ${msg}`);
  failures++;
}

for (const filename of presetFiles) {
  const filePath = join(presetsDir, filename);
  let preset;

  // --- Parse JSON ---
  try {
    preset = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (e) {
    fail(filename, `Invalid JSON — ${e}`);
    continue;
  }

  // --- Required fields ---
  for (const field of REQUIRED_PRESET_FIELDS) {
    if (!(field in preset)) {
      fail(filename, `Missing required field "${field}"`);
    }
  }
  if (!preset.id) continue; // can't proceed without an id

  // --- Filename matches id ---
  const expectedFilename = `${preset.id}.json`;
  if (filename !== expectedFilename) {
    fail(
      filename,
      `Filename must match id → expected "${expectedFilename}"`,
    );
  }

  // --- shipTier ---
  if (!VALID_SHIP_TIERS.has(preset.shipTier)) {
    fail(
      filename,
      `shipTier "${preset.shipTier}" is not valid — must be "ga" or "beta"`,
    );
  }

  // --- locale ---
  if (!preset.locale || typeof preset.locale !== "string") {
    fail(filename, `locale must be a non-empty string`);
  }

  // --- i18n keys ---
  if (preset.titleI18nKey && !i18nKeys.has(preset.titleI18nKey)) {
    fail(
      filename,
      `titleI18nKey "${preset.titleI18nKey}" not found in _locales/en/messages.json`,
    );
  }
  if (preset.descriptionI18nKey && !i18nKeys.has(preset.descriptionI18nKey)) {
    fail(
      filename,
      `descriptionI18nKey "${preset.descriptionI18nKey}" not found in _locales/en/messages.json`,
    );
  }

  // --- categories ---
  if (typeof preset.categories === "object" && preset.categories !== null) {
    for (const catId of Object.keys(preset.categories)) {
      if (!VALID_CATEGORY_IDS.has(catId)) {
        fail(filename, `Unknown categoryId "${catId}" in categories`);
      }
      const catVal = preset.categories[catId];
      if (
        typeof catVal !== "object" ||
        catVal === null ||
        typeof catVal.enabled !== "boolean"
      ) {
        fail(filename, `categories["${catId}"] must be { enabled: boolean }`);
      }
    }
  }

  // --- detectors ---
  if (typeof preset.detectors === "object" && preset.detectors !== null) {
    for (const detId of Object.keys(preset.detectors)) {
      if (!knownDetectorIds.has(detId)) {
        fail(
          filename,
          `Unknown detector "${detId}" — not found in any src/detectors/**/*.ts`,
        );
      }
      if (typeof preset.detectors[detId] !== "boolean") {
        fail(filename, `detectors["${detId}"] must be a boolean`);
      }
    }
  }
}

/* ── Summary ────────────────────────────────────────────────────── */

if (failures === 0) {
  console.log(
    `[verify-presets] OK — ${presetFiles.length} preset(s) validated successfully.`,
  );
  process.exit(0);
} else {
  console.error(
    `\n[verify-presets] FAILED — ${failures} error(s) across ${presetFiles.length} preset file(s).`,
  );
  process.exit(1);
}
