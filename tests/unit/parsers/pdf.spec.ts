/**
 * T050 — PDF parser unit tests.
 *
 * Write-first (TDD): tests for src/parsers/pdf.ts
 *
 * Contract (actual API):
 *   parsePdf(buffer: ArrayBuffer, maxPages?: number): Promise<PdfParseResult>
 *   PdfParseResult =
 *     | { ok: true;  text: string;  pageCount: number; warnings?: string[] }
 *     | { ok: false; reason: string }
 *
 * pdfjs-dist requires browser globals (DOMMatrix, etc.) not available in jsdom.
 * We mock the library so tests verify the parsePdf wrapper logic directly.
 *
 * Spec refs: FR-D1, FR-D2, NFR-P2
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Mock pdfjs-dist BEFORE importing the module under test ─────── */

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));

import { parsePdf, type PdfParseResult } from "~/parsers/pdf";
import * as pdfjsMod from "pdfjs-dist";

const mockGetDocument = pdfjsMod.getDocument as ReturnType<typeof vi.fn>;

/* ── Helpers ─────────────────────────────────────────────────────── */

type TextItem = { str: string; transform?: number[]; hasEOL?: boolean };

/** Build a fake pdfjs document from an array-of-pages, each page being lines of text. */
function makeMockPdfDoc(pageLines: string[][]) {
  const numPages = pageLines.length;
  const getPage = vi.fn(async (pageNum: number) => {
    const lines = pageLines[pageNum - 1] ?? [];
    // Simulate different Y positions for each line (decreasing Y = new row)
    const items: TextItem[] = lines.map((str, i) => ({
      str,
      transform: [1, 0, 0, 1, 50, 700 - i * 20], // Y decreases per line
    }));
    return { getTextContent: async () => ({ items }) };
  });
  return { numPages, getPage };
}

/** Set up mockGetDocument to resolve with a given fake document. */
function setupDoc(pageLines: string[][]) {
  const doc = makeMockPdfDoc(pageLines);
  mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
  return doc;
}

/** Set up mockGetDocument to reject with an error. */
function setupDocError(msg: string) {
  mockGetDocument.mockReturnValue({ promise: Promise.reject(new Error(msg)) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════════
   1. Return shape
   ════════════════════════════════════════════════════════════════ */

describe("parsePdf — return shape", () => {
  it("returns { ok: true } with text and pageCount on success", async () => {
    setupDoc([["Hello world"]]);
    const r: PdfParseResult = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(typeof r.text).toBe("string");
      expect(typeof r.pageCount).toBe("number");
    }
  });

  it("returns { ok: false } with reason string on error", async () => {
    setupDocError("Unexpected token");
    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe("string");
  });
});

/* ════════════════════════════════════════════════════════════════
   2. Text extraction
   ════════════════════════════════════════════════════════════════ */

describe("parsePdf — text extraction", () => {
  it("extracts text from a single-page document", async () => {
    setupDoc([["Hello world"]]);
    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("Hello world");
  });

  it("extracts text from all pages", async () => {
    setupDoc([["First page"], ["Second page"]]);
    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("First page");
      expect(r.text).toContain("Second page");
    }
  });

  it("labels each page in the output text", async () => {
    setupDoc([["Content A"], ["Content B"]]);
    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("[Page 1]");
      expect(r.text).toContain("[Page 2]");
    }
  });

  it("handles multiple text items on the same line", async () => {
    // Same Y = same line, concatenated
    const doc = makeMockPdfDoc([[]]);
    (doc.getPage as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      getTextContent: async () => ({
        items: [
          { str: "Hello ", transform: [1, 0, 0, 1, 50, 700] },
          { str: "World",  transform: [1, 0, 0, 1, 90, 700] },
        ],
      }),
    }));
    mockGetDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: doc.getPage }) });

    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("Hello World");
  });

  it("skips empty text items", async () => {
    const doc = makeMockPdfDoc([[]]);
    (doc.getPage as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      getTextContent: async () => ({
        items: [
          { str: "",       transform: [1, 0, 0, 1, 50, 700] },
          { str: "Visible", transform: [1, 0, 0, 1, 50, 680] },
        ],
      }),
    }));
    mockGetDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: doc.getPage }) });

    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("Visible");
      expect(r.text).not.toContain("undefined");
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   3. pageCount
   ════════════════════════════════════════════════════════════════ */

describe("parsePdf — pageCount", () => {
  it("single-page PDF reports pageCount === 1", async () => {
    setupDoc([["Content"]]);
    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pageCount).toBe(1);
  });

  it("two-page PDF reports pageCount === 2", async () => {
    setupDoc([["Page 1"], ["Page 2"]]);
    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pageCount).toBe(2);
  });

  it("three-page PDF reports pageCount === 3", async () => {
    setupDoc([["A"], ["B"], ["C"]]);
    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pageCount).toBe(3);
  });
});

/* ════════════════════════════════════════════════════════════════
   4. maxPages truncation
   ════════════════════════════════════════════════════════════════ */

describe("parsePdf — maxPages truncation", () => {
  it("does not truncate when pages ≤ maxPages", async () => {
    setupDoc([["Page 1"], ["Page 2"]]);
    const r = await parsePdf(new ArrayBuffer(8), 10);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toBeUndefined();
  });

  it("adds a warning when pages exceed maxPages", async () => {
    // 3-page doc but maxPages = 2
    const doc = makeMockPdfDoc([["A"], ["B"], ["C"]]);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    const r = await parsePdf(new ArrayBuffer(8), 2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toBeDefined();
      expect(r.warnings!.length).toBeGreaterThan(0);
      expect(r.warnings![0]).toContain("3 pages");
    }
  });

  it("only extracts up to maxPages when exceeded", async () => {
    const doc = makeMockPdfDoc([["Alpha"], ["Beta"], ["Gamma"]]);
    mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
    const r = await parsePdf(new ArrayBuffer(8), 2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("Alpha");
      expect(r.text).toContain("Beta");
      expect(r.text).not.toContain("Gamma");
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   5. Error handling
   ════════════════════════════════════════════════════════════════ */

describe("parsePdf — error handling", () => {
  it("returns { ok: false } on generic parse error", async () => {
    setupDocError("Unexpected token in stream");
    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("PDF parse error");
  });

  it("returns { ok: false } with password message for encrypted PDFs", async () => {
    setupDocError("Password required or incorrect password.");
    const r = await parsePdf(new ArrayBuffer(8));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Implementation detects password/encrypted in error message
      expect(r.reason).toMatch(/password|encrypted/i);
    }
  });

  it("does not throw — always returns a PdfParseResult", async () => {
    setupDocError("Catastrophic failure");
    await expect(parsePdf(new ArrayBuffer(8))).resolves.toMatchObject({ ok: false });
  });

  it("passes buffer bytes to pdfjs getDocument", async () => {
    setupDoc([["text"]]);
    const buf = new ArrayBuffer(16);
    await parsePdf(buf);
    expect(mockGetDocument).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.any(Uint8Array) }),
    );
  });
});
