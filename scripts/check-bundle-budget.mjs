#!/usr/bin/env node
/**
 * Enforces bundle size budgets per plan.md + spec.md NFR-B1:
 *   - Total dist/     ≤ 25 MB
 *   - Popup JS bundle ≤ 500 KB (initial, not including lazy chunks)
 */
import { readdirSync, statSync } from "fs";
import { join, basename } from "path";

const TOTAL_LIMIT_BYTES = 25 * 1024 * 1024;   // 25 MB
const POPUP_LIMIT_BYTES = 500 * 1024;          // 500 KB

const DIST_DIR = "dist";

function walkFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function fmt(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const files = walkFiles(DIST_DIR);
let totalBytes = 0;
let popupBytes = 0;

const rows = [];
for (const f of files) {
  const size = statSync(f).size;
  totalBytes += size;
  const name = basename(f);

  // Popup initial JS: the chunk that contains the popup entry (index.html-*.js)
  // Exclude lazy parser chunks (parser-pdf, parser-docx, parser-xlsx, parser-ocr, export-pdf)
  const isPopupEntry =
    f.includes("index.html") && f.endsWith(".js") && !name.includes("parser-") && !name.includes("export-");

  if (isPopupEntry) popupBytes += size;
  rows.push({ path: f.replace(DIST_DIR + "/", "").replace(DIST_DIR + "\\", ""), size, isPopupEntry });
}

// Print table
const sorted = rows.sort((a, b) => b.size - a.size);
console.log("\nBundle breakdown:");
console.log("─".repeat(70));
for (const r of sorted) {
  const tag = r.isPopupEntry ? " [popup-initial]" : "";
  console.log(`  ${fmt(r.size).padStart(10)}  ${r.path}${tag}`);
}
console.log("─".repeat(70));
console.log(`  ${"Total:".padStart(10)}  ${fmt(totalBytes)}`);
console.log(`  ${"Popup JS:".padStart(10)}  ${fmt(popupBytes)}`);
console.log();

let failed = false;

if (totalBytes > TOTAL_LIMIT_BYTES) {
  console.error(`[budget] FAIL: dist/ total ${fmt(totalBytes)} exceeds limit of ${fmt(TOTAL_LIMIT_BYTES)}`);
  failed = true;
} else {
  console.log(`[budget] OK:   dist/ total ${fmt(totalBytes)} ≤ ${fmt(TOTAL_LIMIT_BYTES)}`);
}

if (popupBytes > POPUP_LIMIT_BYTES) {
  console.error(`[budget] FAIL: popup initial JS ${fmt(popupBytes)} exceeds limit of ${fmt(POPUP_LIMIT_BYTES)}`);
  failed = true;
} else {
  console.log(`[budget] OK:   popup initial JS ${fmt(popupBytes)} ≤ ${fmt(POPUP_LIMIT_BYTES)}`);
}

if (failed) process.exit(1);
