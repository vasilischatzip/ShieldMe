/**
 * T060 — Document Check scan flow tests.
 *
 * Write-first (TDD): tests for src/popup/routes/document-check/index.tsx
 *
 * Covers the core business logic of the Document Check module:
 *
 *   scanFile(file, opts): Promise<ScanFlowResult>
 *
 *   ScanFlowResult =
 *     | { ok: true;  findings: Finding[]; score: number; text: string; sourceLabel: string }
 *     | { ok: false; reason: ScanFlowError }
 *
 *   ScanFlowError =
 *     | { kind: "too-large";     sizeBytes: number; limitBytes: number }
 *     | { kind: "monthly-limit"; usedScans: number; limit: number }
 *     | { kind: "parse-failed";  detail: string }
 *     | { kind: "scan-failed";   detail: string }
 *
 * State machine: Idle → Reading → Scanning → Done (or Error at any step).
 * TierGate: scan:file-size (10 MB), scan:monthly-limit (5/month on free).
 *
 * Spec refs: FR-D1, FR-D2, FR-D3, FR-D4, FR-D7, AC-D1, AC-D2, AC-D3
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Mock heavy dependencies ─────────────────────────────────────── */

vi.mock("~/parsers/dispatch", () => ({ parseFile: vi.fn() }));
vi.mock("~/core/scan-engine",  () => ({ scanText:  vi.fn() }));

import { scanFile, type ScanFlowResult, type ScanFlowError } from "~/app/routes/document-check";
import * as dispatchMod from "~/parsers/dispatch";
import * as engineMod   from "~/core/scan-engine";
import { TierGate, FREE_LIMITS } from "~/core/tier-gate";
import type { Finding, Rules } from "~/detectors/types";

const mockParseFile = dispatchMod.parseFile as ReturnType<typeof vi.fn>;
const mockScanText  = engineMod.scanText    as ReturnType<typeof vi.fn>;

/* ── Helpers ─────────────────────────────────────────────────────── */

function makeFile(name: string, sizeBytes: number, type = "text/plain"): File {
  const body = "x".repeat(Math.min(sizeBytes, 1024)); // avoid huge actual allocations
  const file = new File([body], name, { type });
  // Override size for tests that need large file sizes without allocating that memory
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

function baseOpts(overrides: Partial<Parameters<typeof scanFile>[1]> = {}) {
  return {
    tierGate:      new TierGate(),          // PreviewBillingProvider → always allowed
    rules:         allOnRules(),
    locale:        "en",
    scansThisMonth: 0,
    ...overrides,
  };
}

function allOnRules(): Rules {
  return {
    categories: {
      myMoney: true, myIdentity: true, myHealth: true,
      myFamily: true, myDigitalLife: true, myLocation: true,
    },
    detectors:            {},
    includeBetaDetectors: false,
  };
}

const EMPTY_SCAN = { findings: [] as Finding[], score: 0, durationMs: 5 };
const SAMPLE_FINDING: Finding = {
  detectorId:      "credit-card",
  categoryId:      "myMoney",
  severity:        "critical",
  confidence:      0.95,
  contextSnippet:  "•••1111111111111111•••",
  match: { value: "4111111111111111", start: 0, end: 15 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════════
   1. Happy path — returns findings
   ════════════════════════════════════════════════════════════════ */

describe("scanFile — happy path", () => {
  it("returns { ok: true } with findings and score", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "some text" });
    mockScanText.mockResolvedValue({ findings: [SAMPLE_FINDING], score: 80, durationMs: 10 });

    const r: ScanFlowResult = await scanFile(makeFile("doc.txt", 100), baseOpts());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.findings).toHaveLength(1);
      expect(r.score).toBe(80);
    }
  });

  it("returns empty findings when document has no PII", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "Hello world" });
    mockScanText.mockResolvedValue(EMPTY_SCAN);

    const r = await scanFile(makeFile("clean.txt", 50), baseOpts());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.findings).toHaveLength(0);
  });

  it("includes the source label (filename) in result", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "content" });
    mockScanText.mockResolvedValue(EMPTY_SCAN);

    const r = await scanFile(makeFile("my-resume.pdf", 100, "application/pdf"), baseOpts());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sourceLabel).toBe("my-resume.pdf");
  });

  it("includes the extracted text in result", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "extracted content here" });
    mockScanText.mockResolvedValue(EMPTY_SCAN);

    const r = await scanFile(makeFile("doc.txt", 100), baseOpts());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("extracted content here");
  });

  it("calls parseFile with the File and passes result text to scanText", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "the full text" });
    mockScanText.mockResolvedValue(EMPTY_SCAN);

    const file = makeFile("test.txt", 100);
    await scanFile(file, baseOpts());

    expect(mockParseFile).toHaveBeenCalledOnce();
    const [passedFile] = mockParseFile.mock.calls[0] as [File];
    expect(passedFile).toBe(file);

    expect(mockScanText).toHaveBeenCalledOnce();
    const [text] = mockScanText.mock.calls[0] as [string, ...unknown[]];
    expect(text).toBe("the full text");
  });
});

