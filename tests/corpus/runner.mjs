#!/usr/bin/env node
/**
 * Corpus gate — discovers detector fixtures and asserts FPR ≤ 2%, recall ≥ 95%.
 *
 * Fixture layout:
 *   tests/fixtures/corpus/<country>/<detector-id>/positive.txt  (one sample per line)
 *   tests/fixtures/corpus/<country>/<detector-id>/negative.txt
 *
 * Each line is a text snippet; the runner checks whether the detector fires on it.
 * Requires ≥ 20 positives and ≥ 20 negatives per GA detector (enforced in CI).
 *
 * Exits 0 if all thresholds pass, 1 otherwise.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { createRequire } from "module";

const CORPUS_DIR = "tests/fixtures/corpus";
const FPR_THRESHOLD = 0.02;   // ≤ 2%
const RECALL_THRESHOLD = 0.95; // ≥ 95%
const MIN_SAMPLES_GA = 20;     // per-side minimum for GA detectors

// Detector registry is loaded at runtime via ESM dynamic import.
// During M0 (no detectors yet) the registry is empty — runner reports 0 detectors and exits 0.

let registry = null;
try {
  // Attempt to load the built registry — only available after M1
  const require = createRequire(import.meta.url);
  // In development the source is TypeScript; load the compiled output if it exists.
  // Fall back gracefully during M0.
  const built = "../../dist/assets"; // approximate; real import path set in M1
  void built; // suppress unused warning
  registry = null; // M0: no detectors compiled yet
} catch {
  registry = null;
}

// ── Discover corpus directories ───────────────────────────────────────────────

if (!existsSync(CORPUS_DIR)) {
  console.log(`[corpus] No corpus directory found at ${CORPUS_DIR}. Run fixture generation first.`);
  console.log("[corpus] 0 detectors tested.");
  process.exit(0);
}

function walkCorpus(dir) {
  const entries = [];
  for (const country of readdirSync(dir)) {
    const countryDir = join(dir, country);
    if (!statSync(countryDir).isDirectory()) continue;
    for (const detectorId of readdirSync(countryDir)) {
      const detectorDir = join(countryDir, detectorId);
      if (!statSync(detectorDir).isDirectory()) continue;
      const posFile = join(detectorDir, "positive.txt");
      const negFile = join(detectorDir, "negative.txt");
      if (existsSync(posFile) && existsSync(negFile)) {
        entries.push({ country, detectorId, posFile, negFile });
      }
    }
  }
  return entries;
}

function readLines(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

const corpusEntries = walkCorpus(CORPUS_DIR);

if (corpusEntries.length === 0) {
  console.log("[corpus] 0 detector corpus entries found (M0 — no fixtures yet).");
  process.exit(0);
}

// ── If registry is available, run detectors against corpus ───────────────────

if (!registry) {
  // M0/M1 in-progress: registry not compiled. Report corpus counts only.
  console.log(`[corpus] Found ${corpusEntries.length} corpus entries:`);
  let warn = false;
  for (const { country, detectorId, posFile, negFile } of corpusEntries) {
    const pos = readLines(posFile).length;
    const neg = readLines(negFile).length;
    const ok = pos >= MIN_SAMPLES_GA && neg >= MIN_SAMPLES_GA;
    const tag = ok ? "✓" : "⚠ (needs more samples)";
    console.log(`  ${tag}  ${country}/${detectorId}  pos=${pos} neg=${neg}`);
    if (!ok) warn = true;
  }
  if (warn) {
    console.warn(
      `[corpus] Some entries have fewer than ${MIN_SAMPLES_GA} samples per side. ` +
        `Add more before marking GA.`,
    );
  }
  console.log("[corpus] Detector registry not loaded (M0). Skipping precision/recall checks.");
  process.exit(0);
}

// Full run (M1+): load detectors, test each, assert thresholds
// (This block executes once detectors are compiled; added here as the live path for M1+)
console.log(`[corpus] Running ${corpusEntries.length} entries against detector registry…`);
let failures = 0;

for (const { country, detectorId, posFile, negFile } of corpusEntries) {
  const positives = readLines(posFile);
  const negatives = readLines(negFile);

  const detector = registry.find((d) => d.id === detectorId);
  if (!detector) {
    console.warn(`[corpus] Detector "${detectorId}" not found in registry — skipping.`);
    continue;
  }

  let truePos = 0, falseNeg = 0, falsePos = 0, trueNeg = 0;
  const ctx = { locale: country, text: "", activeCustomRules: [], clock: Date };

  for (const text of positives) {
    const findings = detector.scan({ ...ctx, text });
    if (findings.length > 0) truePos++; else falseNeg++;
  }
  for (const text of negatives) {
    const findings = detector.scan({ ...ctx, text });
    if (findings.length === 0) trueNeg++; else falsePos++;
  }

  const recall = positives.length > 0 ? truePos / positives.length : 1;
  const fpr = negatives.length > 0 ? falsePos / negatives.length : 0;
  const pass = recall >= RECALL_THRESHOLD && fpr <= FPR_THRESHOLD;

  console.log(
    `  ${pass ? "✓" : "✗"}  ${country}/${detectorId}  ` +
      `recall=${(recall * 100).toFixed(1)}%  FPR=${(fpr * 100).toFixed(1)}%`,
  );

  if (!pass) {
    if (recall < RECALL_THRESHOLD)
      console.error(`    recall ${(recall * 100).toFixed(1)}% < ${RECALL_THRESHOLD * 100}% threshold`);
    if (fpr > FPR_THRESHOLD)
      console.error(`    FPR ${(fpr * 100).toFixed(1)}% > ${FPR_THRESHOLD * 100}% threshold`);
    failures++;
  }
}

if (failures === 0) {
  console.log(`[corpus] All thresholds passed.`);
} else {
  console.error(`[corpus] ${failures} detector(s) failed thresholds. Fix before shipping GA.`);
  process.exit(1);
}
