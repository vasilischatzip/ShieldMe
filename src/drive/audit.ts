/**
 * Drive Audit orchestrator — T040.
 *
 * Orchestrates the full Drive audit pipeline:
 *
 *   First run:
 *     1. List ALL files via driveClient.listFiles().
 *     2. Classify permissions for each file.
 *     3. Content-scan files with exposure level ≠ "internal-only" (up to tier cap).
 *     4. Cache results in IDB (driveCache store), keyed by fileId.
 *     5. Save changes.startPageToken for incremental re-audit.
 *
 *   Subsequent runs (incremental):
 *     1. Use changes.list (driveClient.listChanges()) — only modified files.
 *     2. Re-classify + re-scan changed files; delete removed files from cache.
 *     3. Update stored startPageToken.
 *
 * Free tier cap: first 100 files with exposure ≠ internal-only (TierGate).
 * Paid tier: unlimited.
 *
 * Progress is reported via an optional callback so the UI can show live status.
 *
 * Contract: docs/engineering-qa.md §Q4 / engineering-qa.md §Free-Tier Limits
 */

import type { DriveFile, DriveClient }               from "./client";
import type { PermissionClassification }             from "./permissions";
import type { DriveScanResult }                      from "./scanner";
import { classifyPermissions, shouldScanContent }   from "./permissions";
import { createDriveScanner, type DriveFileScanner } from "./scanner";
import type { IdbStore }                             from "~/core/idb";
import { idb }                                       from "~/core/idb";
import type { TierGate }                             from "~/core/tier-gate";
import { FREE_LIMITS }                               from "~/core/tier-gate";
import { driveClient }                               from "./client";

/* ── IDB record shape ─────────────────────────────────────────────── */

/** What we store in driveCache for each file. */
export type DriveCacheEntry = DriveScanResult & {
  /** IDB keyPath. */
  fileId:      string;
  /** Used for IDB index queries. */
  modifiedTime: string;
};

/* ── Audit progress / result ──────────────────────────────────────── */

export type AuditPhase =
  | { phase: "listing";  filesFound: number }
  | { phase: "scanning"; scanned: number; total: number; fileName: string }
  | { phase: "done";     summary: AuditSummary };

export type AuditSummary = {
  totalFiles:       number;
  exposedFiles:     number;
  scannedFiles:     number;
  findingsCount:    number;
  skippedFiles:     number;
  durationMs:       number;
  /** True if free-tier cap was hit. */
  capped:           boolean;
};

export type ProgressCallback = (phase: AuditPhase) => void;

/* ── Error types ──────────────────────────────────────────────────── */

export class AuditAuthError extends Error {
  constructor(message: string) { super(message); this.name = "AuditAuthError"; }
}

/* ── Orchestrator interface ───────────────────────────────────────── */

export interface DriveAuditor {
  /**
   * Run a full audit (first-time or incremental).
   * Resolves with the summary when complete.
   */
  run(onProgress?: ProgressCallback): Promise<AuditSummary>;

  /** Load all cached entries from IDB. */
  loadCache(): Promise<DriveCacheEntry[]>;

  /** Clear the IDB cache and reset the startPageToken (forces a full re-audit). */
  reset(): Promise<void>;
}

/* ── Factory ─────────────────────────────────────────────────────── */

export type AuditorOpts = {
  client?:   DriveClient;
  idbStore?: IdbStore;
  tierGate?: TierGate;
  /** Injectable scanner for testing — defaults to createDriveScanner(client). */
  scanner?:  { scan: DriveFileScanner["scan"] };
};

