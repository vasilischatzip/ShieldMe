/**
 * Parser dispatch (T024 / T024b).
 *
 * Maps File → { text } so the ScanEngine has something to chew on.
 *
 * Supported formats:
 *   • Plain text: txt, csv, tsv, md, log, json, yaml, xml, html, rtf, …
 *   • PDF:  .pdf  — via pdfjs-dist (lazy-loaded, ~2.5 MB)
 *   • DOCX: .docx — via mammoth (lazy-loaded, ~400 KB)
 *   • XLSX: .xlsx, .xls — via SheetJS (lazy-loaded, ~800 KB)
 *
 * Lazy loading ensures the initial popup bundle stays ≤500 KB.
 * Binary parsers are only imported when the user actually scans that type.
 *
 * Pure (other than reading the File). No network, no eval, no DOM.
 *
 * Contract: docs/engineering-qa.md §Q2
 */

export type ParseResult =
  | { ok: true;  text: string;  warnings?: string[] }
  | { ok: false; reason: ParseError };

export type ParseError =
  | { kind: "unsupported-format"; ext: string; mime: string }
  | { kind: "too-large";          sizeBytes: number; limitBytes: number }
  | { kind: "decode-failed";      detail: string };

/* ── Extension / MIME lookups ────────────────────────────────────── */

const TEXT_EXTS = new Set([
  "txt", "csv", "tsv", "md", "markdown", "log", "json", "yaml", "yml",
  "xml", "html", "htm", "ini", "conf", "cfg", "env", "rtf",
]);

const TEXT_MIMES = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/html",
  "text/xml",
  "application/json",
  "application/xml",
  "application/x-yaml",
]);

const PDF_EXTS  = new Set(["pdf"]);
const DOCX_EXTS = new Set(["docx"]);
const DOC_EXTS  = new Set(["doc"]);
const XLSX_EXTS = new Set(["xlsx", "xls", "ods", "numbers"]);
const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "webp", "tiff", "tif", "avif",
]);
const IMAGE_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/bmp",
  "image/webp", "image/tiff", "image/avif",
]);

/** Default cap matches Free-tier scan limit. */
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/* ── Helpers ─────────────────────────────────────────────────────── */

function getExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "";
  return filename.slice(dot + 1).toLowerCase();
}

export function isPlainTextLike(filename: string, mime: string): boolean {
  const ext = getExt(filename);
  if (TEXT_EXTS.has(ext)) return true;
  if (mime && TEXT_MIMES.has(mime)) return true;
  if (mime && mime.startsWith("text/")) return true;
  return false;
}

/* ── Main dispatcher ─────────────────────────────────────────────── */

import type { OcrOpts } from "./ocr";

export type ParseFileOpts = {
  maxBytes?: number;
  /** OCR-specific overrides (image files only). */
  ocr?: Omit<OcrOpts, "maxBytes">;
};

/**
 * Read a `File` into normalised UTF-8 text using the appropriate parser.
 * Caller is responsible for `TierGate.check()` before calling.
 */
export async function parseFile(
  file: File,
  opts: ParseFileOpts = {},
): Promise<ParseResult> {
  const limit = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  if (file.size > limit) {
    return {
      ok: false,
      reason: { kind: "too-large", sizeBytes: file.size, limitBytes: limit },
    };
  }

  const ext  = getExt(file.name);
  const mime = file.type || "";

  // ── Plain text (native decode, synchronous-ish) ───────────────
  if (isPlainTextLike(file.name, mime)) {
    try {
      const text       = await readAsText(file);
      const normalised = ext === "rtf" ? stripRtf(text) : text;
      return { ok: true, text: normalised };
    } catch (e) {
      return {
        ok: false,
        reason: { kind: "decode-failed", detail: String(e) },
      };
    }
  }

  // ── PDF ───────────────────────────────────────────────────────
  if (PDF_EXTS.has(ext) || mime === "application/pdf") {
    const { parsePdf } = await import("./pdf");
    const buf    = await file.arrayBuffer();
    const result = await parsePdf(buf);
    if (!result.ok) {
      return { ok: false, reason: { kind: "decode-failed", detail: result.reason } };
    }
    return { ok: true, text: result.text, ...(result.warnings ? { warnings: result.warnings } : {}) };
  }

  // ── DOCX ─────────────────────────────────────────────────────
  if (DOCX_EXTS.has(ext) || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const { parseDocx } = await import("./docx");
    const buf    = await file.arrayBuffer();
    const result = await parseDocx(buf);
    if (!result.ok) {
      return { ok: false, reason: { kind: "decode-failed", detail: result.reason } };
    }
    return { ok: true, text: result.text, ...(result.warnings ? { warnings: result.warnings } : {}) };
  }

  // ── Legacy .doc ───────────────────────────────────────────────
  if (DOC_EXTS.has(ext) || mime === "application/msword") {
    const { parseLegacyDoc } = await import("./docx");
    const result = parseLegacyDoc();
    // parseLegacyDoc always returns ok:false
    const reason = !result.ok ? result.reason : "Legacy .doc not supported";
    return { ok: false, reason: { kind: "decode-failed", detail: reason } };
  }

  // ── XLSX / XLS / ODS ─────────────────────────────────────────
  if (
    XLSX_EXTS.has(ext) ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.oasis.opendocument.spreadsheet"
  ) {
    const { parseXlsx } = await import("./xlsx");
    const buf    = await file.arrayBuffer();
    const result = await parseXlsx(buf);
    if (!result.ok) {
      return { ok: false, reason: { kind: "decode-failed", detail: result.reason } };
    }
    return { ok: true, text: result.text, ...(result.warnings ? { warnings: result.warnings } : {}) };
  }

  // ── Images → OCR ─────────────────────────────────────────────
  if (IMAGE_EXTS.has(ext) || IMAGE_MIMES.has(mime) || mime.startsWith("image/")) {
    const { parseOcr } = await import("./ocr");
    const result = await parseOcr(file, { maxBytes: limit, ...opts.ocr });
    if (!result.ok) {
      return { ok: false, reason: { kind: "decode-failed", detail: result.reason } };
    }
    return { ok: true, text: result.text, ...(result.warnings ? { warnings: result.warnings } : {}) };
  }

  // ── Unsupported ───────────────────────────────────────────────
  return {
    ok: false,
    reason: { kind: "unsupported-format", ext, mime },
  };
}

/* ── Low-level readers ───────────────────────────────────────────── */

function readAsText(file: Blob): Promise<string> {
  // Prefer the modern Blob.text() if available; fall back to FileReader.
  if (typeof (file as Blob).text === "function") return (file as Blob).text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload  = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

/**
 * Minimal RTF stripper — removes control words and braces. Good enough to
 * surface PII for scanning; not a faithful RTF→text converter.
 */
function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, " ") // \par, \fs24, etc.
    .replace(/[{}]/g, "")
    .replace(/\\\\/g, "\\")
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
