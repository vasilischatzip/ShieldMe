/**
 * PDF parser — T024b.
 *
 * Extracts plain text from PDF files using pdfjs-dist.
 * Loaded lazily (dynamic import) so the ~2.5 MB PDF.js bundle is only
 * fetched when the user actually tries to scan a PDF file.
 *
 * Design:
 *   • Worker is set to the bundled PDF.js worker (via Vite asset URL).
 *   • Each page's text content is extracted and concatenated with page
 *     labels so detectors can surface "page 3, line 5" context.
 *   • Encrypted / password-protected PDFs are caught and reported as
 *     a decode-failed error.
 *   • Maximum pages configurable to cap very long documents.
 *
 * Privacy: no data leaves the device. PDF bytes are processed in-process.
 *
 * Contract: docs/engineering-qa.md §Q2
 */

export type PdfParseResult =
  | { ok: true;  text: string;  pageCount: number; warnings?: string[] }
  | { ok: false; reason: string };

/** Maximum pages to extract text from before truncating (performance guard). */
const MAX_PAGES_DEFAULT = 500;

/**
 * Extract all text from a PDF ArrayBuffer.
 *
 * @param buffer   PDF file bytes.
 * @param maxPages Truncate extraction after this many pages (default 500).
 * @returns PdfParseResult
 */
export async function parsePdf(
  buffer: ArrayBuffer,
  maxPages = MAX_PAGES_DEFAULT,
): Promise<PdfParseResult> {
  try {
    // Lazy-load pdfjs-dist so it doesn't bloat the initial popup bundle
    const pdfjs = await import("pdfjs-dist");

    // Set worker source — Vite will resolve this to a bundled asset URL.
    // In the extension context the worker runs in the same origin as the
    // extension pages; no cross-origin issues.
    // Note: pdfjs-dist v4+ exposes a separate worker entry point.
    // We use a fake-worker fallback if the worker URL isn't available
    // (e.g. in jsdom test environment).
    try {
      const workerUrl = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      );
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.toString();
    } catch {
      // In test environments, use the legacy no-worker mode
      pdfjs.GlobalWorkerOptions.workerSrc = "";
    }

    const loadTask = pdfjs.getDocument({
      data:           new Uint8Array(buffer),
      useWorkerFetch: false,
      useSystemFonts: true,
    });

    const pdf = await loadTask.promise;
    const pageCount = pdf.numPages;
    const cappedCount = Math.min(pageCount, maxPages);
    const warnings: string[] = [];

    if (pageCount > maxPages) {
      warnings.push(
        `PDF has ${pageCount} pages; only the first ${maxPages} were scanned.`,
      );
    }

    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= cappedCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      // Concatenate text items with newlines between blocks
      const lineTexts: string[] = [];
      let currentLine = "";
      let lastY: number | null = null;

      for (const item of content.items) {
        // pdfjs-dist text items have a `str` property and transform matrix
        const textItem = item as { str: string; transform?: number[]; hasEOL?: boolean };
        if (!textItem.str) continue;

        const y = textItem.transform?.[5] ?? 0;

        // New line if Y position changed significantly (different text row)
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (currentLine.trim()) lineTexts.push(currentLine.trim());
          currentLine = "";
        }
        currentLine += textItem.str;
        if (textItem.hasEOL) {
          if (currentLine.trim()) lineTexts.push(currentLine.trim());
          currentLine = "";
        }
        lastY = y;
      }
      if (currentLine.trim()) lineTexts.push(currentLine.trim());

      if (lineTexts.length > 0) {
        pageTexts.push(`[Page ${pageNum}]\n${lineTexts.join("\n")}`);
      }
    }

    const text = pageTexts.join("\n\n");

    return {
      ok: true,
      text,
      pageCount,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Detect password-protected PDFs
    if (/password/i.test(msg) || /encrypted/i.test(msg)) {
      return {
        ok: false,
        reason: "PDF is password-protected — cannot extract text",
      };
    }
    return {
      ok: false,
      reason: `PDF parse error: ${msg}`,
    };
  }
}
