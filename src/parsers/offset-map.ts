/**
 * T049 — OffsetMap implementations.
 *
 * Maps normalized-text character offsets back to source locations
 * (page, paragraph, cell, line) so findings can show precise provenance.
 *
 * Contract: contracts/detection-engine.md — OffsetMap, SourceLocation
 *
 * Test: tests/unit/parsers/offset-map.spec.ts
 */
import type { OffsetMap, SourceLocation } from "~/detectors/types";

/* ── PdfOffsetMap ───────────────────────────────────────────────── */

interface PdfPage {
  page: number;
  text: string;
}

/**
 * Maps normalized-text offsets to PDF page + within-page character position.
 *
 * The normalized text is assumed to be the concatenation of page texts in
 * order, with no separator characters inserted between pages (raw join).
 */
export class PdfOffsetMap implements OffsetMap {
  /**
   * Pre-built segment table: `[startOffset, endOffset, pageNumber]`.
   * Inclusive start, inclusive end.
   */
  private readonly _segments: Array<{ start: number; end: number; page: number }>;

  constructor(pages: PdfPage[]) {
    this._segments = [];
    let cursor = 0;
    for (const { page, text } of pages) {
      const len = text.length;
      this._segments.push({
        start: cursor,
        end: cursor + Math.max(len - 1, 0),
        page,
      });
      cursor += len;
    }
  }

  toSource(normalizedOffset: number): SourceLocation & { kind: "pdf" } {
    // Find the segment that contains this offset.
    // If offset is beyond all segments, clamp to the last one.
    let best = this._segments[this._segments.length - 1] ?? { start: 0, end: 0, page: 1 };
    for (const seg of this._segments) {
      if (normalizedOffset <= seg.end) {
        best = seg;
        break;
      }
    }
    return {
      kind: "pdf",
      page: best.page,
      charOnPage: Math.max(0, normalizedOffset - best.start),
    };
  }
}

/* ── DocxOffsetMap ──────────────────────────────────────────────── */

/**
 * Maps normalized-text offsets to DOCX paragraph index + within-paragraph
 * character position.
 *
 * Paragraphs are concatenated without any separator in the normalized text.
 */
export class DocxOffsetMap implements OffsetMap {
  private readonly _segments: Array<{ start: number; end: number; paragraph: number }>;

  constructor(paragraphs: string[]) {
    this._segments = [];
    let cursor = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      const len = (paragraphs[i] ?? "").length;
      this._segments.push({
        start: cursor,
        end: cursor + Math.max(len - 1, 0),
        paragraph: i,
      });
      cursor += len;
    }
  }

  toSource(normalizedOffset: number): SourceLocation & { kind: "docx" } {
    let best = this._segments[this._segments.length - 1] ?? { start: 0, end: 0, paragraph: 0 };
    for (const seg of this._segments) {
      if (normalizedOffset <= seg.end) {
        best = seg;
        break;
      }
    }
    return {
      kind: "docx",
      paragraph: best.paragraph,
      charInParagraph: Math.max(0, normalizedOffset - best.start),
    };
  }
}

/* ── XlsxOffsetMap ──────────────────────────────────────────────── */

interface XlsxCell {
  sheet: string;
  row: number;
  column: string;
  value: string;
}

/**
 * Maps normalized-text offsets to XLSX sheet + row + column.
 *
 * Cell values are concatenated without separator in the normalized text.
 */
export class XlsxOffsetMap implements OffsetMap {
  private readonly _segments: Array<{
    start: number;
    end: number;
    sheet: string;
    row: number;
    column: string;
  }>;

  constructor(cells: XlsxCell[]) {
    this._segments = [];
    let cursor = 0;
    for (const { sheet, row, column, value } of cells) {
      const len = value.length;
      this._segments.push({
        start: cursor,
        end: cursor + Math.max(len - 1, 0),
        sheet,
        row,
        column,
      });
      cursor += len;
    }
  }

  toSource(normalizedOffset: number): SourceLocation & { kind: "xlsx" } {
    let best = this._segments[this._segments.length - 1] ?? { start: 0, end: 0, sheet: "", row: 0, column: "A" };
    for (const seg of this._segments) {
      if (normalizedOffset <= seg.end) {
        best = seg;
        break;
      }
    }
    return {
      kind: "xlsx",
      sheet: best.sheet,
      row: best.row,
      column: best.column,
    };
  }
}

/* ── TextOffsetMap ──────────────────────────────────────────────── */

/**
 * Maps normalized-text offsets to line + column in a plain-text string.
 *
 * Lines are split on `\n`. Column is 0-based within the line.
 * Line is 0-based.
 */
export class TextOffsetMap implements OffsetMap {
  /** Start offset of each line in the full text. */
  private readonly _lineStarts: number[];

  constructor(text: string) {
    this._lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") {
        this._lineStarts.push(i + 1);
      }
    }
  }

  toSource(normalizedOffset: number): SourceLocation & { kind: "text" } {
    // Binary search for the last line whose start ≤ normalizedOffset.
    const starts = this._lineStarts;
    let lo = 0;
    let hi = starts.length - 1;

    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] ?? 0) <= normalizedOffset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }

    return {
      kind: "text",
      line: lo,
      col: normalizedOffset - (starts[lo] ?? 0),
    };
  }
}
