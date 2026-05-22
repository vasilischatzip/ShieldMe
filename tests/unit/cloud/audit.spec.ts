/**
 * T102 — Failing tests for the Drive audit engine.
 *
 * Covers:
 *   FR-A2  — content scan cap (Free tier: top 100 most-exposed files)
 *   FR-A4  — cross-reference permissions × content findings
 *   AC-A2  — Free tier content scan stops at 100 files with banner
 *   AC-A4  — file with IBAN + "Anyone with link" → Critical severity
 *
 * Design:
 *   DriveAuditEngine(provider, deps) where deps.scan is the injectable scan fn.
 *   FakeCloudStorageProvider supplies the file corpus.
 *   A mock scan function controls what findings are returned per file.
 */

import { describe, it, expect, vi } from "vitest";
import { DriveAuditEngine } from "~/cloud/audit";
import { FakeCloudStorageProvider, makePublicFile, makeFileMeta } from "../../fakes/cloud/fake-storage-provider";
import type { ScanRequest, ScanResult, Finding } from "~/detectors/types";

/** Scan function that returns no findings (clean file). */
function cleanScan(_req: ScanRequest): Promise<ScanResult> {
  return Promise.resolve({
    findings:      [],
    score:         0,
    durationMs:    1,
    detectorRunId: "test-run-clean",
  });
}

/** Scan function that returns a critical finding (IBAN) if text is non-empty. */
function criticalScan(req: ScanRequest): Promise<ScanResult> {
  if (!req.source.text.trim()) {
    return cleanScan(req);
  }
  const finding: Finding = {
    detectorId:     "iban",
    categoryId:     "myMoney",
    severity:       "critical",
    confidence:     0.99,
    match:          { value: "GB29NWBK60161331926819", start: 6, end: 28 },
    contextSnippet: "IBAN: •••",
    locale:         "eu",
  };
  return Promise.resolve({
    findings:      [finding],
    score:         100,
    durationMs:    1,
    detectorRunId: "test-run-iban",
  });
}

/** Scan function that returns a warning-severity finding. */
function warningScan(req: ScanRequest): Promise<ScanResult> {
  if (!req.source.text.trim()) return cleanScan(req);
  const finding: Finding = {
    detectorId:     "email",
    categoryId:     "myDigitalLife",
    severity:       "warning",
    confidence:     0.9,
    match:          { value: "alice@example.com", start: 0, end: 17 },
    contextSnippet: "•••",
    locale:         "global",
  };
  return Promise.resolve({
    findings:      [finding],
    score:         50,
    durationMs:    1,
    detectorRunId: "test-run-warn",
  });
}

