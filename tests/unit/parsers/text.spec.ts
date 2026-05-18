/**
 * T056 — TXT / CSV / RTF parser unit tests.
 *
 * Tests for:
 *   src/parsers/text.ts  — parseTxt()
 *   src/parsers/csv.ts   — parseCsv()
 *   src/parsers/rtf.ts   — stripRtf()
 *
 * All parsers are pure functions; no mocking required.
 *
 * Spec refs: FR-D1, FR-D2
 */
import { describe, it, expect } from "vitest";
import { parseTxt } from "~/parsers/text";
import { parseCsv } from "~/parsers/csv";
import { stripRtf } from "~/parsers/rtf";

/* ════════════════════════════════════════════════════════════════
   parseTxt
   ════════════════════════════════════════════════════════════════ */

describe("parseTxt", () => {
  it("returns the same string for simple ASCII content", () => {
    const { text } = parseTxt("hello world");
    expect(text).toBe("hello world");
  });

  it("normalises Windows CRLF to LF", () => {
    const { text } = parseTxt("line1\r\nline2\r\nline3");
    expect(text).toBe("line1\nline2\nline3");
  });

  it("normalises lone CR to LF", () => {
    const { text } = parseTxt("a\rb");
    expect(text).toBe("a\nb");
  });

  it("handles empty string", () => {
    const { text } = parseTxt("");
    expect(text).toBe("");
  });

  it("returns an offsetMap with kind 'text' at offset 0", () => {
    const { offsetMap } = parseTxt("hello\nworld");
    const loc = offsetMap.toSource(0);
    expect(loc.kind).toBe("text");
  });

  it("offsetMap resolves offset within first line", () => {
    const { offsetMap } = parseTxt("hello\nworld");
    const loc = offsetMap.toSource(3);
    if (loc.kind === "text") {
      expect(loc.line).toBe(0);
      expect(loc.col).toBe(3);
    }
  });

  it("offsetMap resolves offset at start of second line", () => {
    const { text, offsetMap } = parseTxt("hello\nworld");
    // After normalisation "hello\nworld" — 'w' is at offset 6
    const idx = text.indexOf("w");
    const loc = offsetMap.toSource(idx);
    if (loc.kind === "text") {
      expect(loc.line).toBe(1);
      expect(loc.col).toBe(0);
    }
  });

  it("offsetMap resolves offset within third line of three-line text", () => {
    const { offsetMap } = parseTxt("a\nbb\nccc");
    // "a\n" = 2, "bb\n" = 3 → offset 5 = 'c' on line 2
    const loc = offsetMap.toSource(5);
    if (loc.kind === "text") {
      expect(loc.line).toBe(2);
      expect(loc.col).toBe(0);
    }
  });

  it("preserves Unicode characters", () => {
    const { text } = parseTxt("Ελληνικά");
    expect(text).toBe("Ελληνικά");
  });
});

/* ════════════════════════════════════════════════════════════════
   parseCsv
   ════════════════════════════════════════════════════════════════ */

