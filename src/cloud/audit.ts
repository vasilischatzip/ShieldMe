/**
 * T103 — Drive audit engine.
 *
 * Spec refs: FR-A2, FR-A3, FR-A4, AC-A2, AC-A4
 *
 * Pipeline:
 *   1. List all files via CloudStorageProvider.listAllFiles().
 *   2. Classify each file as exposed (public link, external editors/viewers)
 *      or private.  Private files with no content scan → no finding.
 *   3. Sort exposed files by permission severity (public > external editors >
 *      external viewers).
 *   4. Content-scan the top N exposed files (contentScanLimit; Free tier: 100).
 *      Files beyond the limit still produce a permissions-based finding.
 *   5. Cross-reference permissions × scan findings to assign overall severity:
 *        • critical    : any critical content finding in an exposed file
 *        • warning     : public link OR external editors (no critical content)
 *        • info        : external viewers only
 *   6. Return AuditResult.
 *
 * Performance:
 *   Content download + text decoding is intentionally lightweight here.
 *   The real parser pipeline (PDF, DOCX) lives in src/parsers/ and would be
 *   plumbed in at the UI layer or by a richer runner; this engine just decodes
 *   ArrayBuffer → UTF-8 string for the scan request.
 */

import type { CloudStorageProvider, StorageFileMeta } from "./storage-provider";
import type { ScanRequest, ScanResult, Rules } from "../detectors/types";

/* ── Default rules (all categories on) ──────────────────────────── */

const ALL_RULES: Rules = {
  categories: {
    myMoney:       true,
    myIdentity:    true,
    myHealth:      true,
    myFamily:      true,
    myDigitalLife: true,
    myLocation:    true,
  },
  detectors: {},
};

/* ── Public types ────────────────────────────────────────────────── */

export type AuditReason =
  | "public-link"
  | "external-editor"
  | "external-viewer"
  | "sensitive-content";

export type AuditFinding = {
  file:        StorageFileMeta;
  severity:    "critical" | "warning" | "info";
  reasons:     AuditReason[];
  /** Present when the file was content-scanned. */
  scanResult?: ScanResult;
};

export type AuditResult = {
  /** Files with at least one exposure or sensitive finding. */
  findings:     AuditFinding[];
  /** Total files listed (including private/unexposed). */
  totalFiles:   number;
  /** Files that were actually content-scanned. */
  scannedFiles: number;
  /**
   * Set to the applied content-scan limit when more exposed files exist than
   * were scanned.  `undefined` when no limit was applied.
   */
  limitedAt?: number;
};

export type DriveAuditOptions = {
  /**
   * Max number of exposed files to content-scan.
   * Callers pass 100 for Free tier (FR-A2).  Default: unlimited.
   */
  contentScanLimit?: number;
  /** Locale tag forwarded to ScanEngine. Default: "en". */
  locale?:           string;
  /** Stop the run gracefully when aborted. */
  abortSignal?:      AbortSignal;
};

export type DriveAuditDeps = {
  /**
   * Injectable scan function.  In production this wraps `scanEngine.scan()`;
   * in tests it is a vitest mock.
   */
  scan: (req: ScanRequest) => Promise<ScanResult>;
};

/* ── Exposure priority ───────────────────────────────────────────── */

/** Higher → higher priority for content scanning. */
function exposurePriority(file: StorageFileMeta): number {
  const p = file.permissions;
  if (p.isPublicLink) return 3;
  if (p.externalEditors.length > 0) return 2;
  if (p.externalCollaborators.length > 0) return 1;
  return 0;
}

/* ── Severity computation ────────────────────────────────────────── */

function computeSeverity(
  file:       StorageFileMeta,
  scanResult: ScanResult | undefined,
): "critical" | "warning" | "info" {
  const p           = file.permissions;
  const hasCritical = scanResult?.findings.some((f) => f.severity === "critical") ?? false;

  // Critical content in any exposed file → escalate to critical
  if (hasCritical && exposurePriority(file) > 0) return "critical";

  // Public link or external editor → warning
  if (p.isPublicLink || p.externalEditors.length > 0) return "warning";

  // External viewers only → info
  return "info";
}

