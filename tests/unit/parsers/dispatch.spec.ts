/**
 * T024 / T024b / T025 — Parser dispatch unit tests.
 *
 * Binary parsers (pdf, docx, xlsx, ocr) are vi.mock()ed so this suite runs
 * without loading pdfjs-dist, mammoth, SheetJS, or Tesseract.js.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseFile, isPlainTextLike, DEFAULT_MAX_BYTES } from "~/parsers/dispatch";

/* ── Mock binary sub-parsers ─────────────────────────────────────── */

vi.mock("~/parsers/pdf", () => ({
  parsePdf: vi.fn(),
}));

vi.mock("~/parsers/docx", () => ({
  parseDocx:      vi.fn(),
  parseLegacyDoc: vi.fn(),
}));

vi.mock("~/parsers/xlsx", () => ({
  parseXlsx: vi.fn(),
}));

vi.mock("~/parsers/ocr", () => ({
  parseOcr: vi.fn(),
}));

import * as pdfMod  from "~/parsers/pdf";
import * as docxMod from "~/parsers/docx";
import * as xlsxMod from "~/parsers/xlsx";
import * as ocrMod  from "~/parsers/ocr";

const mockParsePdf      = pdfMod.parsePdf      as ReturnType<typeof vi.fn>;
const mockParseDocx     = docxMod.parseDocx    as ReturnType<typeof vi.fn>;
const mockParseLegacy   = docxMod.parseLegacyDoc as ReturnType<typeof vi.fn>;
const mockParseXlsx     = xlsxMod.parseXlsx    as ReturnType<typeof vi.fn>;
const mockParseOcr      = ocrMod.parseOcr      as ReturnType<typeof vi.fn>;

/* ── Helpers ─────────────────────────────────────────────────────── */

