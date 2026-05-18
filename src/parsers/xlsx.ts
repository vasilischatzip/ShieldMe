/**
 * XLSX / XLS / CSV parser — T024b.
 *
 * Extracts structured text from spreadsheet files using SheetJS (xlsx).
 * Loaded lazily so the ~800 KB SheetJS bundle is only fetched when needed.
 *
 * Design:
 *   • Iterates all sheets; each sheet is labelled in the output.
 *   • Cells are formatted as "ColumnRow: value" tuples, one per line.
 *   • Empty cells are skipped.
 *   • Maximum rows per sheet configurable to cap very large spreadsheets.
 *   • Password-protected XLSX files are caught and reported.
 *
 * Privacy: no data leaves the device.
 * Contract: docs/engineering-qa.md §Q2
 */

export type XlsxParseResult =
  | { ok: true;  text: string;  sheetCount: number; warnings?: string[] }
  | { ok: false; reason: string };

/** Maximum rows to extract per sheet (performance guard). */
const MAX_ROWS_DEFAULT = 10_000;

/**
 * Extract text from a spreadsheet ArrayBuffer (XLSX, XLS, CSV, ODS).
 *
 * @param buffer   Spreadsheet file bytes.
 * @param maxRows  Maximum rows per sheet (default 10 000).
 */
export async function parseXlsx(
  buffer: ArrayBuffer,
  maxRows = MAX_ROWS_DEFAULT,
): Promise<XlsxParseResult> {
  try {
    // Lazy-load SheetJS
    const XLSX = await import("xlsx");

    const workbook = XLSX.read(new Uint8Array(buffer), {
      type:     "array",
      cellText: true,   // coerce to string
      cellDates: false, // keep dates as strings for pattern matching
    });

    const { SheetNames, Sheets } = workbook;
    const warnings: string[] = [];
    const sheetTexts: string[] = [];

    for (const name of SheetNames) {
      const sheet = Sheets[name];
      if (!sheet) continue;

      // Convert to array-of-arrays for row iteration
      const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header:        1,          // row index = column 0..N
        defval:        "",         // empty cells → empty string
        blankrows:     false,
        raw:           false,      // coerce to formatted string
      });

      const rowLines: string[] = [];
      let rowCount = 0;

      for (const row of aoa) {
        if (rowCount >= maxRows) {
          warnings.push(
            `Sheet "${name}": truncated at ${maxRows} rows (${aoa.length} total).`,
          );
          break;
        }
        // Collect non-empty cell values
        const cells = (row as unknown[])
          .map((cell, colIdx) => {
            const val = String(cell).trim();
            if (!val) return null;
            // Use Excel-style column label (A, B, … Z, AA, AB, …)
            const col = colLabel(colIdx);
            return `${col}${rowCount + 1}: ${val}`;
          })
          .filter(Boolean);

        if (cells.length > 0) {
          rowLines.push(cells.join("  |  "));
        }
        rowCount++;
      }

      if (rowLines.length > 0) {
        sheetTexts.push(`[Sheet: ${name}]\n${rowLines.join("\n")}`);
      }
    }

    const text = sheetTexts.join("\n\n");

    return {
      ok:         true,
      text,
      sheetCount: SheetNames.length,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password/i.test(msg) || /encrypted/i.test(msg)) {
      return {
        ok: false,
        reason: "Spreadsheet is password-protected — cannot extract text",
      };
    }
    return {
      ok: false,
      reason: `Spreadsheet parse error: ${msg}`,
    };
  }
}

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Convert 0-based column index to Excel-style label: 0→A, 25→Z, 26→AA. */
function colLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}
