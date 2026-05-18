/**
 * T059 — Offscreen parser unit tests.
 *
 * Tests for src/offscreen/parser.ts
 *
 * The chrome.runtime API is not available in jsdom. We test handleParseFile()
 * directly (the exported pure handler), and verify registerOffscreenListener()
 * wires up chrome.runtime.onMessage correctly using a vi.fn() stub.
 *
 * The heavier parse logic (pdf, docx, xlsx, etc.) is covered by the parser
 * unit tests; here we focus on the offscreen message-routing contract.
 *
 * Spec refs: FR-D2, NFR-P2
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Mock parsers to avoid loading heavy deps in this suite ─────── */

vi.mock("~/parsers/dispatch", () => ({
  parseFile: vi.fn(),
}));

import { handleParseFile, registerOffscreenListener } from "~/offscreen/parser";
import * as dispatchMod from "~/parsers/dispatch";

const mockParseFile = dispatchMod.parseFile as ReturnType<typeof vi.fn>;

/* ── Helpers ─────────────────────────────────────────────────────── */

function makeReq(overrides: Partial<{
  filename: string;
  buffer: ArrayBuffer;
  mime: string;
  maxBytes: number;
}> = {}) {
  const req: import("~/offscreen/parser").ParseFileRequest = {
    target:   "offscreen",
    action:   "parse-file",
    filename: overrides.filename ?? "test.txt",
    buffer:   overrides.buffer ?? new ArrayBuffer(8),
    ...(overrides.mime !== undefined    ? { mime:     overrides.mime }     : {}),
    ...(overrides.maxBytes !== undefined ? { maxBytes: overrides.maxBytes } : {}),
  };
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════════
   1. handleParseFile — delegation
   ════════════════════════════════════════════════════════════════ */

describe("handleParseFile — delegation to parseFile", () => {
  it("calls parseFile with a File built from the buffer", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "hello" });
    const buf = new ArrayBuffer(4);
    await handleParseFile(makeReq({ filename: "doc.txt", buffer: buf }));
    expect(mockParseFile).toHaveBeenCalledOnce();
    const [file] = mockParseFile.mock.calls[0] as [File, ...unknown[]];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("doc.txt");
  });

  it("sets MIME type on the File when mime is provided", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "pdf text" });
    await handleParseFile(makeReq({ filename: "report", mime: "application/pdf" }));
    const [file] = mockParseFile.mock.calls[0] as [File, ...unknown[]];
    expect(file.type).toBe("application/pdf");
  });

  it("passes maxBytes option to parseFile", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "text" });
    await handleParseFile(makeReq({ maxBytes: 5_242_880 }));
    const [, opts] = mockParseFile.mock.calls[0] as [File, { maxBytes?: number }];
    expect(opts?.maxBytes).toBe(5_242_880);
  });

  it("returns the ParseResult from parseFile unchanged", async () => {
    const expected = { ok: true, text: "extracted text", warnings: ["truncated"] };
    mockParseFile.mockResolvedValue(expected);
    const result = await handleParseFile(makeReq());
    expect(result).toEqual(expected);
  });
});

/* ════════════════════════════════════════════════════════════════
   2. handleParseFile — result shapes
   ════════════════════════════════════════════════════════════════ */

describe("handleParseFile — result shapes", () => {
  it("returns { ok: true } result from parseFile on success", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "all good" });
    const r = await handleParseFile(makeReq());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("all good");
  });

  it("returns { ok: false } result from parseFile on failure", async () => {
    mockParseFile.mockResolvedValue({
      ok: false,
      reason: { kind: "decode-failed", detail: "bad format" },
    });
    const r = await handleParseFile(makeReq());
    expect(r.ok).toBe(false);
  });

  it("returns too-large error when parseFile signals too-large", async () => {
    mockParseFile.mockResolvedValue({
      ok: false,
      reason: { kind: "too-large", sizeBytes: 20_971_520, limitBytes: 10_485_760 },
    });
    const r = await handleParseFile(makeReq());
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason.kind === "too-large") {
      expect(r.reason.sizeBytes).toBe(20_971_520);
    }
  });

  it("returns unsupported-format error when parseFile signals it", async () => {
    mockParseFile.mockResolvedValue({
      ok: false,
      reason: { kind: "unsupported-format", ext: "zip", mime: "application/zip" },
    });
    const r = await handleParseFile(makeReq({ filename: "archive.zip" }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason.kind === "unsupported-format") {
      expect(r.reason.ext).toBe("zip");
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   3. registerOffscreenListener — chrome.runtime wiring
   ════════════════════════════════════════════════════════════════ */

describe("registerOffscreenListener", () => {
  it("registers a listener on chrome.runtime.onMessage", () => {
    const addListener = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { onMessage: { addListener } },
    });

    registerOffscreenListener();
    expect(addListener).toHaveBeenCalledOnce();
    const [firstArg] = addListener.mock.calls[0] as [unknown];
    expect(typeof firstArg).toBe("function");

    vi.unstubAllGlobals();
  });

  it("listener ignores messages not addressed to offscreen target", () => {
    const addListener = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { onMessage: { addListener } },
    });
    registerOffscreenListener();
    const handler = (addListener.mock.calls[0] as [unknown])[0] as (
      msg: unknown,
      sender: unknown,
      sendResponse: () => void,
    ) => boolean;

    const result = handler({ target: "background", action: "some-action" }, {}, vi.fn());
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });

  it("listener returns true (keeps channel open) for parse-file action", () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "text" });

    const addListener = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { onMessage: { addListener } },
    });
    registerOffscreenListener();
    const handler = (addListener.mock.calls[0] as [unknown])[0] as (
      msg: unknown,
      sender: unknown,
      sendResponse: (r: unknown) => void,
    ) => boolean;

    const result = handler(
      {
        target: "offscreen",
        action: "parse-file",
        filename: "test.txt",
        buffer: new ArrayBuffer(4),
      },
      {},
      vi.fn(),
    );
    expect(result).toBe(true);

    vi.unstubAllGlobals();
  });

  it("listener calls sendResponse with parse result", async () => {
    const parseResult = { ok: true, text: "parsed!" };
    mockParseFile.mockResolvedValue(parseResult);

    const addListener = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { onMessage: { addListener } },
    });
    registerOffscreenListener();
    const handler = (addListener.mock.calls[0] as [unknown])[0] as (
      msg: unknown,
      sender: unknown,
      sendResponse: (r: unknown) => void,
    ) => boolean;

    const sendResponse = vi.fn();
    handler(
      {
        target: "offscreen",
        action: "parse-file",
        filename: "doc.txt",
        buffer: new ArrayBuffer(4),
      },
      {},
      sendResponse,
    );

    // Wait for the async handler to resolve
    await vi.waitUntil(() => sendResponse.mock.calls.length > 0, { timeout: 1000 });
    expect(sendResponse).toHaveBeenCalledWith(parseResult);

    vi.unstubAllGlobals();
  });
});
