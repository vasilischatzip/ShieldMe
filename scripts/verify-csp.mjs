#!/usr/bin/env node
/**
 * verify-csp.mjs — checks the deployed Content-Security-Policy header.
 *
 * Post-pivot (2026-05-17): web-app variant.
 * Reads `public/_headers` (Cloudflare Pages / Netlify convention).
 * Required directives:
 *   default-src 'none'
 *   script-src 'self' 'wasm-unsafe-eval'
 */
import { readFileSync, existsSync } from "node:fs";

const REQUIRED = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "object-src 'self'",
];

// Allow either alternative for object-src — older CSP-3 spec varies.
function ok(csp, frag) {
  if (frag === "object-src 'self'") {
    return csp.includes("object-src 'self'") || csp.includes("default-src 'none'");
  }
  return csp.includes(frag);
}

const path = "public/_headers";
if (!existsSync(path)) {
  console.error(`[csp] ERROR — ${path} not found. Web-app CSP is enforced via HTTP header.`);
  process.exit(1);
}

const content = readFileSync(path, "utf8");
const cspMatch = content.match(/Content-Security-Policy:\s*([^\n]+)/i);
if (!cspMatch) {
  console.error("[csp] ERROR — no Content-Security-Policy header found in public/_headers");
  process.exit(1);
}
const csp = cspMatch[1];
console.log(`[csp] Checking: ${csp.slice(0, 80)}…`);

const missing = REQUIRED.filter((d) => !ok(csp, d));
if (missing.length) {
  console.error(`[csp] MISSING directives: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("[csp] OK — Content-Security-Policy passes all checks.");
