/**
 * T025 — OCR parser unit tests.
 *
 * Both tesseract.js and createImageBitmap are mocked so the suite runs
 * without WASM, trained data, or a real canvas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OcrProgress } from "~/parsers/ocr";
import { FREE_MAX_BYTES } from "~/ocr/tesseract-config";

/* ── Mock tesseract.js ───────────────────────────────────────────── */

const mockTerminate  = vi.fn().mockResolvedValue(undefined);
const mockRecognize  = vi.fn();
const mockSetParams  = vi.fn().mockResolvedValue(undefined);
const mockWorker     = { recognize: mockRecognize, terminate: mockTerminate, setParameters: mockSetParams };
const mockCreateWorker = vi.fn().mockResolvedValue(mockWorker);

vi.mock("tesseract.js", () => ({
  OEM: { LSTM_ONLY: 1 },
  PSM: { AUTO: "3" },
  createWorker: (...args: unknown[]) => mockCreateWorker(...args),
}));

/* ── Mock createImageBitmap global ──────────────────────────────── */

// Default stub: 800×600 image, no resize
const mockBitmapClose = vi.fn();
const mockBitmap      = { width: 800, height: 600, close: mockBitmapClose } as unknown as ImageBitmap;
const mockCreateImageBitmap = vi.fn().mockResolvedValue(mockBitmap);

vi.stubGlobal("createImageBitmap", mockCreateImageBitmap);

/* ── Helpers ─────────────────────────────────────────────────────── */

function imageFile(name: string, sizeBytes = 1000, type = "image/png"): File {
  const buf = new Uint8Array(sizeBytes);
  return new File([buf], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateImageBitmap.mockResolvedValue(mockBitmap);
  mockRecognize.mockResolvedValue({ data: { text: "hello world" } });
  mockTerminate.mockResolvedValue(undefined);
  mockSetParams.mockResolvedValue(undefined);
});

/* ── Size gate ───────────────────────────────────────────────────── */

describe("parseOcr — size gate", () => {
  it("rejects files over maxBytes", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    const file = imageFile("big.png", FREE_MAX_BYTES + 1);
    const r = await parseOcr(file);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too large/i);
    // Tesseract should never be called
    expect(mockCreateWorker).not.toHaveBeenCalled();
  });

  it("accepts files at exactly maxBytes", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    const file = imageFile("edge.png", FREE_MAX_BYTES);
    const r = await parseOcr(file);
    expect(r.ok).toBe(true);
  });

  it("uses custom maxBytes option", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    const file = imageFile("small.png", 5_000);
    const r = await parseOcr(file, { maxBytes: 4_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/too large/i);
  });
});

/* ── Normal OCR flow ─────────────────────────────────────────────── */

describe("parseOcr — successful recognition", () => {
  it("returns trimmed text from Tesseract", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    mockRecognize.mockResolvedValue({ data: { text: "  extracted text  \n" } });

    const file = imageFile("scan.png");
    const r = await parseOcr(file);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("extracted text");
  });

  it("creates a Tesseract worker and terminates it", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    await parseOcr(imageFile("doc.jpg", 1000, "image/jpeg"));
    expect(mockCreateWorker).toHaveBeenCalledOnce();
    expect(mockTerminate).toHaveBeenCalledOnce();
  });

  it("sets page segmentation mode", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    await parseOcr(imageFile("form.png"));
    expect(mockSetParams).toHaveBeenCalledOnce();
  });

  it("calls createImageBitmap to probe dimensions", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    await parseOcr(imageFile("photo.png"));
    // First call probes dimensions (no resize options)
    expect(mockCreateImageBitmap).toHaveBeenCalledWith(expect.any(File));
  });
});

/* ── Downscaling ─────────────────────────────────────────────────── */

