/**
 * DOCX parser — T024b.
 *
 * Extracts plain text from DOCX (and legacy .doc) files using mammoth.js.
 * Loaded lazily so the ~400 KB mammoth bundle is only fetched when needed.
 *
 * Design:
 *   • Uses mammoth.extractRawText() — strips all formatting, returns only text.
 *   • Mammoth warnings (e.g. "unrecognised element", embedded objects) are
 *     collected and returned so the UI can surface them if needed.
 *   • Legacy .doc format is not supported by mammoth and falls back with
 *     a clear error message.
 *
 * Privacy: no data leaves the device.
 * Contract: docs/engineering-qa.md §Q2
 */

export type DocxParseResult =
  | { ok: true;  text: string;  warnings?: string[] }
  | { ok: false; reason: string };

/**
 * Extract plain text from a DOCX ArrayBuffer.
 */
export async function parseDocx(
  buffer: ArrayBuffer,
): Promise<DocxParseResult> {
  try {
    // Lazy-load mammoth so it doesn't bloat the initial popup bundle
    const mammoth = await import("mammoth");

    const result = await mammoth.extractRawText({ arrayBuffer: buffer });

    const warnings: string[] = result.messages
      .filter(m => m.type === "warning")
      .map(m => m.message);

    return {
      ok: true,
      text: result.value,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `DOCX parse error: ${msg}`,
    };
  }
}

/**
 * Legacy .doc format — not supported by mammoth.
 * Returns an error with instructions.
 */
export function parseLegacyDoc(): DocxParseResult {
  return {
    ok: false,
    reason: "Legacy .doc format is not supported. Please save as .docx and try again.",
  };
}
