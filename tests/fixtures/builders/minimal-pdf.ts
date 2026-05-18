/**
 * Minimal PDF builder for unit tests.
 *
 * Generates a structurally valid PDF 1.4 document from an array of page
 * strings, using only Helvetica (built-in Type1) so no font embedding is
 * needed. The text is encoded via standard PDF BT/Tj operators.
 *
 * This lets parser unit tests run with a deterministic in-memory PDF instead
 * of committing binary fixtures.
 *
 * Limitations (acceptable for testing):
 *   - ASCII text only (no Unicode; PDF text strings need PDFDocEncoding or UTF-16 for wide chars)
 *   - No actual glyph positioning (the parser uses stream text, not rendered glyphs)
 *   - Only one font (Helvetica 12pt) per document
 */

/** Encode a string so it's safe inside PDF literal string delimiters `(…)`. */
function escapePdfStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Build a minimal valid PDF 1.4 document with the given page texts.
 *
 * @param pages  Array of page text strings (ASCII). Each becomes one page.
 * @returns      `Uint8Array` containing the raw PDF bytes.
 */
export function buildMinimalPdf(pages: string[]): Uint8Array {
  if (pages.length === 0) throw new Error("buildMinimalPdf: at least one page required");

  const enc = new TextEncoder();

  // --- Object numbering plan -------------------------------------------------
  // 1   Catalog
  // 2   Pages (node)
  // 3…n Page objects  (one per page)
  // n+1…2n Content streams (one per page)
  // last  Font (Helvetica, shared)
  const nPages = pages.length;
  const firstPageObj = 3;
  const firstContentObj = firstPageObj + nPages;
  const fontObjNum = firstContentObj + nPages;
  const totalObjs = fontObjNum; // highest object number

  // We'll accumulate raw text and record byte offsets for the xref table.
  let body = "";
  const offsets: number[] = new Array(totalObjs + 1).fill(0); // 1-indexed

  // Helper: append to body and return current offset
  const offset = () => enc.encode(body).length;

  // --- Build content stream strings ------------------------------------------
  const contentStreams: string[] = pages.map((text) => {
    const line = `BT\n/F1 12 Tf\n50 750 Td\n(${escapePdfStr(text)}) Tj\nET`;
    return line;
  });

  // --- Header ----------------------------------------------------------------
  body += "%PDF-1.4\n";
  // Binary comment to signal binary file (bytes > 127)
  body += "%\xe2\xe3\xcf\xd3\n\n";

  // --- Object 1: Catalog ------------------------------------------------------
  offsets[1] = offset();
  body += "1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n\n";

  // --- Object 2: Pages -------------------------------------------------------
  const kids = pages.map((_, i) => `${firstPageObj + i} 0 R`).join(" ");
  offsets[2] = offset();
  body += `2 0 obj\n<</Type /Pages /Kids [${kids}] /Count ${nPages}>>\nendobj\n\n`;

  // --- Objects 3…n: Page objects -------------------------------------------
  for (let i = 0; i < nPages; i++) {
    const pageObjNum = firstPageObj + i;
    const contentObjNum = firstContentObj + i;
    offsets[pageObjNum] = offset();
    body +=
      `${pageObjNum} 0 obj\n` +
      `<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n` +
      `  /Contents ${contentObjNum} 0 R\n` +
      `  /Resources <</Font <</F1 ${fontObjNum} 0 R>>>>>>\n` +
      `endobj\n\n`;
  }

  // --- Objects n+1…2n: Content streams ---------------------------------------
  for (let i = 0; i < nPages; i++) {
    const contentObjNum = firstContentObj + i;
    const streamData = contentStreams[i];
    const streamBytes = enc.encode(streamData).length;
    offsets[contentObjNum] = offset();
    body += `${contentObjNum} 0 obj\n<</Length ${streamBytes}>>\nstream\n${streamData}\nendstream\nendobj\n\n`;
  }

  // --- Font object -----------------------------------------------------------
  offsets[fontObjNum] = offset();
  body +=
    `${fontObjNum} 0 obj\n` +
    `<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\n` +
    `endobj\n\n`;

  // --- Cross-reference table -------------------------------------------------
  const xrefOffset = offset();
  let xref = `xref\n0 ${totalObjs + 1}\n`;
  // Object 0: free head
  xref += "0000000000 65535 f \n";
  for (let n = 1; n <= totalObjs; n++) {
    xref += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
  }
  body += xref;

  // --- Trailer ---------------------------------------------------------------
  body += `trailer\n<</Size ${totalObjs + 1} /Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return enc.encode(body);
}

/** Convenience: single-page PDF. */
export function buildSinglePagePdf(text: string): Uint8Array {
  return buildMinimalPdf([text]);
}