describe("parseOcr — downscaling", () => {
  it("does NOT downscale images under DOWNSCALE_MAX_PX", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    // Default mock is 800×600 — well under 2000px
    await parseOcr(imageFile("small.png"));
    // Only one createImageBitmap call (probe), no resize call
    expect(mockCreateImageBitmap).toHaveBeenCalledTimes(1);
  });

  it("downscales images exceeding DOWNSCALE_MAX_PX", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    // Simulate a large image: 4000×3000 px
    const largeBitmap = { width: 4000, height: 3000, close: vi.fn() } as unknown as ImageBitmap;
    const resizedBitmap = { width: 2000, height: 1500, close: vi.fn() } as unknown as ImageBitmap;
    mockCreateImageBitmap
      .mockResolvedValueOnce(largeBitmap)   // probe call
      .mockResolvedValueOnce(resizedBitmap); // resize call

    await parseOcr(imageFile("large.png"));

    // Second call should include resize dimensions
    expect(mockCreateImageBitmap).toHaveBeenCalledTimes(2);
    const resizeCall = mockCreateImageBitmap.mock.calls[1]!;
    expect(resizeCall[1]).toMatchObject({ resizeWidth: 2000, resizeHeight: 1500 });
  });

  it("closes probe ImageBitmap after dimension check", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    await parseOcr(imageFile("img.png"));
    expect(mockBitmapClose).toHaveBeenCalled();
  });

  it("falls back to file directly if createImageBitmap throws", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    mockCreateImageBitmap.mockRejectedValue(new Error("unsupported image type"));
    const r = await parseOcr(imageFile("weird.img"));
    // Should still attempt OCR with the raw file
    expect(mockRecognize).toHaveBeenCalledOnce();
    expect(r.ok).toBe(true);
  });
});

/* ── Progress callback ───────────────────────────────────────────── */

describe("parseOcr — progress", () => {
  it("calls onProgress with recognizing text events", async () => {
    const { parseOcr } = await import("~/parsers/ocr");

    // Simulate logger callback being invoked
    let capturedLogger: ((m: { status: string; progress: number }) => void) | undefined;
    mockCreateWorker.mockImplementationOnce(async (_lang: string, _oem: number, opts: { logger?: (m: { status: string; progress: number }) => void }) => {
      capturedLogger = opts?.logger;
      return mockWorker;
    });

    const ticks: OcrProgress[] = [];
    await parseOcr(imageFile("img.png"), { onProgress: p => ticks.push(p) });

    // Simulate logger events
    capturedLogger?.({ status: "initializing tesseract", progress: 0 });
    capturedLogger?.({ status: "recognizing text", progress: 0.5 });
    capturedLogger?.({ status: "recognizing text", progress: 1 });

    expect(ticks).toContainEqual({ status: "recognizing text", progress: 50 });
    expect(ticks).toContainEqual({ status: "recognizing text", progress: 100 });
    // Non-recognizing events get progress: -1
    expect(ticks).toContainEqual({ status: "initializing tesseract", progress: -1 });
  });

  it("works without onProgress (no logger passed)", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    let workerOpts: { logger?: unknown } = {};
    mockCreateWorker.mockImplementationOnce(async (_l: string, _o: number, opts: { logger?: unknown }) => {
      workerOpts = opts ?? {};
      return mockWorker;
    });

    await parseOcr(imageFile("img.png"));
    expect(workerOpts.logger).toBeUndefined();
  });
});

/* ── Timeout ─────────────────────────────────────────────────────── */

describe("parseOcr — timeout", () => {
  it("returns decode-failed reason when OCR exceeds timeoutMs", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    // recognize never resolves
    mockRecognize.mockReturnValue(new Promise(() => {}));

    const r = await parseOcr(imageFile("slow.png"), { timeoutMs: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/timed out/i);
    // Worker should still be terminated
    expect(mockTerminate).toHaveBeenCalled();
  });
});

/* ── Abort / cancellation ────────────────────────────────────────── */

describe("parseOcr — abort signal", () => {
  it("returns cancelled immediately if signal is pre-aborted", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    const ctrl = new AbortController();
    ctrl.abort();

    const r = await parseOcr(imageFile("img.png"), { signal: ctrl.signal });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cancel/i);
    expect(mockCreateWorker).not.toHaveBeenCalled();
  });
});

/* ── Error handling ──────────────────────────────────────────────── */

describe("parseOcr — error handling", () => {
  it("maps Tesseract errors to decode-failed", async () => {
    const { parseOcr } = await import("~/parsers/ocr");
    mockRecognize.mockRejectedValue(new Error("worker crashed"));

    const r = await parseOcr(imageFile("broken.png"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/ocr error/i);
      expect(r.reason).toContain("worker crashed");
    }
    expect(mockTerminate).toHaveBeenCalled();
  });
});
