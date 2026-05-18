/**
 * T052 — DOCX parser unit tests.
 *
 * Write-first (TDD): tests for src/parsers/docx.ts
 *
 * Contract (actual API):
 *   parseDocx(buffer: ArrayBuffer): Promise<DocxParseResult>
 *   DocxParseResult =
 *     | { ok: true;  text: string;  warnings?: string[] }
 *     | { ok: false; reason: string }
 *
 *   parseLegacyDoc(): DocxParseResult  (always ok:false)
 *
 * mammoth.js requires Node internals not available in jsdom.
 * We mock it so tests verify the parseDocx wrapper logic directly.
 *
 * Spec refs: FR-D1, FR-D2
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Mock mammoth BEFORE importing the module under test ─────────── */

vi.mock("mammoth", () => ({
  extractRawText: vi.fn(),
}));

import { parseDocx, parseLegacyDoc, type DocxParseResult } from "~/parsers/docx";
import * as mammothMod from "mammoth";

const mockExtractRawText = mammothMod.extractRawText as ReturnType<typeof vi.fn>;

/* ── Helpers ─────────────────────────────────────────────────────── */

type MammothMessage = { type: "warning" | "error"; message: string };

function setupMammoth(value: string, messages: MammothMessage[] = []) {
  mockExtractRawText.mockResolvedValue({ value, messages });
}

function setupMammothError(msg: string) {
  mockExtractRawText.mockRejectedValue(new Error(msg));
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════════
   1. Return shape
   ════════════════════════════════════════════════════════════════ */

describe("parseDocx — return shape", () => {
  it("returns { ok: true } with text on success", async () => {
    setupMammoth("Hello from docx");
    const r: DocxParseResult = await parseDocx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(typeof r.text).toBe("string");
  });

  it("returns { ok: false } with reason string on error", async () => {
    setupMammothError("Corrupt zip archive");
    const r = await parseDocx(new ArrayBuffer(8));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe("string");
  });
});

/* ════════════════════════════════════════════════════════════════
   2. Text extraction
   ════════════════════════════════════════════════════════════════ */

describe("parseDocx — text extraction", () => {
  it("returns the raw text from mammoth", async () => {
    setupMammoth("First paragraph\n\nSecond paragraph");
    const r = await parseDocx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("First paragraph\n\nSecond paragraph");
  });

  it("passes the buffer as arrayBuffer to mammoth", async () => {
    setupMammoth("content");
    const buf = new ArrayBuffer(16);
    await parseDocx(buf);
    expect(mockExtractRawText).toHaveBeenCalledWith(
      expect.objectContaining({ arrayBuffer: buf }),
    );
  });

  it("returns empty string when document has no text", async () => {
    setupMammoth("");
    const r = await parseDocx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("");
  });

  it("returns text with newlines preserved", async () => {
    const multiline = "Line 1\nLine 2\nLine 3";
    setupMammoth(multiline);
    const r = await parseDocx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("\n");
  });
});

/* ════════════════════════════════════════════════════════════════
   3. Warnings
   ════════════════════════════════════════════════════════════════ */

describe("parseDocx — warnings", () => {
  it("no warnings key when mammoth has no messages", async () => {
    setupMammoth("text", []);
    const r = await parseDocx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toBeUndefined();
  });

  it("collects mammoth warning messages into warnings[]", async () => {
    setupMammoth("text", [
      { type: "warning", message: "unrecognised element: w:bookmarkStart" },
      { type: "warning", message: "unrecognised element: w:customXml" },
    ]);
    const r = await parseDocx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toBeDefined();
      expect(r.warnings!.length).toBe(2);
      expect(r.warnings![0]).toContain("bookmarkStart");
    }
  });

  it("does not include non-warning message types", async () => {
    // error-level messages should not appear as warnings
    setupMammoth("text", [
      { type: "error", message: "some internal error" },
    ]);
    const r = await parseDocx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════════
   4. Error handling
   ════════════════════════════════════════════════════════════════ */

describe("parseDocx — error handling", () => {
  it("returns { ok: false } prefixed with 'DOCX parse error:' on throw", async () => {
    setupMammothError("corrupt zip");
    const r = await parseDocx(new ArrayBuffer(8));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/DOCX parse error/);
      expect(r.reason).toContain("corrupt zip");
    }
  });

  it("does not throw — always returns a DocxParseResult", async () => {
    setupMammothError("Catastrophic");
    await expect(parseDocx(new ArrayBuffer(8))).resolves.toMatchObject({ ok: false });
  });

  it("includes the original error message in reason", async () => {
    const detail = "End of central directory record signature not found";
    setupMammothError(detail);
    const r = await parseDocx(new ArrayBuffer(8));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(detail);
  });
});

/* ════════════════════════════════════════════════════════════════
   5. parseLegacyDoc (synchronous)
   ════════════════════════════════════════════════════════════════ */

describe("parseLegacyDoc", () => {
  it("always returns { ok: false }", () => {
    const r = parseLegacyDoc();
    expect(r.ok).toBe(false);
  });

  it("reason string mentions .docx as the recommended format", () => {
    const r = parseLegacyDoc();
    if (!r.ok) expect(r.reason).toContain(".docx");
  });

  it("reason string mentions the format is not supported", () => {
    const r = parseLegacyDoc();
    if (!r.ok) expect(r.reason.toLowerCase()).toContain("not supported");
  });

  it("is synchronous (returns a plain object, not a Promise)", () => {
    const r = parseLegacyDoc();
    expect(r).not.toBeInstanceOf(Promise);
  });
});
