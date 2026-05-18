/**
 * OCR parser — T025.
 *
 * Extracts text from image files (PNG, JPG, TIFF, …) using Tesseract.js v7.
 * Loaded lazily so the ~4 MB WASM bundle is only fetched when the user
 * actually scans an image file.
 *
 * Pipeline:
 *   1. Enforce file-size limit (Free: 5 MB, configurable).
 *   2. Decode image dimensions via createImageBitmap; if the longer edge
 *      exceeds DOWNSCALE_MAX_PX, downscale using createImageBitmap's
 *      built-in resize (avoids a canvas element in worker contexts).
 *   3. Spin up a Tesseract.js worker (LSTM_ONLY, AUTO layout), run
 *      recognize(), forward logger events as progress ticks, then terminate.
 *   4. Race the recognize() promise against a hard timeout; return a typed
 *      error on timeout rather than letting the promise hang.
 *
 * Cancellation: pass an AbortSignal.  Abort terminates the worker and
 * resolves with ok:false / reason:"OCR cancelled".
 *
 * Privacy: no data leaves the device. Pure in-process WASM execution.
 * Contract: docs/engineering-qa.md §Q3
 */

import {
  TESSERACT_LANG,
  TESSERACT_OEM,
  TESSERACT_PSM,
  FREE_MAX_BYTES,
  FREE_MAX_DIM_PX,
  DOWNSCALE_MAX_PX,
  OCR_TIMEOUT_MS,
} from "~/ocr/tesseract-config";

/** Safe ImageBitmap type guard — `ImageBitmap` is not defined in jsdom/workers. */
function isImageBitmap(v: unknown): v is ImageBitmap {
  return typeof ImageBitmap !== "undefined" && v instanceof ImageBitmap;
}

export type OcrParseResult =
  | { ok: true;  text: string;  warnings?: string[] }
  | { ok: false; reason: string };

export interface OcrProgress {
  status:   string;
  /** 0–100 integer percent; -1 when indeterminate. */
  progress: number;
}

export interface OcrOpts {
  /**
   * Maximum file size in bytes.
   * Default: FREE_MAX_BYTES (5 MB).
   */
  maxBytes?: number;
  /**
   * Maximum image dimension (longer edge) in pixels.
   * Images larger than this are accepted but downscaled before OCR.
   * Default: FREE_MAX_DIM_PX (2048 px).
   */
  maxDimPx?: number;
  /**
   * Timeout in milliseconds.  When exceeded the worker is terminated and
   * ok:false / reason:"OCR timed out" is returned.
   * Default: OCR_TIMEOUT_MS (30 s).
   */
  timeoutMs?: number;
  /** Progress callback fired by the Tesseract logger. */
  onProgress?: (p: OcrProgress) => void;
  /** AbortSignal — abort() terminates the worker and resolves ok:false. */
  signal?: AbortSignal;
}

/* ── Main export ─────────────────────────────────────────────────── */

/**
 * Extract text from an image File using Tesseract.js OCR.
 * Caller should check TierGate before calling and pass appropriate maxBytes.
 */
export async function parseOcr(
  file: File,
  opts: OcrOpts = {},
): Promise<OcrParseResult> {
  const {
    maxBytes  = FREE_MAX_BYTES,
    maxDimPx  = FREE_MAX_DIM_PX,
    timeoutMs = OCR_TIMEOUT_MS,
    onProgress,
    signal,
  } = opts;

  // ── 1. Size gate ──────────────────────────────────────────────
  if (file.size > maxBytes) {
    const sizeMb  = (file.size / 1_048_576).toFixed(1);
    const limitMb = (maxBytes  / 1_048_576).toFixed(0);
    return {
      ok: false,
      reason: `Image too large (${sizeMb} MB) — limit is ${limitMb} MB`,
    };
  }

  // ── 2. Bail early if already aborted ─────────────────────────
  if (signal?.aborted) {
    return { ok: false, reason: "OCR cancelled" };
  }

  try {
    // ── 3. Determine dimensions & conditionally downscale ──────
    //
    // createImageBitmap is available in Chrome extension popup, offscreen
    // documents, and service workers (Chrome 86+). In jsdom test envs it
    // should be stubbed by the test.
    let source: ImageBitmap | File = file;
    const warnings: string[] = [];

    try {
      const probe = await createImageBitmap(file);
      const { width, height } = probe;
      probe.close();

      const longerEdge = Math.max(width, height);

      if (longerEdge > DOWNSCALE_MAX_PX) {
        if (longerEdge > maxDimPx) {
          warnings.push(
            `Image dimension ${longerEdge} px exceeds ${maxDimPx} px limit; downscaled for OCR.`,
          );
        }

        const scale = DOWNSCALE_MAX_PX / longerEdge;
        const resizedBitmap = await createImageBitmap(file, {
          resizeWidth:   Math.round(width  * scale),
          resizeHeight:  Math.round(height * scale),
          resizeQuality: "high",
        });
        source = resizedBitmap;
      }
    } catch {
      // createImageBitmap unavailable or failed (e.g. unsupported format) —
      // pass the file directly and let Tesseract attempt to decode it.
    }

    // ── 4. Check abort again after async decode ────────────────
    if (signal?.aborted) {
      if (isImageBitmap(source)) source.close();
      return { ok: false, reason: "OCR cancelled" };
    }

    // ── 5. Lazy-load Tesseract.js and create worker ────────────
    const { createWorker, PSM } = await import("tesseract.js");

    const worker = await createWorker(TESSERACT_LANG, TESSERACT_OEM, {
      ...(onProgress
        ? {
            logger: (m: { status: string; progress: number }) => {
              if (m.status === "recognizing text") {
                onProgress({
                  status:   m.status,
                  progress: Math.round(m.progress * 100),
                });
              } else {
                onProgress({ status: m.status, progress: -1 });
              }
            },
          }
        : {}),
    });

    // Set page segmentation mode
    await worker.setParameters({
      tessedit_pageseg_mode: TESSERACT_PSM ?? PSM.AUTO,
    });

    // Wire abort → terminate
    let abortHandler: (() => void) | undefined;
    if (signal) {
      abortHandler = () => { void worker.terminate(); };
      signal.addEventListener("abort", abortHandler);
    }

    // ── 6. Race recognize vs timeout ───────────────────────────
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("OCR_TIMEOUT")),
        timeoutMs,
      );
    });

    try {
      const { data: { text } } = await Promise.race([
        worker.recognize(source as Parameters<typeof worker.recognize>[0]),
        timeoutPromise,
      ]);
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortHandler!);
      await worker.terminate();

      if (isImageBitmap(source)) source.close();

      return { ok: true, text: text.trim(), ...(warnings.length ? { warnings } : {}) };
    } catch (err) {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortHandler!);
      await worker.terminate().catch(() => {});
      if (isImageBitmap(source)) source.close();
      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg === "OCR_TIMEOUT") {
      return {
        ok: false,
        reason: `OCR timed out after ${Math.round(timeoutMs / 1000)} s — try a smaller or simpler image`,
      };
    }

    if (signal?.aborted || msg.toLowerCase().includes("terminat")) {
      return { ok: false, reason: "OCR cancelled" };
    }

    return { ok: false, reason: `OCR error: ${msg}` };
  }
}
