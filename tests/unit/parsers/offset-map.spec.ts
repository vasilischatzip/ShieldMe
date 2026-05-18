/**
 * T048 — OffsetMap tests.
 *
 * Write-first (TDD): tests for src/parsers/offset-map.ts
 *
 * An OffsetMap maps normalized-text character offsets back to source locations
 * (page, paragraph, cell, line) so findings can show precise provenance.
 *
 * Contract: contracts/detection-engine.md — OffsetMap, SourceLocation
 */
import { describe, it, expect } from "vitest";
import {
  PdfOffsetMap,
  DocxOffsetMap,
  XlsxOffsetMap,
  TextOffsetMap,
} from "~/parsers/offset-map";

/* ════════════════════════════════════════════════════════════════
   PdfOffsetMap
   ════════════════════════════════════════════════════════════════ */

describe("PdfOffsetMap", () => {
  it("page 1 at offset 0", () => {
    const map = new PdfOffsetMap([
      { page: 1, text: "Hello world" },   // 0..10 → page 1
      { page: 2, text: "Second page" },   // 11..21 → page 2
    ]);

    const loc = map.toSource(0);
    expect(loc.kind).toBe("pdf");
    if (loc.kind === "pdf") {
      expect(loc.page).toBe(1);
      expect(loc.charOnPage).toBe(0);
    }
  });

  it("char on second page", () => {
    const map = new PdfOffsetMap([
      { page: 1, text: "Hello world" },  // 0..10
      { page: 2, text: "Second page" },  // 11..21
    ]);

    const loc = map.toSource(11); // first char on page 2
    expect(loc.kind).toBe("pdf");
    if (loc.kind === "pdf") {
      expect(loc.page).toBe(2);
      expect(loc.charOnPage).toBe(0);
    }
  });

  it("charOnPage counts within-page", () => {
    const map = new PdfOffsetMap([
      { page: 1, text: "AAAA" },  // 0..3
      { page: 2, text: "BBBBBB" },// 4..9
    ]);

    const loc = map.toSource(7); // offset 7 = page 2, char 3 (0-indexed)
    expect(loc.kind).toBe("pdf");
    if (loc.kind === "pdf") {
      expect(loc.page).toBe(2);
      expect(loc.charOnPage).toBe(3);
    }
  });

  it("offset beyond total length clamps to last page", () => {
    const map = new PdfOffsetMap([{ page: 1, text: "Hi" }]);
    const loc = map.toSource(999);
    expect(loc.kind).toBe("pdf");
    if (loc.kind === "pdf") expect(loc.page).toBe(1);
  });

  it("single-page PDF — offset within page", () => {
    const map = new PdfOffsetMap([{ page: 1, text: "One-page content here" }]);
    const loc = map.toSource(10);
    expect(loc.kind).toBe("pdf");
    if (loc.kind === "pdf") {
      expect(loc.page).toBe(1);
      expect(loc.charOnPage).toBe(10);
    }
  });

  it("three pages", () => {
    const map = new PdfOffsetMap([
      { page: 1, text: "AB" },   // 0..1
      { page: 2, text: "CD" },   // 2..3
      { page: 3, text: "EF" },   // 4..5
    ]);

    expect(map.toSource(4)).toMatchObject({ kind: "pdf", page: 3, charOnPage: 0 });
    expect(map.toSource(5)).toMatchObject({ kind: "pdf", page: 3, charOnPage: 1 });
  });
});

/* ════════════════════════════════════════════════════════════════
   DocxOffsetMap
   ════════════════════════════════════════════════════════════════ */

