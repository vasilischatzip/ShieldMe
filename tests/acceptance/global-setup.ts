/**
 * Playwright globalSetup — generates binary test fixtures for acceptance tests.
 *
 * Runs once before any acceptance tests. Creates:
 *   tests/fixtures/samples/tax-return-2025.pdf
 *     A 2-page PDF with planted PII used by AC-D1.
 *     • Page 1: SSN 123-45-6789 + IBAN GB29 NWBK 6016 1331 9268 19
 *     • Page 2: Full name + home address block
 */
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildMinimalPdf } from "../fixtures/builders/minimal-pdf";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const SAMPLES    = join(__dirname, "..", "fixtures", "samples");

export default async function globalSetup() {
  mkdirSync(SAMPLES, { recursive: true });

  // ── tax-return-2025.pdf (AC-D1) ─────────────────────────────────────
  const taxReturnPath = join(SAMPLES, "tax-return-2025.pdf");
  if (!existsSync(taxReturnPath)) {
    const pages = [
      // Page 1 — Tax ID (SSN) + bank account (IBAN)
      "Tax Return 2025 Taxpayer ID: 123-45-6789 " +
      "Bank Account IBAN: GB29 NWBK 6016 1331 9268 19",

      // Page 2 — Full name + home address
      "Taxpayer: John Smith " +
      "123 Main Street Springfield IL 62701 United States",
    ];
    const bytes = buildMinimalPdf(pages);
    writeFileSync(taxReturnPath, bytes);
  }
}