/* ════════════════════════════════════════════════════════════════
   2. TierGate enforcement — file size
   ════════════════════════════════════════════════════════════════ */

describe("scanFile — TierGate: file size (scan:file-size)", () => {
  it("allows files within the free-tier 10 MB limit (preview tier bypasses anyway)", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "text" });
    mockScanText.mockResolvedValue(EMPTY_SCAN);

    const smallFile = makeFile("small.txt", FREE_LIMITS.maxFileSizeBytes - 1);
    const r = await scanFile(smallFile, baseOpts());
    expect(r.ok).toBe(true);
  });

  it("on free tier: blocks files larger than 10 MB with too-large error", async () => {
    // Free-tier TierGate stub
    const freeTierGate = new TierGate({ getTier: async () => "free" });
    const bigFile = makeFile("huge.pdf", FREE_LIMITS.maxFileSizeBytes + 1, "application/pdf");

    const r = await scanFile(bigFile, baseOpts({ tierGate: freeTierGate }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.kind).toBe("too-large");
      if (r.reason.kind === "too-large") {
        expect(r.reason.limitBytes).toBe(FREE_LIMITS.maxFileSizeBytes);
        expect(r.reason.sizeBytes).toBeGreaterThan(FREE_LIMITS.maxFileSizeBytes);
      }
    }
    // Should not attempt parsing for oversized files
    expect(mockParseFile).not.toHaveBeenCalled();
  });

  it("on free tier: exactly 10 MB is allowed", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "text" });
    mockScanText.mockResolvedValue(EMPTY_SCAN);

    const freeTierGate = new TierGate({ getTier: async () => "free" });
    const exactFile = makeFile("exact.txt", FREE_LIMITS.maxFileSizeBytes);
    const r = await scanFile(exactFile, baseOpts({ tierGate: freeTierGate }));
    expect(r.ok).toBe(true);
  });

  it("on premium tier: allows files larger than 10 MB", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "text" });
    mockScanText.mockResolvedValue(EMPTY_SCAN);

    const premiumGate = new TierGate({ getTier: async () => "premium" });
    const bigFile = makeFile("large.pdf", FREE_LIMITS.maxFileSizeBytes + 1_000_000);
    const r = await scanFile(bigFile, baseOpts({ tierGate: premiumGate }));
    expect(r.ok).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════
   3. TierGate enforcement — monthly limit
   ════════════════════════════════════════════════════════════════ */

describe("scanFile — TierGate: monthly scan limit (scan:monthly-limit)", () => {
  it("on free tier: blocks when monthly limit (5) is reached", async () => {
    const freeTierGate = new TierGate({ getTier: async () => "free" });
    const r = await scanFile(
      makeFile("doc.txt", 100),
      baseOpts({ tierGate: freeTierGate, scansThisMonth: FREE_LIMITS.scansPerMonth }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.kind).toBe("monthly-limit");
      if (r.reason.kind === "monthly-limit") {
        expect(r.reason.limit).toBe(FREE_LIMITS.scansPerMonth);
      }
    }
    expect(mockParseFile).not.toHaveBeenCalled();
  });

  it("on free tier: allows scan 4 (below limit)", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "text" });
    mockScanText.mockResolvedValue(EMPTY_SCAN);

    const freeTierGate = new TierGate({ getTier: async () => "free" });
    const r = await scanFile(
      makeFile("doc.txt", 100),
      baseOpts({ tierGate: freeTierGate, scansThisMonth: FREE_LIMITS.scansPerMonth - 1 }),
    );
    expect(r.ok).toBe(true);
  });

  it("on premium tier: allows scans beyond 5 per month", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "text" });
    mockScanText.mockResolvedValue(EMPTY_SCAN);

    const premiumGate = new TierGate({ getTier: async () => "premium" });
    const r = await scanFile(
      makeFile("doc.txt", 100),
      baseOpts({ tierGate: premiumGate, scansThisMonth: 100 }),
    );
    expect(r.ok).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════
   4. Parse failure propagation
   ════════════════════════════════════════════════════════════════ */