describe("DocxOffsetMap", () => {
  it("paragraph 0 at offset 0", () => {
    const map = new DocxOffsetMap([
      "First paragraph",   // 0..14
      "Second paragraph",  // 15..30
    ]);

    const loc = map.toSource(0);
    expect(loc.kind).toBe("docx");
    if (loc.kind === "docx") {
      expect(loc.paragraph).toBe(0);
      expect(loc.charInParagraph).toBe(0);
    }
  });

  it("offset into second paragraph", () => {
    const map = new DocxOffsetMap([
      "Hello",  // 0..4 (len 5)
      "World",  // 5..9 (len 5)
    ]);

    const loc = map.toSource(7); // 7 - 5 = 2 chars into paragraph 1
    expect(loc.kind).toBe("docx");
    if (loc.kind === "docx") {
      expect(loc.paragraph).toBe(1);
      expect(loc.charInParagraph).toBe(2);
    }
  });

  it("charInParagraph is zero-based within the paragraph", () => {
    const map = new DocxOffsetMap(["AAAA", "BBBBB"]);
    const loc = map.toSource(4); // first char of second paragraph
    expect(loc.kind).toBe("docx");
    if (loc.kind === "docx") {
      expect(loc.paragraph).toBe(1);
      expect(loc.charInParagraph).toBe(0);
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   XlsxOffsetMap
   ════════════════════════════════════════════════════════════════ */

describe("XlsxOffsetMap", () => {
  it("first cell at offset 0", () => {
    const map = new XlsxOffsetMap([
      { sheet: "Sheet1", row: 1, column: "A", value: "Name" },     // 0..3
      { sheet: "Sheet1", row: 1, column: "B", value: "Phone" },    // 4..8
    ]);

    const loc = map.toSource(0);
    expect(loc.kind).toBe("xlsx");
    if (loc.kind === "xlsx") {
      expect(loc.sheet).toBe("Sheet1");
      expect(loc.row).toBe(1);
      expect(loc.column).toBe("A");
    }
  });

  it("second cell", () => {
    const map = new XlsxOffsetMap([
      { sheet: "Sheet1", row: 1, column: "A", value: "AAAA" }, // 0..3 (len 4)
      { sheet: "Sheet1", row: 1, column: "B", value: "BBBB" }, // 4..7 (len 4)
    ]);

    const loc = map.toSource(5);
    expect(loc.kind).toBe("xlsx");
    if (loc.kind === "xlsx") {
      expect(loc.column).toBe("B");
      expect(loc.row).toBe(1);
    }
  });

  it("different sheet", () => {
    const map = new XlsxOffsetMap([
      { sheet: "Sheet1", row: 1, column: "A", value: "AB" }, // 0..1
      { sheet: "Sheet2", row: 1, column: "A", value: "CD" }, // 2..3
    ]);

    const loc = map.toSource(3);
    expect(loc.kind).toBe("xlsx");
    if (loc.kind === "xlsx") expect(loc.sheet).toBe("Sheet2");
  });
});

/* ════════════════════════════════════════════════════════════════
   TextOffsetMap
   ════════════════════════════════════════════════════════════════ */

describe("TextOffsetMap", () => {
  it("offset 0 → line 0, col 0", () => {
    const map = new TextOffsetMap("hello\nworld");
    const loc = map.toSource(0);
    expect(loc.kind).toBe("text");
    if (loc.kind === "text") {
      expect(loc.line).toBe(0);
      expect(loc.col).toBe(0);
    }
  });

  it("offset within first line", () => {
    const map = new TextOffsetMap("hello\nworld");
    const loc = map.toSource(3);
    expect(loc.kind).toBe("text");
    if (loc.kind === "text") {
      expect(loc.line).toBe(0);
      expect(loc.col).toBe(3);
    }
  });

  it("offset at start of second line (after newline)", () => {
    const text = "hello\nworld";
    const map = new TextOffsetMap(text);
    // "hello\n" = 6 chars → offset 6 = start of "world"
    const loc = map.toSource(6);
    expect(loc.kind).toBe("text");
    if (loc.kind === "text") {
      expect(loc.line).toBe(1);
      expect(loc.col).toBe(0);
    }
  });

  it("offset within second line", () => {
    const text = "abc\ndefghi";
    const map = new TextOffsetMap(text);
    // "abc\n" = 4 chars, so offset 7 = 'g' = line 1, col 3
    const loc = map.toSource(7);
    expect(loc.kind).toBe("text");
    if (loc.kind === "text") {
      expect(loc.line).toBe(1);
      expect(loc.col).toBe(3);
    }
  });

  it("three-line text", () => {
    const text = "a\nbb\nccc";
    const map = new TextOffsetMap(text);
    // "a\n" = 2, "bb\n" = 3 → offset 5 = start of "ccc" (line 2, col 0)
    const loc = map.toSource(5);
    expect(loc.kind).toBe("text");
    if (loc.kind === "text") {
      expect(loc.line).toBe(2);
      expect(loc.col).toBe(0);
    }
  });

  it("empty string → line 0, col 0", () => {
    const map = new TextOffsetMap("");
    const loc = map.toSource(0);
    expect(loc).toMatchObject({ kind: "text", line: 0, col: 0 });
  });
});
