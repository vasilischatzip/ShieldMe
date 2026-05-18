/**
 * ExportReport component — "Export PDF" button + tier-aware report generation.
 *
 * Renders a small card with an "Export PDF" button. On click it:
 *   1. Checks TierGate for export:full-report.
 *   2. Lazy-imports jsPDF via buildReport().
 *   3. Triggers a browser download of the generated PDF.
 *
 * Free tier  → 1-page summary PDF (gated from full report).
 * Premium    → full multi-page findings report.
 *
 * Designed to be embedded within the Scan route results panel, below FindingsList.
 */
import { signal } from "@preact/signals";
import { Button } from "../ui";
import { tierGate } from "~/core/tier-gate";
import { buildReport } from "~/core/export-report";
import type { LastScanSummary } from "~/app/state/last-scan";
import type { Finding } from "~/detectors/types";

/* ── Local UI state ─────────────────────────────────────────── */

type ExportState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "done"; filename: string }
  | { kind: "error"; message: string };

const exportState = signal<ExportState>({ kind: "idle" });

/* ── Download helper ─────────────────────────────────────────── */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the download starts before cleanup
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Handler ─────────────────────────────────────────────────── */

async function handleExport(
  summary: LastScanSummary,
  findings: Finding[],
): Promise<void> {
  exportState.value = { kind: "generating" };
  try {
    // Determine tier: free users get a summary PDF; premium gets full report
    const gateResult = await tierGate.check("export:full-report");
    const tier = gateResult.allowed ? "premium" : "free";

    const output = await buildReport({ summary, findings, tier });
    triggerDownload(output.blob, output.filename);
    exportState.value = { kind: "done", filename: output.filename };
  } catch (err) {
    exportState.value = {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ── Component ───────────────────────────────────────────────── */

export interface ExportReportProps {
  summary: LastScanSummary;
  findings: Finding[];
}

export default function ExportReport({ summary, findings }: ExportReportProps) {
  const state = exportState.value;
  const isGenerating = state.kind === "generating";

  return (
    <div
      class="sm-card"
      style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px" }}
    >
      <div style={{ flex: 1 }}>
        <p class="sm-row__title" style={{ margin: 0 }}>Export PDF</p>
        <p class="sm-caption" style={{ margin: 0 }}>
          {state.kind === "done"
            ? `Downloaded: ${state.filename}`
            : state.kind === "error"
              ? `Error: ${state.message}`
              : "Save a copy of your scan results"}
        </p>
      </div>

      <Button
        variant="ghost"
        disabled={isGenerating}
        aria-label="Export scan results as PDF"
        onClick={() => void handleExport(summary, findings)}
      >
        {isGenerating ? "Generating…" : "Export PDF"}
      </Button>
    </div>
  );
}
