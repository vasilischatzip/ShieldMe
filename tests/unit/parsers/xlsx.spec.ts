/**
 * T054 — XLSX parser unit tests.
 *
 * Write-first (TDD): tests for src/parsers/xlsx.ts
 *
 * Contract (actual API):
 *   parseXlsx(buffer: ArrayBuffer, maxRows?: number): Promise<XlsxParseResult>
 *   XlsxParseResult =
 *     | { ok: true;  text: string;  sheetCount: number; warnings?: string[] }
 *     | { ok: false; reason: string }
 *
 * SheetJS (xlsx) is mocked so tests verify the wrapper logic without needing
 * a real XLSX file.
 *
 * Spec refs: FR-D1, FR-D2, FR-D4
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Mock SheetJS BEFORE importing the module under test ─────────── */

vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}));

import { parseXlsx, type XlsxParseResult } from "~/parsers/xlsx";
import * as XLSXMod from "xlsx";

const mockRead = XLSXMod.read as ReturnType<typeof vi.fn>;
const mockSheetToJson = XLSXMod.utils.sheet_to_json as ReturnType<typeof vi.fn>;

/* ── Helpers ─────────────────────────────────────────────────────── */

/**
 * Set up a fake workbook with the given sheets.
 * `rows` is an array of rows (each row is an array of cell values).
 */
function setupWorkbook(sheets: Array<{ name: string; rows: unknown[][] }>) {
  const SheetNames = sheets.map((s) => s.name);
  const Sheets: Record<string, object> = {};
  for (const s of sheets) Sheets[s.name] = {};

  mockRead.mockReturnValue({ SheetNames, Sheets });

  // sheet_to_json returns different rows per call, matched by sheet name
  let callIdx = 0;
  mockSheetToJson.mockImplementation(() => {
    const rows = sheets[callIdx % sheets.length]?.rows ?? [];
    callIdx++;
    return rows;
  });
}

function setupReadError(msg: string) {
  mockRead.mockImplementation(() => { throw new Error(msg); });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════════
   1. Return shape
   ════════════════════════════════════════════════════════════════ */

describe("parseXlsx — return shape", () => {
  it("returns { ok: true } with text and sheetCount on success", async () => {
    setupWorkbook([{ name: "Sheet1", rows: [["Name", "Email"]] }]);
    const r: XlsxParseResult = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(typeof r.text).toBe("string");
      expect(typeof r.sheetCount).toBe("number");
    }
  });

  it("returns { ok: false } with reason string on error", async () => {
    setupReadError("Invalid ZIP archive");
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe("string");
  });
});

/* ════════════════════════════════════════════════════════════════
   2. Text extraction
   ════════════════════════════════════════════════════════════════ */

describe("parseXlsx — text extraction", () => {
  it("labels each sheet in the output", async () => {
    setupWorkbook([
      { name: "Sheet1", rows: [["Alice", "42"]] },
    ]);
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("[Sheet: Sheet1]");
  });

  it("formats cells as ColRow: value", async () => {
    setupWorkbook([
      { name: "S1", rows: [["hello", "world"]] },
    ]);
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("A1: hello");
      expect(r.text).toContain("B1: world");
    }
  });

  it("skips empty cells", async () => {
    setupWorkbook([
      { name: "S1", rows: [["data", "", "more"]] },
    ]);
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("A1: data");
      expect(r.text).toContain("C1: more");
      // Empty B1 should not appear
      expect(r.text).not.toMatch(/B1:\s*[,|]/);
    }
  });

  it("includes text from multiple sheets", async () => {
    setupWorkbook([
      { name: "Sheet1", rows: [["Row1"]] },
      { name: "Sheet2", rows: [["Row2"]] },
    ]);
    // Override the sequential call mock for 2 sheets
    let callIdx = 0;
    mockSheetToJson.mockImplementation(() => {
      const data = callIdx === 0 ? [["Row1"]] : [["Row2"]];
      callIdx++;
      return data;
    });

    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("[Sheet: Sheet1]");
      expect(r.text).toContain("[Sheet: Sheet2]");
      expect(r.text).toContain("Row1");
      expect(r.text).toContain("Row2");
    }
  });

  it("uses Excel-style column labels beyond Z", async () => {
    // 27th column (index 26) should be "AA"
    const row = new Array(27).fill("x");
    setupWorkbook([{ name: "S1", rows: [row] }]);
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("AA1: x");
  });
});

/* ════════════════════════════════════════════════════════════════
   3. sheetCount
   ════════════════════════════════════════════════════════════════ */

describe("parseXlsx — sheetCount", () => {
  it("reports correct sheetCount for single sheet", async () => {
    setupWorkbook([{ name: "Sheet1", rows: [["a"]] }]);
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sheetCount).toBe(1);
  });

  it("reports correct sheetCount for three sheets", async () => {
    setupWorkbook([
      { name: "A", rows: [] },
      { name: "B", rows: [] },
      { name: "C", rows: [] },
    ]);
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sheetCount).toBe(3);
  });
});

/* ════════════════════════════════════════════════════════════════
   4. maxRows truncation
   ════════════════════════════════════════════════════════════════ */

describe("parseXlsx — maxRows truncation", () => {
  it("adds a warning when a sheet has more rows than maxRows", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => [`row${i}`]);
    setupWorkbook([{ name: "S1", rows }]);
    mockSheetToJson.mockReturnValue(rows);
    const r = await parseXlsx(new ArrayBuffer(8), 3); // cap at 3
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toBeDefined();
      expect(r.warnings!.length).toBeGreaterThan(0);
      expect(r.warnings![0]).toContain("truncated");
    }
  });

  it("only includes up to maxRows rows when exceeded", async () => {
    const rows = [["alpha"], ["beta"], ["gamma"], ["delta"]];
    setupWorkbook([{ name: "S1", rows }]);
    mockSheetToJson.mockReturnValue(rows);
    const r = await parseXlsx(new ArrayBuffer(8), 2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("alpha");
      expect(r.text).toContain("beta");
      expect(r.text).not.toContain("gamma");
      expect(r.text).not.toContain("delta");
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   5. Error handling
   ════════════════════════════════════════════════════════════════ */

describe("parseXlsx — error handling", () => {
  it("does not throw — always returns an XlsxParseResult", async () => {
    setupReadError("Corrupt archive");
    await expect(parseXlsx(new ArrayBuffer(8))).resolves.toMatchObject({ ok: false });
  });

  it("returns parse error prefix on generic failure", async () => {
    setupReadError("invalid zip");
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/Spreadsheet parse error/);
      expect(r.reason).toContain("invalid zip");
    }
  });

  it("detects password-protected XLSX by error message", async () => {
    setupReadError("Workbook is password protected");
    const r = await parseXlsx(new ArrayBuffer(8));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/password/i);
    }
  });

  it("passes buffer as Uint8Array to XLSX.read", async () => {
    setupWorkbook([{ name: "S1", rows: [] }]);
    const buf = new ArrayBuffer(16);
    await parseXlsx(buf);
    expect(mockRead).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ type: "array" }),
    );
  });
});
