/**
 * ShareCard (T029) — renders a privacy-safe Exposure Score card to a PNG.
 *
 * AC-D4: The card must contain zero PII detectable by the scan engine.
 *   - Only `ShareCardProps` values are rendered (numeric score, counts, safe URL).
 *   - No user-supplied filenames, emails, names, or any other PII appear.
 *   - `cardTextLines()` (pure) returns exactly what the card displays — tests
 *     scan this text with all active detectors and assert zero findings.
 *
 * Canvas dimensions: 600 × 380 px (Twitter/LinkedIn share-card friendly).
 * No external dependencies — Canvas 2D API only.
 */
import { signal } from "@preact/signals";
import type { ShareCardProps } from "~/detectors/types";
import { scoreTier } from "~/core/exposure-score";
import { Button } from "../ui";

/* ── Card layout constants ────────────────────────────────────── */

const CARD_W = 600;
const CARD_H = 380;

const TIER_LABEL: Record<string, string> = {
  good:   "Good",
  ok:     "OK",
  risk:   "At Risk",
  danger: "High Risk",
};

const TIER_BG: Record<string, string> = {
  good:   "#1a5c28",  // deep green
  ok:     "#705200",  // deep amber
  risk:   "#a33600",  // deep orange
  danger: "#7a0000",  // deep red
};

/* ── Pure text extractor ─────────────────────────────────────── */

/**
 * Returns the text lines that appear on the rendered share card.
 *
 * This is a pure function used by:
 *   (a) Tests — to verify AC-D4 (zero PII in card content).
 *   (b) Optionally, the canvas renderer — to derive text positions.
 *
 * IMPORTANT: Every element here must be provably PII-free:
 *   - "ShieldMe"     — static brand string
 *   - "Exposure Score" — static label
 *   - score value    — a number 0..100
 *   - tier label     — one of "Good" / "OK" / "At Risk" / "High Risk"
 *   - criticalCount  — a non-negative integer
 *   - warningCount   — a non-negative integer
 *   - url            — always the app URL ("https://shieldme.app"), never user input
 */
export function cardTextLines(props: ShareCardProps): string[] {
  const tier = scoreTier(props.score);
  const tierLabel = TIER_LABEL[tier] ?? tier;
  return [
    "ShieldMe",
    "Exposure Score",
    String(props.score),
    tierLabel,
    String(props.criticalCount) + " critical",
    String(props.warningCount) + " warnings",
    props.url,
  ];
}

/* ── Canvas renderer ─────────────────────────────────────────── */

/**
 * Draws the share card onto `canvas`.
 *
 * Width and height are set unconditionally (even in environments where the
 * 2D context is unavailable, e.g. jsdom) so callers can always read those
 * dimensions.  All drawing operations are guarded by the null-context check.
 */
export function renderToCanvas(
  props: ShareCardProps,
  canvas: HTMLCanvasElement,
): void {
  // Set dimensions first — this is observable even when ctx is null (jsdom).
  canvas.width  = CARD_W;
  canvas.height = CARD_H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return; // jsdom or headless env — dimensions set, no drawing

  const tier      = scoreTier(props.score);
  const bg        = TIER_BG[tier] ?? "#333333";
  const tierLabel = TIER_LABEL[tier] ?? tier;
  const lines     = cardTextLines(props);

  // ── Background ──────────────────────────────────────────────
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // ── Subtle inner border ──────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth   = 2;
  ctx.strokeRect(12, 12, CARD_W - 24, CARD_H - 24);

  // ── App name (top-left) ──────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font      = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(lines[0]!, 36, 58);   // "ShieldMe"

  // ── Tier badge (top-right) ───────────────────────────────────
  const badgeX = CARD_W - 36 - 88;
  const badgeY = 36;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, 88, 32, 8);
    ctx.fill();
  } else {
    ctx.fillRect(badgeX, badgeY, 88, 32);
  }
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font      = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(tierLabel, CARD_W - 44, badgeY + 21);

  // ── "Exposure Score" label ───────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font      = "18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(lines[1]!, CARD_W / 2, 148);  // "Exposure Score"

  // ── Large score number ───────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.font      = "bold 120px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(lines[2]!, CARD_W / 2, 272);  // score string

  // ── Finding counts ───────────────────────────────────────────
  const countText = `${lines[4]!}  ·  ${lines[5]!}`;
  ctx.fillStyle   = "rgba(255,255,255,0.6)";
  ctx.font        = "16px system-ui, sans-serif";
  ctx.textAlign   = "center";
  ctx.fillText(countText, CARD_W / 2, 316);

  // ── URL footer ───────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.font      = "13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(lines[6]!, CARD_W / 2, 354);  // URL
}

/* ── Download / Share helpers ────────────────────────────────── */

function triggerPngDownload(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, "image/png");
}

async function shareCard(props: ShareCardProps): Promise<void> {
  const canvas = document.createElement("canvas");
  renderToCanvas(props, canvas);
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error("toBlob failed")); return; }
      const file = new File([blob], "shieldme-score.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], title: "My ShieldMe Exposure Score" });
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }, "image/png");
  });
}

/* ── Component ───────────────────────────────────────────────── */

type DlState = "idle" | "busy" | "done" | "error";
const dlState = signal<DlState>("idle");

export interface ShareCardComponentProps {
  summary: ShareCardProps | null;
}

function doDownload(props: ShareCardProps): void {
  dlState.value = "busy";
  try {
    const canvas = document.createElement("canvas");
    renderToCanvas(props, canvas);
    triggerPngDownload(canvas, "shieldme-score.png");
    dlState.value = "done";
  } catch {
    dlState.value = "error";
  }
}

async function doShare(props: ShareCardProps): Promise<void> {
  if (typeof navigator === "undefined" || !("share" in navigator)) {
    doDownload(props);
    return;
  }
  dlState.value = "busy";
  try {
    await shareCard(props);
    dlState.value = "done";
  } catch {
    // Web Share was cancelled or failed — fall back to download
    doDownload(props);
  }
}

export default function ShareCard({ summary }: ShareCardComponentProps) {
  if (!summary) {
    return (
      <p class="sm-caption">
        Run a scan to generate a shareable score card.
      </p>
    );
  }

  const state = dlState.value;
  const busy  = state === "busy";

  return (
    <div class="sm-card" style={{ textAlign: "center", padding: "16px" }}>
      <p class="sm-section-title" style={{ marginBottom: "8px" }}>
        Share your score
      </p>
      <p class="sm-caption" style={{ marginBottom: "16px" }}>
        Saves a privacy-safe PNG — only your score, no personal data.
      </p>

      <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
        <Button
          onClick={() => doDownload(summary)}
          disabled={busy}
          aria-label="Download score card as PNG"
        >
          {busy ? "Generating…" : "⬇ Download PNG"}
        </Button>

        {typeof navigator !== "undefined" && "share" in navigator ? (
          <Button
            variant="ghost"
            onClick={() => { void doShare(summary); }}
            disabled={busy}
            aria-label="Share score card"
          >
            ↗ Share
          </Button>
        ) : null}
      </div>

      {state === "done" && (
        <p class="sm-caption" style={{ marginTop: "8px", color: "var(--sm-success, #1e8e3e)" }}>
          Done! Your score card has been saved.
        </p>
      )}
      {state === "error" && (
        <p class="sm-caption" style={{ marginTop: "8px", color: "var(--sm-danger, #c5221f)" }}>
          Could not generate card — please try again.
        </p>
      )}
    </div>
  );
}
