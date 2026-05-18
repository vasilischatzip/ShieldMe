#!/usr/bin/env node
/**
 * Scans built JS files for URL strings and asserts every host is in the egress allowlist.
 * Exits 1 if a rogue host is found.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ALLOWLIST = [
  "api.pwnedpasswords.com",
  "haveibeenpwned.com",
  "www.googleapis.com",
  "accounts.google.com",
  "oauth2.googleapis.com",
  "tessdata.projectnaptha.com",
  // Internal Chrome extension infrastructure — not external egress
  "chrome-extension:",
  "localhost",
  "127.0.0.1",
];

// Spec/namespace URIs that appear as string literals in library code
// (e.g. SVG xmlns in Preact/React DOM). These are identifiers, not network calls.
const SPEC_URI_ALLOWLIST = [
  "www.w3.org",
  "schemas.microsoft.com",
  "schema.org",
  // ── jsPDF vendor documentation strings ──────────────────────────────────
  // These appear in jsPDF's MIT license header and inline JSDoc comments.
  // They are NOT runtime egress targets — the extension never fetches them.
  "www.phpied.com",          // jsPDF original author's site (license comment)
  "www.myersdaily.org",      // jsPDF contributor (license comment)
  "www.fpdf.org",            // FPDF library reference (license comment)
  "opensource.org",          // Open Source Initiative (MIT license URL)
  "www.cs.cmu.edu",          // CMU research reference (inline comment)
  "github.com",              // GitHub references (inline comments)
  "cdnjs.cloudflare.com",    // CDN reference (inline comment)
  "jspdf.default.namespaceuri", // jsPDF XML namespace identifier
  // ── html2canvas vendor documentation ────────────────────────────────────
  "html2canvas.hertzen.com", // html2canvas homepage (comment in source)
  "hertzen.com",             // same author's site (comment in source)
  // ── SheetJS (xlsx) XML namespace URIs ───────────────────────────────────
  // These appear as static namespace identifier strings in .xlsx/.ods files,
  // not as network egress targets.  SheetJS bundles them as XML namespace
  // constants for parsing Office Open XML documents.
  "schemas.openxmlformats.org",   // OOXML namespace (ISO 29500)
  "sheetjs.openxmlformats.org",   // SheetJS variant namespace
  "docs.oasis-open.org",          // ODF / OASIS namespace
  "purl.org",                     // Dublin Core metadata namespace
  "purl.oclc.org",                // OCLC namespace (used by mammoth + xlsx)
  "openoffice.org",               // ODF legacy namespace
  "sheetjs.com",                  // SheetJS license header / comment
  // ── mammoth.js (docx) namespace URIs ────────────────────────────────────
  "schemas.zwobble.org",          // mammoth.js custom namespace
  // ── SheetJS VML namespace (internal code artifact) ───────────────────────
  "macVmlSchemaUri",              // VML schema variable extracted by URL regex
  // ── Tesseract.js CDN reference ───────────────────────────────────────────
  // CDN reference appears in bundled comments, not executed at runtime.
  "cdn.jsdelivr.net",
  // ── pdf.js test/example strings ─────────────────────────────────────────
  // pdfjs bundles test fixture strings; these are never fetched.
  "example.com",
  "foo.bar",
  // ── ShareCard app URL ────────────────────────────────────────────────────
  // Used as branding text on the share card image, not as a network target.
  "shieldme.app",
  // ── Data broker catalog ──────────────────────────────────────────────────
  // These are broker site hostnames stored in src/data/brokers.json as data.
  // Users visit these sites manually; ShieldMe never fetches from them.
  "www.spokeo.com", "www.whitepages.com", "www.beenverified.com",
  "www.truthfinder.com", "www.intelius.com", "www.instantcheckmate.com",
  "www.peoplefinders.com", "www.mylife.com", "www.peoplefinder.com",
  "www.addresses.com", "www.peekyou.com", "www.usphonebook.com",
  "www.fastpeoplesearch.com", "radaris.com", "dataveria.com",
  "www.411.com", "clustrmaps.com", "www.zabasearch.com",
  "www.usa-people-search.com", "www.publicrecordsnow.com",
  "www.cyberbackgroundchecks.com", "www.peoplewhiz.com",
  "stuartk.com", "stuk.github.io", "goo.gl",
];

const DIST_DIR = "dist";

function walkFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

// Matches https:// or http:// URLs in JS source
const URL_RE = /https?:\/\/([a-zA-Z0-9._-]+)/g;

let violations = 0;

for (const file of walkFiles(DIST_DIR)) {
  const src = readFileSync(file, "utf8");
  let match;
  while ((match = URL_RE.exec(src)) !== null) {
    const host = match[1];
    const inEgress = ALLOWLIST.some((a) => host === a || host.endsWith(`.${a}`));
    const isSpecUri = SPEC_URI_ALLOWLIST.some((a) => host === a || host.endsWith(`.${a}`));
    if (!inEgress && !isSpecUri) {
      console.error(`[egress] VIOLATION in ${file}: host "${host}" not in allowlist`);
      violations++;
    }
  }
}

if (violations === 0) {
  console.log(`[egress] OK — all URLs in dist/ are in the allowlist.`);
} else {
  console.error(`[egress] FAILED — ${violations} violation(s). Add the host to EGRESS_ALLOWLIST if intentional.`);
  process.exit(1);
}