export function createDriveAuditor(opts: AuditorOpts = {}): DriveAuditor {
  const client   = opts.client   ?? driveClient;
  const store    = opts.idbStore ?? idb;
  const scanner  = opts.scanner  ?? createDriveScanner(client);

  return { run, loadCache, reset };

  /* ── run ──────────────────────────────────────────────────────── */

  async function run(onProgress?: ProgressCallback): Promise<AuditSummary> {
    const t0 = Date.now();

    // Determine tier
    let cap = Infinity;
    if (opts.tierGate) {
      const result = await opts.tierGate.check("drive:audit-full");
      if (!result.allowed) {
        cap = FREE_LIMITS.driveAuditMaxFiles;
      }
    }

    // Check if incremental run is possible
    const storedToken = await client.loadStartPageToken();
    const isIncremental = Boolean(storedToken);

    let summary: AuditSummary;
    if (isIncremental) {
      summary = await runIncremental(cap, onProgress, t0);
    } else {
      summary = await runFull(cap, onProgress, t0);
    }

    onProgress?.({ phase: "done", summary });
    return summary;
  }

  /* ── Full audit ───────────────────────────────────────────────── */

  async function runFull(
    cap: number,
    onProgress: ProgressCallback | undefined,
    t0: number,
  ): Promise<AuditSummary> {
    let totalFiles    = 0;
    let exposedFiles  = 0;
    let scannedFiles  = 0;
    let findingsCount = 0;
    let skippedFiles  = 0;
    let capped        = false;

    const exposedBatch: Array<{ file: DriveFile; cls: PermissionClassification }> = [];

    // ── Phase 1: listing ─────────────────────────────────────────
    for await (const page of client.listFiles()) {
      for (const file of page) {
        totalFiles++;
        const cls = classifyPermissions(file);
        if (shouldScanContent(cls)) {
          exposedFiles++;
          if (exposedFiles <= cap) {
            exposedBatch.push({ file, cls });
          } else {
            capped = true;
          }
        } else {
          // Store a minimal cache entry for internal-only files (no content scan)
          const entry: DriveCacheEntry = {
            fileId:          file.id,
            fileName:        file.name,
            mimeType:        file.mimeType,
            modifiedTime:    file.modifiedTime,
            exposureLevel:   cls.level,
            externalDomains: cls.externalDomains,
            ...(file.webViewLink !== undefined ? { webViewLink: file.webViewLink } : {}),
            findings:        [],
            scannedAt:       new Date().toISOString(),
            durationMs:      0,
            skipped:         true,
            skipReason:      "internal-only",
          };
          await store.put<DriveCacheEntry>("driveCache", entry);
        }
      }
      onProgress?.({ phase: "listing", filesFound: totalFiles });
    }

    // ── Phase 2: scanning ─────────────────────────────────────────
    for (let i = 0; i < exposedBatch.length; i++) {
      const { file, cls } = exposedBatch[i]!;
      onProgress?.({
        phase:    "scanning",
        scanned:  i,
        total:    exposedBatch.length,
        fileName: file.name,
      });

      const result = await scanner.scan(file, cls);
      findingsCount += result.findings.length;
      if (result.skipped) skippedFiles++;
      else scannedFiles++;

      await store.put<DriveCacheEntry>("driveCache", result as DriveCacheEntry);
    }

    // Persist startPageToken for future incremental runs
    try {
      // Trigger listChanges to seed the startPageToken
      // (it will return nothing on first run, but saves the token)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of client.listChanges()) { /* drain */ }
    } catch { /* non-fatal */ }

    return {
      totalFiles,
      exposedFiles,
      scannedFiles,
      findingsCount,
      skippedFiles,
      durationMs: Date.now() - t0,
      capped,
    };
  }

  /* ── Incremental audit ────────────────────────────────────────── */

  async function runIncremental(
    cap: number,
    onProgress: ProgressCallback | undefined,
    t0: number,
  ): Promise<AuditSummary> {
    let scannedFiles  = 0;
    let findingsCount = 0;
    let skippedFiles  = 0;
    let totalChanged  = 0;

    const toScan: Array<{ file: DriveFile; cls: PermissionClassification }> = [];

    for await (const changes of client.listChanges()) {
      for (const change of changes) {
        totalChanged++;
        if (change.removed) {
          await store.delete("driveCache", change.fileId);
          continue;
        }
        if (!change.file) continue;

        const cls = classifyPermissions(change.file);
        if (shouldScanContent(cls)) {
          toScan.push({ file: change.file, cls });
        } else {
          const entry: DriveCacheEntry = {
            fileId:          change.file.id,
            fileName:        change.file.name,
            mimeType:        change.file.mimeType,
            modifiedTime:    change.file.modifiedTime,
            exposureLevel:   cls.level,
            externalDomains: cls.externalDomains,
            ...(change.file.webViewLink !== undefined ? { webViewLink: change.file.webViewLink } : {}),
            findings:        [],
            scannedAt:       new Date().toISOString(),
            durationMs:      0,
            skipped:         true,
            skipReason:      "internal-only",
          };
          await store.put<DriveCacheEntry>("driveCache", entry);
        }
      }
      onProgress?.({ phase: "listing", filesFound: totalChanged });
    }

    const limited = toScan.slice(0, cap);
    const capped  = toScan.length > cap;

    for (let i = 0; i < limited.length; i++) {
      const { file, cls } = limited[i]!;
      onProgress?.({
        phase:    "scanning",
        scanned:  i,
        total:    limited.length,
        fileName: file.name,
      });

      const result = await scanner.scan(file, cls);
      findingsCount += result.findings.length;
      if (result.skipped) skippedFiles++;
      else scannedFiles++;

      await store.put<DriveCacheEntry>("driveCache", result as DriveCacheEntry);
    }

    // Load totals from IDB for the summary
    const allCached = await store.getAll<DriveCacheEntry>("driveCache");
    const totalFiles   = allCached.length;
    const exposedFiles = allCached.filter(e => e.exposureLevel !== "internal-only").length;

    return {
      totalFiles,
      exposedFiles,
      scannedFiles,
      findingsCount,
      skippedFiles,
      durationMs: Date.now() - t0,
      capped,
    };
  }

  /* ── loadCache ───────────────────────────────────────────────── */

  async function loadCache(): Promise<DriveCacheEntry[]> {
    return store.getAll<DriveCacheEntry>("driveCache");
  }

  /* ── reset ───────────────────────────────────────────────────── */

  async function reset(): Promise<void> {
    await store.clearStore("driveCache");
    await client.saveStartPageToken("");
  }
}

/* ── Production singleton ────────────────────────────────────────── */

export const driveAuditor: DriveAuditor = createDriveAuditor();
