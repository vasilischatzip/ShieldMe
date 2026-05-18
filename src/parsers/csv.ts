/**
 * CSV parser — T056.
 *
 * Parses CSV/TSV text into a flat text string and an XlsxOffsetMap-compatible
 * cell list so findings inside a spreadsheet-like file can show
 * "Sheet1, row N, column C" provenance.
 *
 * Design:
 *   • Handles comma or tab delimiters (auto-detect: tabs win if present).
 *   • Strips surrounding double-quotes and unescapes "" → ".
 *   • Empty cells are kept (they contribute to column count).
 *   • The "sheet" name is always "Sheet1" for CSV (single-sheet format).
 *   • Text output is "ColRow: value" format, consistent with XlsxParser.
 *   • Returns an XlsxOffsetMap so callers use the same toSource() API.
 *
 * Privacy: pure transform, no I/O.
 * Test: tests/unit/parsers/text.spec.ts
 */
import { XlsxOffsetMap } from "./offset-map";

export interface CsvParseResult {
  /** All non-empty cell values formatted as "ColRow: value", one per line. */
  text: string;
  /** Maps text offset → { kind: "xlsx", sheet: "Sheet1", row, column }. */
  offsetMap: XlsxOffsetMap;
  /** Number of data rows (excluding header if any — caller decides). */
  rowCount: number;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

/** 0-based column index → Excel-style label: 0→A, 25→Z, 26→AA. */
function colLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** Detect field delimiter: tab if present, otherwise comma. */
function detectDelimiter(line: string): string {
  return line.includes("\t") ? "\t" : ",";
}

/**
 * Split a single CSV row respecting RFC 4180 quoting.
 * - Fields may be enclosed in double quotes.
 * - A literal `"` inside a quoted field is escaped as `""`.
 */
function splitRow(row: string, delimiter: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= row.length) {
    if (i === row.length) {
      // Trailing empty field
      fields.push("");
      break;
    }
    if (row[i] === '"') {
      // Quoted field
      let field = "";
      i++; // skip opening quote
      while (i < row.length) {
        if (row[i] === '"') {
          if (row[i + 1] === '"') {
            field += '"'; // unescape ""
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += row[i++];
        }
      }
      fields.push(field);
      // Skip delimiter after field
      if (row[i] === delimiter) i++;
    } else {
      // Unquoted field
      const end = row.indexOf(delimiter, i);
      if (end < 0) {
        fields.push(row.slice(i));
        break;
      }
      fields.push(row.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

/* ── Main parser ─────────────────────────────────────────────────── */

const SHEET_NAME = "Sheet1";

/**
 * Parse a CSV or TSV string into a text summary and an offset map.
 *
 * @param content  Raw CSV/TSV string.
 * @returns        `{ text, offsetMap, rowCount }`.
 */
export function parseCsv(content: string): CsvParseResult {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized.split("\n");

  // Remove a single trailing empty line (artefact of files ending with \n)
  if (rawLines[rawLines.length - 1] === "") rawLines.pop();

  if (rawLines.length === 0) {
    return {
      text: "",
      offsetMap: new XlsxOffsetMap([]),
      rowCount: 0,
    };
  }

  const firstLine = rawLines[0] ?? "";
  const delimiter = detectDelimiter(firstLine);

  // Build cell list for the offset map
  const cellEntries: Array<{
    sheet: string;
    row: number;
    column: string;
    value: string;
  }> = [];
  const textLines: string[] = [];

  for (let rowIdx = 0; rowIdx < rawLines.length; rowIdx++) {
    const rawLine = rawLines[rowIdx] ?? "";
    const fields = splitRow(rawLine, delimiter);
    const rowNum = rowIdx + 1; // 1-based
    const rowCells: string[] = [];

    for (let colIdx = 0; colIdx < fields.length; colIdx++) {
      const value = fields[colIdx] ?? "";
      const column = colLabel(colIdx);
      // Only include non-empty cells in the offset map (mirrors XLSX parser)
      if (value.trim()) {
        cellEntries.push({ sheet: SHEET_NAME, row: rowNum, column, value });
        rowCells.push(`${column}${rowNum}: ${value}`);
      }
    }

    if (rowCells.length > 0) {
      textLines.push(rowCells.join("  |  "));
    }
  }

  const text = `[Sheet: ${SHEET_NAME}]\n${textLines.join("\n")}`;
  const offsetMap = new XlsxOffsetMap(cellEntries);

  return { text, offsetMap, rowCount: rawLines.length };
}