describe("parseCsv", () => {
  /* ── Basic parsing ─────────────────────────────────────────────── */

  it("produces sheet label in text output", () => {
    const { text } = parseCsv("a,b\n1,2");
    expect(text).toContain("[Sheet: Sheet1]");
  });

  it("formats cells as ColRow: value", () => {
    const { text } = parseCsv("Alice,Bob\nCarol,Dave");
    expect(text).toContain("A1: Alice");
    expect(text).toContain("B1: Bob");
    expect(text).toContain("A2: Carol");
  });

  it("reports correct rowCount", () => {
    const { rowCount } = parseCsv("a,b\nc,d\ne,f");
    expect(rowCount).toBe(3);
  });

  it("handles TSV (tab-delimited) auto-detection", () => {
    const { text } = parseCsv("Name\tEmail\nAlice\talice@example.com");
    expect(text).toContain("A1: Name");
    expect(text).toContain("B1: Email");
    expect(text).toContain("A2: Alice");
  });

  it("skips empty cells", () => {
    const { text } = parseCsv("a,,c");
    expect(text).toContain("A1: a");
    expect(text).toContain("C1: c");
    expect(text).not.toMatch(/B1:/);
  });

  it("handles quoted fields with commas inside", () => {
    const { text } = parseCsv('"Smith, John",30');
    expect(text).toContain("A1: Smith, John");
    expect(text).toContain("B1: 30");
  });

  it("handles escaped double-quotes inside quoted fields", () => {
    const { text } = parseCsv('"say ""hello""",world');
    expect(text).toContain(`A1: say "hello"`);
  });

  it("handles Windows CRLF line endings", () => {
    const { text, rowCount } = parseCsv("a,b\r\nc,d\r\n");
    expect(rowCount).toBe(2);
    expect(text).toContain("A1: a");
    expect(text).toContain("A2: c");
  });

  it("handles empty string", () => {
    const { text, rowCount } = parseCsv("");
    expect(rowCount).toBe(0);
    expect(text).toBe("");
  });

  it("uses Excel column labels beyond Z for column 26 (AA)", () => {
    const headers = Array.from({ length: 27 }, (_, i) => `h${i}`).join(",");
    const { text } = parseCsv(headers);
    expect(text).toContain("AA1: h26");
  });

  /* ── OffsetMap ─────────────────────────────────────────────────── */

  it("offsetMap.toSource returns kind 'xlsx'", () => {
    const { offsetMap } = parseCsv("Name,Email\nAlice,alice@x.com");
    const loc = offsetMap.toSource(0);
    expect(loc.kind).toBe("xlsx");
  });

  it("offsetMap resolves first cell to sheet Sheet1, row 1, column A", () => {
    const { offsetMap, text } = parseCsv("Alice,Bob");
    // "Alice" is the value at A1; its offset in text starts after the sheet label line
    const idx = text.indexOf("Alice");
    if (idx >= 0) {
      const loc = offsetMap.toSource(0); // first cell in the map
      if (loc.kind === "xlsx") {
        expect(loc.sheet).toBe("Sheet1");
        expect(loc.row).toBe(1);
        expect(loc.column).toBe("A");
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   stripRtf
   ════════════════════════════════════════════════════════════════ */

describe("stripRtf", () => {
  it("returns plain text for a simple RTF document", () => {
    const rtf = "{\\rtf1 Hello World}";
    expect(stripRtf(rtf)).toContain("Hello");
    expect(stripRtf(rtf)).toContain("World");
  });

  it("removes \\controlword sequences", () => {
    const rtf = "{\\rtf1\\ansi Hello \\b World\\b0}";
    const result = stripRtf(rtf);
    expect(result).not.toContain("\\b");
    expect(result).not.toContain("\\ansi");
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("removes RTF group braces { and }", () => {
    const rtf = "{\\rtf1 {\\fonttbl} content}";
    const result = stripRtf(rtf);
    expect(result).not.toContain("{");
    expect(result).not.toContain("}");
  });

  it("removes \\par paragraph markers", () => {
    const rtf = "{\\rtf1 Line1\\par Line2}";
    const result = stripRtf(rtf);
    expect(result).not.toContain("\\par");
    expect(result).toContain("Line1");
    expect(result).toContain("Line2");
  });

  it("removes \\'XX hex character escapes", () => {
    const rtf = "Hello\\'e9World"; // \'e9 = é in Latin-1
    const result = stripRtf(rtf);
    expect(result).not.toMatch(/\\'[0-9a-fA-F]{2}/);
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("does not leave multiple consecutive spaces", () => {
    const rtf = "Hello   \\b   World";
    const result = stripRtf(rtf);
    // After collapsing whitespace there should be at most one space between words
    expect(result).not.toMatch(/  /); // no double spaces
  });

  it("handles an empty string", () => {
    expect(stripRtf("")).toBe("");
  });

  it("passes through plain text that has no RTF syntax", () => {
    const plain = "Just a regular sentence.";
    expect(stripRtf(plain)).toBe(plain);
  });

  it("returns trimmed result", () => {
    const rtf = "  \\par  Hello  \\par  ";
    const result = stripRtf(rtf);
    // Should not have leading or trailing whitespace
    expect(result).toBe(result.trim());
  });
});
