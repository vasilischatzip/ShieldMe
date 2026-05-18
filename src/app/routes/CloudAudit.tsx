/**
 * Drive Audit popup route — T041.
 *
 * UI for the Google Drive audit feature.
 *
 * States:
 *   idle        — never connected / audit never run
 *   connecting  — OAuth in progress
 *   listing     — files.list pages arriving (shows "Found N files…")
 *   scanning    — content scan in progress (shows per-file progress bar)
 *   results     — audit complete, cached results displayed
 *   error       — auth or network error
 *
 * Free tier:
 *   Top 100 exposed files scanned; "Upgrade for full audit" notice shown when capped.
 *
 * Privacy: all scan results are IDB-local; no network calls except Drive API + scan itself.
 */
import { signal, computed } from "@preact/signals";
import { useEffect }        from "preact/hooks";
import { t }                from "~/core/i18n";
import { Header, Card, Button, Badge } from "../ui";
// Badge used for FreeTierNotice premium label
import { createDriveAuditor, type DriveCacheEntry, type AuditSummary } from "~/drive/audit";
import { driveClient, DriveAuthError }                                   from "~/drive/client";
import { exposureLabel }                                                  from "~/drive/permissions";

/* ── Service ─────────────────────────────────────────────────────── */

const auditor = createDriveAuditor({ client: driveClient });

/* ── State ───────────────────────────────────────────────────────── */

type AuditState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "listing";  filesFound: number }
  | { kind: "scanning"; scanned: number; total: number; fileName: string }
  | { kind: "results";  summary: AuditSummary; entries: DriveCacheEntry[] }
  | { kind: "error";    message: string };

const auditState   = signal<AuditState>({ kind: "idle" });
const cacheEntries = signal<DriveCacheEntry[]>([]);

/** Sorted: public first, then external-edit, external-read */
const sortedEntries = computed(() => {
  const levelOrder: Record<string, number> = {
    "public":        0,
    "external-edit": 1,
    "external-read": 2,
    "internal-only": 3,
  };
  return [...cacheEntries.value].sort(
    (a, b) => (levelOrder[a.exposureLevel] ?? 9) - (levelOrder[b.exposureLevel] ?? 9),
  );
});

/* ── Actions ──────────────────────────────────────────────────────── */

async function startAudit(): Promise<void> {
  auditState.value = { kind: "connecting" };

  try {
    // Trigger OAuth interactively
    await driveClient.getToken();
  } catch (err) {
    auditState.value = {
      kind:    "error",
      message: err instanceof DriveAuthError
        ? "Drive access was denied. Grant permission and try again."
        : String(err),
    };
    return;
  }

  try {
    const summary = await auditor.run((phase) => {
      if (phase.phase === "listing") {
        auditState.value = { kind: "listing", filesFound: phase.filesFound };
      } else if (phase.phase === "scanning") {
        auditState.value = {
          kind:     "scanning",
          scanned:  phase.scanned,
          total:    phase.total,
          fileName: phase.fileName,
        };
      }
    });

    const entries = await auditor.loadCache();
    cacheEntries.value = entries.filter(e => e.exposureLevel !== "internal-only");
    auditState.value   = { kind: "results", summary, entries };
  } catch (err) {
    auditState.value = {
      kind:    "error",
      message: String(err),
    };
  }
}

async function resetAudit(): Promise<void> {
  await auditor.reset();
  cacheEntries.value = [];
  auditState.value   = { kind: "idle" };
}

/* ── Component ───────────────────────────────────────────────────── */