function fileFrom(name: string, body: string, type = ""): File {
  return new File([body], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ── isPlainTextLike ─────────────────────────────────────────────── */

describe("isPlainTextLike", () => {
  it("recognises common text extensions", () => {
    expect(isPlainTextLike("foo.txt",    "")).toBe(true);
    expect(isPlainTextLike("foo.csv",    "")).toBe(true);
    expect(isPlainTextLike("notes.md",   "")).toBe(true);
    expect(isPlainTextLike("config.json","")).toBe(true);
    expect(isPlainTextLike("server.log", "")).toBe(true);
  });

  it("recognises text MIME types", () => {
    expect(isPlainTextLike("blob", "text/plain")).toBe(true);
    expect(isPlainTextLike("blob", "text/csv")).toBe(true);
    expect(isPlainTextLike("blob", "application/json")).toBe(true);
  });

  it("rejects binary formats", () => {
    expect(isPlainTextLike("photo.png",  "image/png")).toBe(false);
    expect(isPlainTextLike("doc.pdf",    "application/pdf")).toBe(false);
    expect(isPlainTextLike("doc.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )).toBe(false);
  });
});

/* ── Plain-text dispatch ─────────────────────────────────────────── */

describe("parseFile — plain text", () => {
  it("reads a plain-text file", async () => {
    const r = await parseFile(fileFrom("hello.txt", "hello world"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("hello world");
  });

  it("reads a CSV", async () => {
    const r = await parseFile(fileFrom("data.csv", "a,b,c\n1,2,3"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("a,b,c");
  });

  it("rejects oversize files before parsing", async () => {
    const big = "x".repeat(DEFAULT_MAX_BYTES + 1024);
    const r   = await parseFile(fileFrom("big.txt", big));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe("too-large");
  });

  it("honours custom maxBytes option", async () => {
    const r = await parseFile(fileFrom("a.txt", "hello"), { maxBytes: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.kind).toBe("too-large");
      if (r.reason.kind === "too-large") {
        expect(r.reason.limitBytes).toBe(3);
      }
    }
  });

  it("strips RTF control words best-effort", async () => {
    const rtf = "{\\rtf1 Hello \\fs24 World}";
    const r   = await parseFile(fileFrom("note.rtf", rtf));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("Hello");
      expect(r.text).toContain("World");
      expect(r.text).not.toContain("\\rtf");
      expect(r.text).not.toContain("\\fs24");
    }
  });

  it("returns unsupported-format for unknown extensions", async () => {
    const r = await parseFile(fileFrom("archive.zip", "PK fake", "application/zip"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe("unsupported-format");
  });
});

/* ── PDF dispatch ────────────────────────────────────────────────── */

describe("parseFile — PDF", () => {
  it("routes .pdf by extension and returns parsed text", async () => {
    mockParsePdf.mockResolvedValue({ ok: true, text: "pdf content", pageCount: 2 });
    const r = await parseFile(fileFrom("report.pdf", "%PDF fake", "application/pdf"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("pdf content");
    expect(mockParsePdf).toHaveBeenCalledOnce();
  });

  it("routes by MIME even without .pdf extension", async () => {
    mockParsePdf.mockResolvedValue({ ok: true, text: "pdf text", pageCount: 1 });
    const r = await parseFile(fileFrom("noext", "bytes", "application/pdf"));
    expect(r.ok).toBe(true);
    expect(mockParsePdf).toHaveBeenCalledOnce();
  });

  it("propagates warnings from parsePdf", async () => {
    mockParsePdf.mockResolvedValue({
      ok: true, text: "big pdf", pageCount: 600,
      warnings: ["PDF has 600 pages; only the first 500 were scanned."],
    });
    const r = await parseFile(fileFrom("big.pdf", "", "application/pdf"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(1);
  });

  it("maps parsePdf decode failure to decode-failed", async () => {
    mockParsePdf.mockResolvedValue({ ok: false, reason: "PDF parse error: bad header" });
    const r = await parseFile(fileFrom("bad.pdf", "", "application/pdf"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.kind).toBe("decode-failed");
      if (r.reason.kind === "decode-failed") {
        expect(r.reason.detail).toContain("bad header");
      }
    }
  });

  it("maps password-protected PDF to decode-failed", async () => {
    mockParsePdf.mockResolvedValue({ ok: false, reason: "PDF is password-protected — cannot extract text" });
    const r = await parseFile(fileFrom("locked.pdf", "", "application/pdf"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe("decode-failed");
  });
});

/* ── DOCX dispatch ───────────────────────────────────────────────── */

describe("parseFile — DOCX", () => {
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  it("routes .docx by extension", async () => {
    mockParseDocx.mockResolvedValue({ ok: true, text: "docx content" });
    const r = await parseFile(fileFrom("letter.docx", "PK fake", DOCX_MIME));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("docx content");
    expect(mockParseDocx).toHaveBeenCalledOnce();
  });

  it("routes by DOCX MIME type even without .docx extension", async () => {
    mockParseDocx.mockResolvedValue({ ok: true, text: "text" });
    const r = await parseFile(fileFrom("file", "PK", DOCX_MIME));
    expect(r.ok).toBe(true);
    expect(mockParseDocx).toHaveBeenCalledOnce();
  });

  it("propagates mammoth warnings", async () => {
    mockParseDocx.mockResolvedValue({
      ok: true, text: "text", warnings: ["unrecognised element: w:bookmarkStart"],
    });
    const r = await parseFile(fileFrom("annotated.docx", "", DOCX_MIME));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(1);
  });

  it("maps parseDocx failure to decode-failed", async () => {
    mockParseDocx.mockResolvedValue({ ok: false, reason: "DOCX parse error: corrupt zip" });
    const r = await parseFile(fileFrom("bad.docx", "", DOCX_MIME));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.kind).toBe("decode-failed");
      if (r.reason.kind === "decode-failed") {
        expect(r.reason.detail).toContain("corrupt zip");
      }
    }
  });
});

/* ── Legacy .doc dispatch ────────────────────────────────────────── */

describe("parseFile — legacy .doc", () => {
  it("routes .doc extension and returns decode-failed with guidance", async () => {
    mockParseLegacy.mockReturnValue({
      ok: false,
      reason: "Legacy .doc format is not supported. Please save as .docx and try again.",
    });
    const r = await parseFile(fileFrom("old.doc", "bytes", "application/msword"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.kind).toBe("decode-failed");
      if (r.reason.kind === "decode-failed") {
        expect(r.reason.detail).toContain(".docx");
      }
    }
    expect(mockParseLegacy).toHaveBeenCalledOnce();
  });

  it("routes by application/msword MIME", async () => {
    mockParseLegacy.mockReturnValue({ ok: false, reason: "Legacy .doc format is not supported. Please save as .docx and try again." });
    const r = await parseFile(fileFrom("noext", "", "application/msword"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe("decode-failed");
  });
});

/* ── XLSX dispatch ───────────────────────────────────────────────── */

describe("parseFile — XLSX / XLS / ODS", () => {
  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const XLS_MIME  = "application/vnd.ms-excel";
  const ODS_MIME  = "application/vnd.oasis.opendocument.spreadsheet";

  it("routes .xlsx by extension", async () => {
    mockParseXlsx.mockResolvedValue({ ok: true, text: "[Sheet: Sheet1]\nA1: hello", sheetCount: 1 });
    const r = await parseFile(fileFrom("data.xlsx", "PK fake", XLSX_MIME));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("[Sheet: Sheet1]");
      expect(r.text).toContain("A1: hello");
    }
    expect(mockParseXlsx).toHaveBeenCalledOnce();
  });

  it("routes .xls extension", async () => {
    mockParseXlsx.mockResolvedValue({ ok: true, text: "[Sheet: Sheet1]\nA1: val", sheetCount: 1 });
    const r = await parseFile(fileFrom("old.xls", "data", XLS_MIME));
    expect(r.ok).toBe(true);
    expect(mockParseXlsx).toHaveBeenCalledOnce();
  });

  it("routes .ods extension", async () => {
    mockParseXlsx.mockResolvedValue({ ok: true, text: "[Sheet: Sheet1]\nA1: 42", sheetCount: 1 });
    const r = await parseFile(fileFrom("sheet.ods", "bytes", ODS_MIME));
    expect(r.ok).toBe(true);
    expect(mockParseXlsx).toHaveBeenCalledOnce();
  });

  it("routes by XLSX MIME without matching extension", async () => {
    mockParseXlsx.mockResolvedValue({ ok: true, text: "text", sheetCount: 1 });
    const r = await parseFile(fileFrom("export", "", XLSX_MIME));
    expect(r.ok).toBe(true);
    expect(mockParseXlsx).toHaveBeenCalledOnce();
  });

  it("propagates truncation warnings", async () => {
    mockParseXlsx.mockResolvedValue({
      ok: true, text: "text", sheetCount: 1,
      warnings: [`Sheet "Sheet1": truncated at 10000 rows (50000 total).`],
    });
    const r = await parseFile(fileFrom("huge.xlsx", "", XLSX_MIME));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(1);
  });

  it("maps parseXlsx failure to decode-failed", async () => {
    mockParseXlsx.mockResolvedValue({ ok: false, reason: "Spreadsheet parse error: invalid zip" });
    const r = await parseFile(fileFrom("bad.xlsx", "", XLSX_MIME));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.kind).toBe("decode-failed");
      if (r.reason.kind === "decode-failed") {
        expect(r.reason.detail).toContain("invalid zip");
      }
    }
  });

  it("maps password-protected XLSX to decode-failed", async () => {
    mockParseXlsx.mockResolvedValue({ ok: false, reason: "Spreadsheet is password-protected — cannot extract text" });
    const r = await parseFile(fileFrom("locked.xlsx", "", XLSX_MIME));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe("decode-failed");
  });

  it("returns no warnings key when none present", async () => {
    mockParseXlsx.mockResolvedValue({ ok: true, text: "text", sheetCount: 1 });
    const r = await parseFile(fileFrom("clean.xlsx", "", XLSX_MIME));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toBeUndefined();
  });
});

/* ── Image / OCR dispatch ────────────────────────────────────────── */

describe("parseFile — images (OCR)", () => {
  beforeEach(() => {
    mockParseOcr.mockResolvedValue({ ok: true, text: "ocr text" });
  });

  it.each([
    ["photo.png",  "image/png"],
    ["scan.jpg",   "image/jpeg"],
    ["scan.jpeg",  "image/jpeg"],
    ["img.webp",   "image/webp"],
    ["doc.tiff",   "image/tiff"],
    ["doc.tif",    "image/tiff"],
    ["img.bmp",    "image/bmp"],
    ["img.avif",   "image/avif"],
  ])("routes %s by extension/MIME → parseOcr", async (name, mime) => {
    const r = await parseFile(fileFrom(name, "bytes", mime));
    expect(r.ok).toBe(true);
    expect(mockParseOcr).toHaveBeenCalledOnce();
  });

  it("routes by image/* MIME type without matching extension", async () => {
    const r = await parseFile(fileFrom("blob", "bytes", "image/gif"));
    expect(r.ok).toBe(true);
    expect(mockParseOcr).toHaveBeenCalledOnce();
  });

  it("passes maxBytes to parseOcr", async () => {
    await parseFile(fileFrom("photo.png", "x", "image/png"), { maxBytes: 999_999 });
    expect(mockParseOcr).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ maxBytes: 999_999 }),
    );
  });

  it("propagates OCR warnings", async () => {
    mockParseOcr.mockResolvedValue({ ok: true, text: "text", warnings: ["large image downscaled"] });
    const r = await parseFile(fileFrom("big.png", "", "image/png"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(1);
  });

  it("maps parseOcr failure to decode-failed", async () => {
    mockParseOcr.mockResolvedValue({ ok: false, reason: "OCR timed out" });
    const r = await parseFile(fileFrom("slow.png", "", "image/png"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.kind).toBe("decode-failed");
      if (r.reason.kind === "decode-failed") {
        expect(r.reason.detail).toContain("OCR timed out");
      }
    }
  });
});
