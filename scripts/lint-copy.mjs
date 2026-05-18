#!/usr/bin/env node
/**
 * Copy linter — bans enterprise/jargon terms from user-facing strings.
 * Scans: src/**\/*.{ts,tsx}, _locales/**\/messages.json
 * Per constitution principle 4 (Consumer language) and FR-R7.6.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

/**
 * Terms that MUST NOT appear in UI-facing strings.
 * Add to this list — never remove.
 */
const BANNED_TERMS = [
  // Enterprise/regulatory jargon
  "DLP",
  "HIPAA",
  "GDPR",
  "PIPEDA",
  "APPI",
  "POPIA",
  "LGPD",
  "PCI-DSS",
  "PCI DSS",
  "SOX",
  "FISMA",
  // Technical jargon
  "regex",
  "classifier",
  "entropy",
  "policy template",
  "sensitive information type",
  "SIT",
  // Confusing abbreviations in UI context
  "DLP policy",
];

/** Files / dirs to exclude from scanning */
const EXCLUDE = [
  "node_modules",
  "dist",
  ".git",
  "docs",           // docs are for engineers, not users
  "specs",
  "scripts",        // this script + other build tools
  "tests",
  "coverage",
  "src/data",       // machine-readable data files (sourceNote is engineering-only)
];

function shouldExclude(p) {
  // Normalise to forward slashes for cross-platform matching
  const normalised = p.replace(/\\/g, "/");
  return EXCLUDE.some((ex) => normalised.includes(ex));
}

function walkFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (shouldExclude(full)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walkFiles(full));
    else if ([".ts", ".tsx", ".json"].includes(extname(full))) files.push(full);
  }
  return files;
}

let violations = 0;

for (const file of walkFiles(".")) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Skip comments and code-only lines (const, import, type, etc.) — only flag string literals
    // In JSON: all values are user-facing. In TS/TSX: flag string literals.
    for (const term of BANNED_TERMS) {
      // Use word-boundary regex so short abbreviations (e.g. "SIT") don't
      // match substrings inside benign words like "diversity" or "position".
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (!re.test(line)) continue;

      // In TS/TSX files, skip lines that are clearly non-UI
      // (type annotations, comments, imports, identifiers).
      const isTsFile = file.endsWith(".ts") || file.endsWith(".tsx");
      if (isTsFile) {
        const trimmed = line.trim();
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("import ") ||
          trimmed.startsWith("export type") ||
          trimmed.startsWith("type ") ||
          trimmed.startsWith("interface ")
        ) {
          continue;
        }
      }
      console.error(
        `[copy-lint] BANNED term "${term}" in ${file}:${i + 1}\n  > ${line.trim()}`,
      );
      violations++;
    }
  }
}

if (violations === 0) {
  console.log("[copy-lint] OK — no banned terms found in user-facing strings.");
} else {
  console.error(`\n[copy-lint] FAILED — ${violations} violation(s). Remove jargon from UI copy.`);
  process.exit(1);
}