/* ── DriveAuditEngine ────────────────────────────────────────────── */

export class DriveAuditEngine {
  private readonly _provider: CloudStorageProvider;
  private readonly _deps:     DriveAuditDeps;

  constructor(provider: CloudStorageProvider, deps: DriveAuditDeps) {
    this._provider = provider;
    this._deps     = deps;
  }

  async run(opts?: DriveAuditOptions): Promise<AuditResult> {
    const locale   = opts?.locale          ?? "en";
    const limit    = opts?.contentScanLimit;
    const signal   = opts?.abortSignal;

    // ── 1. List all files ──────────────────────────────────────────
    const allFiles: StorageFileMeta[] = [];
    const listOpts = signal !== undefined
      ? { abortSignal: signal }
      : {};
    for await (const f of this._provider.listAllFiles(listOpts)) {
      allFiles.push(f);
    }

    // ── 2. Split into exposed / private ───────────────────────────
    const exposed = allFiles
      .filter((f) => exposurePriority(f) > 0)
      .sort((a, b) => exposurePriority(b) - exposurePriority(a)); // highest priority first

    const private_ = allFiles.filter((f) => exposurePriority(f) === 0);

    // ── 3. Content-scan exposed files (up to limit) ───────────────
    const toScan  = limit !== undefined ? exposed.slice(0, limit) : exposed;
    const beyond  = limit !== undefined ? exposed.slice(limit)    : [];
    const didLimit = beyond.length > 0;

    const scannedMap = new Map<string, ScanResult>();
    for (const file of toScan) {
      if (signal?.aborted) break;
      try {
        const bytes = await this._provider.getContent(file.id, file.mimeType);
        const text  = new TextDecoder().decode(bytes);
        // Build source carefully to satisfy exactOptionalPropertyTypes
        const source: ScanRequest["source"] = { text };
        if (file.name     !== undefined) source.filename  = file.name;
        if (file.mimeType !== undefined) source.mimeType  = file.mimeType;
        if (file.sizeBytes !== undefined) source.sizeBytes = file.sizeBytes;
        const req: ScanRequest = {
          module:      "drive-audit",
          source,
          locale,
          activeRules: ALL_RULES,
          clock:       Date,
        };
        const result = await this._deps.scan(req);
        scannedMap.set(file.id, result);
      } catch {
        // Content download failures are non-fatal; file still appears as a
        // permissions-based finding.
      }
    }

    // ── 4. Build findings ──────────────────────────────────────────
    const findings: AuditFinding[] = [];

    for (const file of exposed) {
      if (signal?.aborted) break;

      const scanResult  = scannedMap.get(file.id);
      const severity    = computeSeverity(file, scanResult);
      const reasons:    AuditReason[] = [];

      if (file.permissions.isPublicLink)               reasons.push("public-link");
      if (file.permissions.externalEditors.length > 0) reasons.push("external-editor");
      if (file.permissions.externalCollaborators.length > 0) reasons.push("external-viewer");
      if (scanResult && scanResult.findings.length > 0) reasons.push("sensitive-content");

      const finding: AuditFinding = { file, severity, reasons };
      if (scanResult !== undefined) finding.scanResult = scanResult;
      findings.push(finding);
    }

    // Private files only appear as findings if content scan reveals issues
    // (future: privacy leakage via orphaned access, stale links, etc.)
    // For now, private files with no exposure produce no findings.
    void private_; // reserved for future cross-reference

    return {
      findings,
      totalFiles:   allFiles.length,
      scannedFiles: scannedMap.size,
      ...(didLimit ? { limitedAt: limit! } : {}),
    };
  }
}