/** Build a DriveAuditEngine with the given provider and scan function. */
function makeEngine(
  provider: FakeCloudStorageProvider,
  scan: (req: ScanRequest) => Promise<ScanResult> = cleanScan,
): DriveAuditEngine {
  return new DriveAuditEngine(provider, { scan });
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe("DriveAuditEngine", () => {
  // ── Empty corpus ───────────────────────────────────────────────

  it("returns empty results for a provider with no files", async () => {
    const provider = new FakeCloudStorageProvider();
    const engine   = makeEngine(provider);
    const result   = await engine.run();

    expect(result.totalFiles).toBe(0);
    expect(result.findings).toHaveLength(0);
    expect(result.scannedFiles).toBe(0);
  });

  // ── Unexposed files ────────────────────────────────────────────

  it("produces no findings for private files with no content sensitivity", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makeFileMeta({
      id:          "f-private",
      name:        "private.pdf",
      permissions: { isPublicLink: false, externalCollaborators: [], externalEditors: [] },
    }));
    provider._setTextContent("f-private", "");

    const engine = makeEngine(provider);
    const result = await engine.run();

    expect(result.totalFiles).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  // ── Public-link exposure ───────────────────────────────────────

  it("flags a public-link file with at least 'warning' severity", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makePublicFile("f-public", "shared-report.pdf"));
    provider._setTextContent("f-public", "");  // no content

    const engine  = makeEngine(provider, cleanScan);
    const result  = await engine.run();

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.file.id).toBe("f-public");
    expect(["warning", "critical"]).toContain(finding.severity);
    expect(finding.reasons).toContain("public-link");
  });

  it("flags a file with external editors as 'warning'", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makeFileMeta({
      id:          "f-shared",
      name:        "team-doc.pdf",
      permissions: {
        isPublicLink:          false,
        externalCollaborators: [],
        externalEditors:       ["alice@other.com"],
      },
    }));
    provider._setTextContent("f-shared", "");

    const engine = makeEngine(provider, cleanScan);
    const result = await engine.run();

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.reasons).toContain("external-editor");
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("flags a file with only external viewers as 'info'", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makeFileMeta({
      id:          "f-viewer",
      name:        "public-report.pdf",
      permissions: {
        isPublicLink:          false,
        externalCollaborators: ["viewer@other.com"],
        externalEditors:       [],
      },
    }));
    provider._setTextContent("f-viewer", "");

    const engine = makeEngine(provider, cleanScan);
    const result = await engine.run();

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.reasons).toContain("external-viewer");
    expect(result.findings[0]!.severity).toBe("info");
  });

  // ── Cross-reference: permissions × content ─────────────────────

  it("escalates to 'critical' when public-link + critical content finding (AC-A4)", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makePublicFile("f-iban", "financials.pdf"));
    provider._setTextContent("f-iban", "IBAN: GB29NWBK60161331926819");

    const engine = makeEngine(provider, criticalScan);
    const result = await engine.run();

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.severity).toBe("critical");
    expect(finding.reasons).toContain("public-link");
    expect(finding.reasons).toContain("sensitive-content");
  });

  it("upgrades warning-shared file to 'critical' when critical content found", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makeFileMeta({
      id:          "f-shared-iban",
      name:        "sensitive.pdf",
      permissions: {
        isPublicLink:          false,
        externalCollaborators: [],
        externalEditors:       ["alice@other.com"],
      },
    }));
    provider._setTextContent("f-shared-iban", "IBAN: GB29NWBK60161331926819");

    const engine = makeEngine(provider, criticalScan);
    const result = await engine.run();

    const finding = result.findings[0]!;
    expect(finding.severity).toBe("critical");
    expect(finding.reasons).toContain("sensitive-content");
  });

  it("adds 'sensitive-content' reason when content scan finds issues", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makePublicFile("f-warn", "doc-with-emails.pdf"));
    provider._setTextContent("f-warn", "alice@example.com");

    const engine = makeEngine(provider, warningScan);
    const result = await engine.run();

    const finding = result.findings[0]!;
    expect(finding.reasons).toContain("sensitive-content");
    expect(finding.scanResult).toBeDefined();
    expect(finding.scanResult!.findings).toHaveLength(1);
  });

  it("includes scanResult in the AuditFinding for scanned files", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makePublicFile("f1", "test.pdf"));
    provider._setTextContent("f1", "IBAN: GB29NWBK60161331926819");

    const engine = makeEngine(provider, criticalScan);
    const result = await engine.run();

    const finding = result.findings[0]!;
    expect(finding.scanResult).toBeDefined();
    expect(finding.scanResult!.findings[0]!.detectorId).toBe("iban");
  });

  // ── totalFiles and scannedFiles counters ───────────────────────

  it("totalFiles includes private files (full listing, AC-A2)", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makePublicFile("f1", "public.pdf"));
    provider._addFile(makeFileMeta({ id: "f2", name: "private.pdf" }));
    provider._addFile(makeFileMeta({ id: "f3", name: "private2.pdf" }));
    for (const id of ["f1", "f2", "f3"]) provider._setTextContent(id, "");

    const engine = makeEngine(provider, cleanScan);
    const result = await engine.run();

    expect(result.totalFiles).toBe(3);      // all files listed
    expect(result.scannedFiles).toBe(1);    // only public file scanned
    expect(result.findings).toHaveLength(1); // only public file is a finding
  });

  // ── Content scan limit (Free tier, AC-A2) ─────────────────────

  it("caps content scan at contentScanLimit and reports limitedAt (AC-A2)", async () => {
    const provider = new FakeCloudStorageProvider();
    // Add 5 public files when limit is 3
    for (let i = 1; i <= 5; i++) {
      provider._addFile(makePublicFile(`f${i}`, `file${i}.pdf`));
      provider._setTextContent(`f${i}`, "content");
    }

    const scanSpy = vi.fn(criticalScan);
    const engine  = new DriveAuditEngine(provider, { scan: scanSpy });
    const result  = await engine.run({ contentScanLimit: 3 });

    // Only 3 files were content-scanned
    expect(scanSpy).toHaveBeenCalledTimes(3);
    expect(result.scannedFiles).toBe(3);
    expect(result.limitedAt).toBe(3);
    // All 5 are listed and appear in findings (public link even without scan)
    expect(result.totalFiles).toBe(5);
    expect(result.findings).toHaveLength(5);
  });

  it("does not set limitedAt when no scan limit is applied", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makePublicFile("f1", "file.pdf"));
    provider._setTextContent("f1", "");

    const engine = makeEngine(provider, cleanScan);
    const result = await engine.run();   // no limit

    expect(result.limitedAt).toBeUndefined();
  });

  // ── abortSignal ────────────────────────────────────────────────

  it("respects abortSignal — stops processing mid-run", async () => {
    const provider = new FakeCloudStorageProvider();
    for (let i = 1; i <= 10; i++) {
      provider._addFile(makePublicFile(`f${i}`, `file${i}.pdf`));
      provider._setTextContent(`f${i}`, "");
    }

    const controller = new AbortController();
    const scanFn = vi.fn(async (_req: ScanRequest): Promise<ScanResult> => {
      controller.abort();  // abort after first scan
      return cleanScan(_req);
    });

    const engine = makeEngine(provider, scanFn);
    const result = await engine.run({ abortSignal: controller.signal });

    // Scan was called at most once (abort happened during first scan)
    expect(scanFn.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result.totalFiles).toBeGreaterThan(0);
  });

  // ── Multiple reasons ───────────────────────────────────────────

  it("collects multiple reasons on a single finding", async () => {
    const provider = new FakeCloudStorageProvider();
    provider._addFile(makeFileMeta({
      id:          "f-multi",
      name:        "exposed.pdf",
      permissions: {
        isPublicLink:          true,
        externalCollaborators: [],
        externalEditors:       ["collab@other.com"],
      },
    }));
    provider._setTextContent("f-multi", "");

    const engine = makeEngine(provider, cleanScan);
    const result = await engine.run();

    const finding = result.findings[0]!;
    expect(finding.reasons).toContain("public-link");
    expect(finding.reasons).toContain("external-editor");
  });
});
