/**
 * Tesseract.js OCR configuration constants (T025).
 *
 * Centralises all tuning knobs so callers never hard-code values.
 * Mirrors the design decisions in docs/engineering-qa.md §Q3.
 */
import { OEM, PSM } from "tesseract.js";

/** Language pack to load at initialisation. English only for the initial build. */
export const TESSERACT_LANG = "eng";

/**
 * OCR engine mode — LSTM_ONLY is fastest and most accurate for typed text.
 * (3–4× faster than TESSERACT_LSTM_COMBINED with comparable accuracy on clean scans.)
 */
export const TESSERACT_OEM = OEM.LSTM_ONLY;

/**
 * Page segmentation mode — AUTO lets Tesseract determine the layout itself.
 * Works well for mixed documents, forms, invoices, and receipts.
 */
export const TESSERACT_PSM = PSM.AUTO;

/* ── Free-tier limits ─────────────────────────────────────────────── */

/** Maximum file size for the Free tier. */
export const FREE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Maximum image dimension (longer edge) accepted on the Free tier. */
export const FREE_MAX_DIM_PX = 2048;

/* ── Paid-tier limits ─────────────────────────────────────────────── */

export const PAID_MAX_BYTES  = 25 * 1024 * 1024; // 25 MB
export const PAID_MAX_DIM_PX = 6_000;

/* ── Downscale threshold ──────────────────────────────────────────── */

/**
 * Images whose longer edge exceeds this are downscaled to this size before
 * being passed to Tesseract.  Reducing a 4000 px image to 2000 px is ~3×
 * faster with no measurable accuracy loss on machine-printed text.
 */
export const DOWNSCALE_MAX_PX = 2_000;

/* ── Timing ───────────────────────────────────────────────────────── */

/** Hard timeout before showing "taking longer than usual" UX. */
export const OCR_TIMEOUT_MS = 30_000;
