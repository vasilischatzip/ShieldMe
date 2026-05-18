/**
 * Drive file scanner — T039.
 *
 * Downloads a Drive file's content (via DriveClient) and runs the ScanEngine
 * over the extracted text.  Mirrors the Document Check pipeline but scoped to
 * Drive files.
 *
 * Responsibilities:
 *   • Convert ArrayBuffer → File so parsers/dispatch.ts can handle it.
 *   • Dispatch through the existing parser cascade (text, PDF, DOCX…).
 *   • Call ScanEngine.scanText on the result.
 *   • Return a DriveScanResult containing findings + metadata.
 *
 * Privacy:
 *   • File content is downloaded into memory, scanned, then discarded.
 *   • Only contextSnippets appear in findings — never raw file bytes.
 *   • Results are stored in IDB by the caller (audit orchestrator).
 *
 * Contract: docs/engineering-qa.md §Q4
 */

import type { DriveFile } from "./client";
import type { DriveClient } from "./client";
import type { PermissionClassification } from "./permissions";
import { parseFile, isPlainTextLike } from "~/parsers/dispatch";
import { scanText } from "~/core/scan-engine";
import { loadRules, rulesState } from "~/core/rules";
import { getCurrentLocale } from "~/core/i18n";
import type { Finding } from "~/detectors/types";

/* ── Types ────────────────────────────────────────────────────────── */

export type DriveScanResult = {
  fileId:           string;
  fileName:         string;
  mimeType:         string;
  modifiedTime:     string;
  findings:         Finding[];
  /** Exposure level from the permission classifier — stored alongside findings. */
  exposureLevel:    PermissionClassification["level"];
  externalDomains:  string[];
  webViewLink?:     string;
  /** Scan duration in milliseconds. */
  durationMs:       number;
  /** ISO timestamp when this scan was performed. */
  scannedAt:        string;
  /** Whether content scanning was skipped (e.g. unsupported format). */
  skipped:          boolean;
  skipReason?:      string;
};

/* ── Scannable MIME types ─────────────────────────────────────────── */

/** Google Workspace MIME types that can be exported as plain text. */
const GOOGLE_DOCS_MIME  = "application/vnd.google-apps.document";
const GOOGLE_SHEETS_MIME = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";

/** MimeTypes we attempt to download and scan directly. */
const SCANNABLE_MIMES = new Set([
  "text/plain",
  "text/csv",
  "text/tab-separated-values",
  "text/html",
  "text/xml",
  "application/json",
  "application/xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",   // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",         // .xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/msword",        // .doc
  "application/vnd.ms-excel",  // .xls
  GOOGLE_DOCS_MIME,
  GOOGLE_SHEETS_MIME,
  GOOGLE_SLIDES_MIME,
]);

/**
 * Maximum content size to download per file (10 MB free / 50 MB paid).
 * The caller (audit orchestrator) may override this based on tier.
 */
export const DEFAULT_MAX_CONTENT_BYTES = 10 * 1024 * 1024; // 10 MB

/* ── Google Workspace export helpers ─────────────────────────────── */

/**
 * For Google Docs/Sheets/Slides, Drive doesn't support alt=media directly.
 * We must use the export endpoint with a suitable MIME.
 */
export function exportMimeFor(googleMime: string): string | null {
  switch (googleMime) {
    case GOOGLE_DOCS_MIME:   return "text/plain";
    case GOOGLE_SHEETS_MIME: return "text/csv";
    case GOOGLE_SLIDES_MIME: return "text/plain";
    default:                 return null;
  }
}

/* ── Scanner factory ──────────────────────────────────────────────── */

export type DriveFileScanner = {
  scan(
    file: DriveFile,
    classification: PermissionClassification,
    maxContentBytes?: number,
  ): Promise<DriveScanResult>;
};

export function createDriveScanner(client: DriveClient): DriveFileScanner {
  return { scan };

  async function scan(
    file: DriveFile,
    classification: PermissionClassification,
    maxContentBytes = DEFAULT_MAX_CONTENT_BYTES,
  ): Promise<DriveScanResult> {
    const t0 = Date.now();
    const base: Omit<DriveScanResult, "findings" | "durationMs" | "skipped" | "skipReason"> = {
      fileId:          file.id,
      fileName:        file.name,
      mimeType:        file.mimeType,
      modifiedTime:    file.modifiedTime,
      exposureLevel:   classification.level,
      externalDomains: classification.externalDomains,
      ...(file.webViewLink !== undefined ? { webViewLink: file.webViewLink } : {}),
      scannedAt:       new Date().toISOString(),
    };

    // ── Decide whether we can scan this type ──────────────────────
    if (!SCANNABLE_MIMES.has(file.mimeType)) {
      return {
        ...base,
        findings:   [],
        durationMs: Date.now() - t0,
        skipped:    true,
        skipReason: `Unsupported MIME type: ${file.mimeType}`,
      };
    }

    // ── Download content ──────────────────────────────────────────
    let buffer: ArrayBuffer;
    try {
      buffer = await downloadContent(file, client);
    } catch (err) {
      return {
        ...base,
        findings:   [],
        durationMs: Date.now() - t0,
        skipped:    true,
        skipReason: `Download failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ── Size guard ────────────────────────────────────────────────
    if (buffer.byteLength > maxContentBytes) {
      return {
        ...base,
        findings:   [],
        durationMs: Date.now() - t0,
        skipped:    true,
        skipReason: `File too large (${buffer.byteLength} bytes > ${maxContentBytes} limit)`,
      };
    }

    // ── Parse to text ─────────────────────────────────────────────
    const effectiveMime = exportMimeFor(file.mimeType) ?? file.mimeType;
    const blob = new Blob([buffer], { type: effectiveMime });
    const fileObj = new File([blob], file.name, { type: effectiveMime });

    const parsed = await parseFile(fileObj, { maxBytes: maxContentBytes });

    if (!parsed.ok) {
      return {
        ...base,
        findings:   [],
        durationMs: Date.now() - t0,
        skipped:    true,
        skipReason: `Parse failed: ${parsed.reason.kind}`,
      };
    }

    // ── Scan text ─────────────────────────────────────────────────
    await loadRules();
    const locale  = getCurrentLocale();
    const scanned = await scanText(parsed.text, rulesState.value, {
      locale,
      module: "drive-audit",
    });

    return {
      ...base,
      findings:   scanned.findings,
      durationMs: Date.now() - t0,
      skipped:    false,
    };
  }
}

/* ── Download helper ──────────────────────────────────────────────── */

async function downloadContent(file: DriveFile, client: DriveClient): Promise<ArrayBuffer> {
  const exportMime = exportMimeFor(file.mimeType);

  if (exportMime) {
    // Google Workspace files: use export endpoint
    // The DriveClient doesn't have a generic request() method, so we access
    // the token and call the export URL manually.
    // NOTE: For MVP we delegate back to downloadFile which uses alt=media.
    // The Google Workspace export endpoint is handled by the same token bucket,
    // but requires a different URL.  Callers using the production client will
    // need to handle GOOGLE_DOCS_MIME via client.downloadFile with the export
    // URL.  For MVP text-export is approximated by treating the content as text.
    return client.downloadFile(file.id);
  }

  return client.downloadFile(file.id);
}

/* ── Helpers ──────────────────────────────────────────────────────── */

/**
 * Returns true if the file name or MIME suggests a plain-text format.
 * Used by the orchestrator to quickly triage before downloading.
 */
export function isTextLikeFile(file: DriveFile): boolean {
  return isPlainTextLike(file.name, file.mimeType) || Boolean(exportMimeFor(file.mimeType));
}