describe("scanFile — parse failure", () => {
  it("returns parse-failed error when parseFile returns too-large", async () => {
    mockParseFile.mockResolvedValue({
      ok: false,
      reason: { kind: "too-large", sizeBytes: 20_000_000, limitBytes: 10_485_760 },
    });
    const r = await scanFile(makeFile("big.pdf", 20_000_000), baseOpts());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe("too-large");
  });

  it("returns parse-failed error when parseFile returns decode-failed", async () => {
    mockParseFile.mockResolvedValue({
      ok: false,
      reason: { kind: "decode-failed", detail: "bad zip structure" },
    });
    const r = await scanFile(makeFile("corrupt.docx", 100), baseOpts());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.kind).toBe("parse-failed");
      if (r.reason.kind === "parse-failed") {
        expect(r.reason.detail).toContain("bad zip");
      }
    }
  });

  it("returns parse-failed error when parseFile returns unsupported-format", async () => {
    mockParseFile.mockResolvedValue({
      ok: false,
      reason: { kind: "unsupported-format", ext: "psd", mime: "image/vnd.adobe.photoshop" },
    });
    const r = await scanFile(makeFile("design.psd", 100), baseOpts());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe("unsupported-format");
  });

  it("does not call scanText when parseFile fails", async () => {
    mockParseFile.mockResolvedValue({
      ok: false,
      reason: { kind: "decode-failed", detail: "corrupt" },
    });
    await scanFile(makeFile("bad.docx", 100), baseOpts());
    expect(mockScanText).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════
   5. Scan failure propagation
   ════════════════════════════════════════════════════════════════ */

describe("scanFile — scan failure", () => {
  it("returns scan-failed error when scanText throws", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "text" });
    mockScanText.mockRejectedValue(new Error("detector crash"));

    const r = await scanFile(makeFile("doc.txt", 100), baseOpts());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.kind).toBe("scan-failed");
      if (r.reason.kind === "scan-failed") {
        expect(r.reason.detail).toContain("detector crash");
      }
    }
  });

  it("does not throw — always returns a ScanFlowResult", async () => {
    mockParseFile.mockResolvedValue({ ok: true, text: "text" });
    mockScanText.mockRejectedValue(new Error("boom"));

    await expect(scanFile(makeFile("doc.txt", 100), baseOpts())).resolves.toMatchObject({ ok: false });
  });
});

/* ════════════════════════════════════════════════════════════════
   6. Type guard: ScanFlowError kind exhaustiveness
   ════════════════════════════════════════════════════════════════ */

describe("ScanFlowError kinds", () => {
  it("'too-large' error has sizeBytes and limitBytes", async () => {
    const freeTierGate = new TierGate({ getTier: async () => "free" });
    const r = await scanFile(
      makeFile("big.pdf", FREE_LIMITS.maxFileSizeBytes + 1),
      baseOpts({ tierGate: freeTierGate }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason.kind === "too-large") {
      const err: Extract<ScanFlowError, { kind: "too-large" }> = r.reason;
      expect(typeof err.sizeBytes).toBe("number");
      expect(typeof err.limitBytes).toBe("number");
    }
  });

  it("'monthly-limit' error has usedScans and limit", async () => {
    const freeTierGate = new TierGate({ getTier: async () => "free" });
    const r = await scanFile(
      makeFile("doc.txt", 100),
      baseOpts({ tierGate: freeTierGate, scansThisMonth: FREE_LIMITS.scansPerMonth }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason.kind === "monthly-limit") {
      const err: Extract<ScanFlowError, { kind: "monthly-limit" }> = r.reason;
      expect(typeof err.usedScans).toBe("number");
      expect(typeof err.limit).toBe("number");
    }
  });
});
