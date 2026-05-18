/**
 * Scan route — paste-or-drop scanning with live findings.
 *
 * Two input modes:
 *   1. Paste text     → instant scan via ScanEngine.
 *   2. Upload file    → parseFile() then scan. Text-like formats supported in MVP;
 *                       PDF/DOCX/images surface a clear "supported soon" message.
 *
 * Privacy:
 *   - All work is in-process. Nothing leaves the device.
 *   - We never persist the raw scanned text. Findings live in a Preact signal
 *     for the lifetime of the popup window.
 */
import { signal, computed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { t } from "~/core/i18n";
import { Header, Button, Field } from "../ui";
import { scanText } from "~/core/scan-engine";
import { parseFile, DEFAULT_MAX_BYTES, type ParseError } from "~/parsers/dispatch";
import { loadRules, rulesState } from "~/core/rules";
import { getCurrentLocale } from "~/core/i18n";
import { exposureBreakdown } from "~/core/exposure-score";
import type { Finding } from "~/detectors/types";
import FindingsList from "../components/FindingsList";
import ExportReport from "../components/ExportReport";
import ShareCard from "../components/ShareCard";
import { lastScanSummary } from "../state/last-scan";

/* ── Local UI state ─────────────────────────────────────────── */

type Status =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "done"; findings: Finding[]; score: number; durationMs: number; sourceLabel: string }
  | { kind: "error"; message: string };

const status      = signal<Status>({ kind: "idle" });
const inputText   = signal<string>("");
const lastSource  = signal<string>("Pasted text");

const charCount = computed(() => inputText.value.length);

/* ── Helpers ────────────────────────────────────────────────── */

function describeParseError(e: ParseError): string {
  switch (e.kind) {
    case "too-large":
      return `That file is ${(e.sizeBytes / 1024 / 1024).toFixed(1)} MB. The free plan caps file scans at ${(e.limitBytes / 1024 / 1024).toFixed(0)} MB.`;
    case "unsupported-format":
      return `${e.ext.toUpperCase() || "That file type"} isn't supported yet — paste the text directly for now, or try TXT, CSV, MD, JSON, PDF, DOCX, XLSX, or image files.`;
    case "decode-failed":
      return `We couldn't read that file. ${e.detail}`;
  }
}

async function runScan(text: string, sourceLabel: string): Promise<void> {
  if (!text.trim()) return;
  status.value = { kind: "scanning" };
  try {
    // Make sure rules are loaded before scanning
    if (!rulesState.value.categories) await loadRules();
    const result = await scanText(text, rulesState.value, {
      locale: getCurrentLocale(),
    });
    status.value = {
      kind:        "done",
      findings:    result.findings,
      score:       result.score,
      durationMs:  result.durationMs,
      sourceLabel,
    };
    lastSource.value = sourceLabel;
    const breakdown = exposureBreakdown(result.findings);
    lastScanSummary.value = {
      score:         result.score,
      totalFindings: breakdown.totalFindings,
      critical:      breakdown.bySeverity.critical,
      warning:       breakdown.bySeverity.warning,
      info:          breakdown.bySeverity.info,
      byCategory:    breakdown.byCategory,
      sourceLabel,
      durationMs:    result.durationMs,
      at:            Date.now(),
    };

    // Web-app variant (post-pivot 2026-05-17): no toolbar badge.
    // Score is reflected in the SPA chrome via signals — no postMessage.
    void result.score;
  } catch (err) {
    status.value = { kind: "error", message: String(err) };
  }
}

async function handleFileChosen(file: File): Promise<void> {
  const parsed = await parseFile(file);
  if (!parsed.ok) {
    status.value = { kind: "error", message: describeParseError(parsed.reason) };
    return;
  }
  await runScan(parsed.text, file.name);
}

/* ── Popup detection (web-app stubs) ─────────────────────────── */
/* Removed during 2026-05-17 web-app pivot. The popup-vs-tab workaround
 * was only needed in MV3 context. SPA is always full-page. */
function isPopupContext(): boolean { return false; }
function openInTab(): void { /* no-op */ }

/* ── Subcomponents ──────────────────────────────────────────── */

function ScanPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inPopup = isPopupContext();

  useEffect(() => {
    loadRules();
    // If opened in a tab via the #scan hash, navigate to scan route
    if (window.location.hash === "#scan") {
      // Already on scan — no-op, but clear hash to avoid confusion
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  function onPickFile(): void {
    if (inPopup) {
      // Popup will close when the file picker opens, so open in a tab instead
      openInTab();
      return;
    }
    fileInputRef.current?.click();
  }

  async function onFileChange(e: Event): Promise<void> {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = "";
    if (file) await handleFileChosen(file);
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFileChosen(file);
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
  }

  function onScanText(): void {
    void runScan(inputText.value, "Pasted text");
  }

  function clear(): void {
    inputText.value = "";
    status.value = { kind: "idle" };
  }

  const isScanning = status.value.kind === "scanning";

  return (
    <>
      {/* Drop / browse zone */}
      <div
        class="sm-dropzone"
        role="button"
        tabIndex={0}
        aria-label={t("scan_dropPrompt")}
        onClick={onPickFile}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPickFile();
          }
        }}
      >
        <span class="sm-dropzone__icon" aria-hidden="true">📄</span>
        {t("scan_dropPrompt")}
        <br />
        <span class="sm-caption" style={{ marginTop: "4px", display: "block" }}>
          TXT · CSV · MD · JSON · PDF · DOCX · XLSX · Images
        </span>
        {inPopup && (
          <span class="sm-caption" style={{ marginTop: "2px", display: "block", opacity: 0.7 }}>
            Opens in a new tab for file browsing
          </span>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.csv,.tsv,.md,.json,.log,.yaml,.yml,.xml,.html,.htm,.ini,.conf,.env,.rtf,.pdf,.docx,.doc,.xlsx,.xls,.ods,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tiff,.tif,.avif,text/plain,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,image/*"
        style={{ display: "none" }}
        onChange={onFileChange}
        aria-hidden="true"
      />

      {/* Paste textarea */}
      <Field label="Or paste text to check">
        <textarea
          class="sm-input"
          aria-label="Paste text to scan"
          rows={6}
          placeholder="Paste an email, a chat message, code, or any text…"
          value={inputText.value}
          onInput={(e) => { inputText.value = (e.target as HTMLTextAreaElement).value; }}
          style={{ resize: "vertical", minHeight: "120px", fontFamily: "var(--sm-mono, monospace)" }}
        />
      </Field>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
        <span class="sm-caption">{charCount.value.toLocaleString()} characters</span>
        <div style={{ display: "flex", gap: "8px" }}>
          {inputText.value.length > 0 ? (
            <Button variant="ghost" onClick={clear}>Clear</Button>
          ) : null}
          <Button
            variant="primary"
            onClick={onScanText}
            disabled={isScanning || charCount.value === 0}
            aria-label="Scan pasted text"
          >
            {isScanning ? t("scan_scanning") : "Scan now"}
          </Button>
        </div>
      </div>
    </>
  );
}

function ResultPanel() {
  const s = status.value;
  if (s.kind === "idle") return null;

  if (s.kind === "scanning") {
    return (
      <div class="sm-card" role="status" aria-live="polite">
        <p class="sm-section-title" style={{ margin: 0 }}>{t("scan_scanning")}</p>
        <p class="sm-caption">Running active protections in your browser…</p>
      </div>
    );
  }

  if (s.kind === "error") {
    return (
      <div class="sm-card" role="alert" style={{ borderColor: "var(--sm-danger)" }}>
        <p class="sm-section-title" style={{ margin: 0, color: "var(--sm-danger)" }}>
          ⚠️ Couldn't scan
        </p>
        <p class="sm-caption">{s.message}</p>
      </div>
    );
  }

  // done
  return (
    <>
      <div class="sm-card" style={{ background: "var(--sm-bg-subtle)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <p class="sm-section-title" style={{ margin: 0 }}>
            {t("scan_done")}
          </p>
          <span class="sm-caption">{s.durationMs} ms</span>
        </div>
        <p class="sm-caption" style={{ margin: 0 }}>
          Source: {s.sourceLabel} · Exposure score {s.score}/100
        </p>
      </div>
      <FindingsList
        findings={s.findings}
        onClear={() => { status.value = { kind: "idle" }; }}
      />
      {lastScanSummary.value && (
        <ExportReport
          summary={lastScanSummary.value}
          findings={s.findings}
        />
      )}
      {lastScanSummary.value && (
        <ShareCard
          summary={{
            score:         lastScanSummary.value.score,
            criticalCount: lastScanSummary.value.critical,
            warningCount:  lastScanSummary.value.warning,
            url:           "https://shieldme.app",
          }}
        />
      )}
    </>
  );
}

function LimitsCard() {
  return (
    <div class="sm-card" style={{ background: "var(--sm-bg-subtle)" }}>
      <p class="sm-section-title">Free plan limits</p>
      <div class="sm-stack--sm">
        <div class="sm-row" style={{ padding: 0, borderTop: "none" }}>
          <div class="sm-row__body">
            <span class="sm-row__title">Max file size</span>
          </div>
          <span class="sm-caption">{(DEFAULT_MAX_BYTES / 1024 / 1024).toFixed(0)} MB</span>
        </div>
        <div class="sm-row" style={{ padding: 0, borderTop: "1px solid var(--sm-border)" }}>
          <div class="sm-row__body">
            <span class="sm-row__title">Scans per month</span>
          </div>
          <span class="sm-caption">5</span>
        </div>
      </div>
    </div>
  );
}

/* ── Route ──────────────────────────────────────────────────── */

export default function Scan() {
  return (
    <>
      <Header
        eyebrow={t("nav_scan")}
        title="Check a file or paste text"
        subtitle={t("scan_privacy")}
      />
      <ScanPanel />
      <ResultPanel />
      {status.value.kind === "idle" ? <LimitsCard /> : null}
    </>
  );
}

/** Test/diagnostic export. */
export const _scanState = { status, inputText, runScan };