export default function Audit() {
  // On mount, check if we have cached results to show
  useEffect(() => {
    if (auditState.value.kind !== "idle") return;
    void auditor.loadCache().then(entries => {
      const exposed = entries.filter(e => e.exposureLevel !== "internal-only");
      if (exposed.length > 0) {
        cacheEntries.value = exposed;
        // Synthesise a minimal summary from cache
        auditState.value = {
          kind:    "results",
          summary: {
            totalFiles:    entries.length,
            exposedFiles:  exposed.length,
            scannedFiles:  exposed.filter(e => !e.skipped).length,
            findingsCount: exposed.reduce((n, e) => n + e.findings.length, 0),
            skippedFiles:  exposed.filter(e => e.skipped).length,
            durationMs:    0,
            capped:        false,
          },
          entries,
        };
      }
    });
  }, []);

  const state = auditState.value;

  return (
    <>
      <Header
        eyebrow={t("nav_audit")}
        title="Google Drive Audit"
        subtitle="Find files that are publicly shared or contain sensitive information."
      />

      {/* ── Idle / connect ──────────────────────────────────────── */}
      {state.kind === "idle" && (
        <Card
          title="🔗 Connect Google Drive"
          desc="ShieldMe will check your files for risky sharing settings. Read-only access only — nothing is uploaded or stored outside your device."
        >
          <Button variant="primary" onClick={() => void startAudit()}>
            Connect Drive &amp; Run Audit
          </Button>
        </Card>
      )}

      {/* ── Connecting ──────────────────────────────────────────── */}
      {state.kind === "connecting" && (
        <Card title="🔐 Requesting Drive access…">
          <p class="sm-card__desc">A permission dialog will appear. Grant read access to continue.</p>
        </Card>
      )}

      {/* ── Listing phase ───────────────────────────────────────── */}
      {state.kind === "listing" && (
        <Card title="📋 Listing your files…">
          <p class="sm-card__desc">Found {state.filesFound.toLocaleString()} files so far…</p>
          <ProgressBar percent={null} />
        </Card>
      )}

      {/* ── Scanning phase ──────────────────────────────────────── */}
      {state.kind === "scanning" && (
        <Card title="🔍 Scanning shared files…">
          <p class="sm-card__desc">
            Checking {state.scanned} / {state.total}
          </p>
          <p class="sm-card__desc" style={{ fontSize: 11, color: "var(--sm-text-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {state.fileName}
          </p>
          <ProgressBar percent={state.total > 0 ? (state.scanned / state.total) * 100 : null} />
        </Card>
      )}

      {/* ── Error ───────────────────────────────────────────────── */}
      {state.kind === "error" && (
        <Card title="⚠️ Audit failed">
          <p class="sm-card__desc">{state.message}</p>
          <Button variant="ghost" onClick={() => { auditState.value = { kind: "idle" }; }}>
            Try again
          </Button>
        </Card>
      )}

      {/* ── Results ─────────────────────────────────────────────── */}
      {state.kind === "results" && (
        <>
          <SummaryCard summary={state.summary} />
          <ResultsList />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Button variant="ghost" onClick={() => void startAudit()}>
              Re-run Audit
            </Button>
            <Button variant="ghost" onClick={() => void resetAudit()}>
              Reset
            </Button>
          </div>
        </>
      )}

      {/* ── Free-tier scope notice (always visible) ──────────────── */}
      <FreeTierNotice />
    </>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */

function SummaryCard({ summary }: { summary: AuditSummary }) {
  const { totalFiles, exposedFiles, findingsCount, capped } = summary;

  return (
    <Card title={`📊 Audit complete${capped ? " (capped)" : ""}`}>
      <div class="sm-stack--sm">
        <SummaryRow label="Files in Drive"    value={totalFiles.toLocaleString()} />
        <SummaryRow label="Exposed files"     value={exposedFiles.toLocaleString()} highlight={exposedFiles > 0} />
        <SummaryRow label="PII findings"      value={findingsCount.toLocaleString()} highlight={findingsCount > 0} />
        {capped && (
          <div style={{ paddingTop: 8 }}>
            <Badge variant="soon">Free plan: top 100 only</Badge>
            <p class="sm-card__desc" style={{ marginTop: 4 }}>
              Upgrade to audit all {totalFiles.toLocaleString()} files.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div class="sm-row" style={{ padding: "4px 0", borderTop: "none" }}>
      <span class="sm-row__title">{label}</span>
      <span
        class="sm-row__badge"
        style={{ color: highlight ? "var(--sm-danger)" : undefined, fontWeight: highlight ? 700 : undefined }}
      >
        {value}
      </span>
    </div>
  );
}

function ResultsList() {
  const entries = sortedEntries.value;
  if (entries.length === 0) {
    return (
      <Card title="✅ No exposed files found">
        <p class="sm-card__desc">All your Drive files are private or internally shared. Great job!</p>
      </Card>
    );
  }

  return (
    <Card title={`🗂 ${entries.length} Exposed File${entries.length !== 1 ? "s" : ""}`}>
      <div class="sm-stack--sm">
        {entries.map(entry => (
          <FileRow key={entry.fileId} entry={entry} />
        ))}
      </div>
    </Card>
  );
}

function ExposurePill({ level }: { level: string }) {
  const colors: Record<string, { bg: string; color: string; text: string }> = {
    "public":        { bg: "#fce8e8", color: "#c62828", text: "Public" },
    "external-edit": { bg: "#fff3e0", color: "#e65100", text: "Ext. Edit" },
    "external-read": { bg: "#e3f2fd", color: "#1565c0", text: "Ext. View" },
    "internal-only": { bg: "#e8f5e9", color: "#2e7d32", text: "Private" },
  };
  const style = colors[level] ?? { bg: "#f5f5f5", color: "#555", text: level };
  return (
    <span style={{ background: style.bg, color: style.color, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>
      {style.text}
    </span>
  );
}

function FileRow({ entry }: { entry: DriveCacheEntry }) {
  const label    = exposureLabel(entry.exposureLevel);

  return (
    <div class="sm-row" style={{ paddingTop: 8, paddingBottom: 8 }}>
      <div class="sm-row__body" style={{ overflow: "hidden" }}>
        <span
          class="sm-row__title"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
          title={entry.fileName}
        >
          {entry.fileName}
        </span>
        <span class="sm-row__desc">{label}</span>
        {entry.findings.length > 0 && (
          <span class="sm-row__desc" style={{ color: "var(--sm-danger)" }}>
            {entry.findings.length} PII finding{entry.findings.length !== 1 ? "s" : ""}
          </span>
        )}
        {entry.externalDomains.length > 0 && (
          <span class="sm-row__desc" style={{ fontSize: 11 }}>
            Shared with: {entry.externalDomains.slice(0, 3).join(", ")}
            {entry.externalDomains.length > 3 ? ` +${entry.externalDomains.length - 3} more` : ""}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <ExposurePill level={entry.exposureLevel} />
        {entry.webViewLink && (
          <a
            href={entry.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--sm-primary)", textDecoration: "none" }}
            aria-label={`Open ${entry.fileName} in Drive`}
          >
            Open ↗
          </a>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number | null }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={percent ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Audit progress"
      style={{
        height:       6,
        background:   "var(--sm-border)",
        borderRadius: 3,
        marginTop:    8,
        overflow:     "hidden",
      }}
    >
      <div
        style={{
          height:     "100%",
          width:      percent !== null ? `${percent}%` : "30%",
          background: "var(--sm-primary)",
          borderRadius: 3,
          transition:   "width 0.3s ease",
          animation:    percent === null ? "sm-indeterminate 1.4s ease infinite" : undefined,
        }}
      />
    </div>
  );
}

function FreeTierNotice() {
  return (
    <div class="sm-card" style={{ background: "var(--sm-bg-subtle)", marginTop: 8 }}>
      <p class="sm-section-title">Free plan scope</p>
      <div class="sm-stack--sm">
        <div class="sm-row" style={{ padding: "4px 0", borderTop: "none" }}>
          <div class="sm-row__body">
            <span class="sm-row__title">Files scanned</span>
            <span class="sm-row__desc">Top 100 most-exposed files</span>
          </div>
        </div>
        <div class="sm-row" style={{ padding: "4px 0", borderTop: "1px solid var(--sm-border)" }}>
          <div class="sm-row__body">
            <span class="sm-row__title">View findings</span>
            <span class="sm-row__desc">All findings shown</span>
          </div>
        </div>
        <div class="sm-row" style={{ padding: "4px 0", borderTop: "1px solid var(--sm-border)" }}>
          <div class="sm-row__body">
            <span class="sm-row__title">Fix access (revoke / restrict)</span>
          </div>
          <Badge variant="soon">Premium</Badge>
        </div>
      </div>
    </div>
  );
}
