/**
 * Dashboard — modern, clean first impression. Renders:
 *   - Centered exposure score with animated gauge ring
 *   - Quick-stat pills (critical / warning / info)
 *   - Action cards with icons for Scan / Audit / Radar
 *   - Plan badge
 */
import { computed } from "@preact/signals";
import { Header, Badge } from "../ui";
import { lastScanSummary } from "../state/last-scan";
import { scoreTier } from "~/core/exposure-score";
import ExposureGauge, { tierLabel } from "../components/ExposureGauge";

const heroState = computed(() => {
  const s = lastScanSummary.value;
  if (!s) {
    return {
      score:   -1,
      label:   "—",
      caption: "Scan a file or paste text to calculate your score.",
      tier:    "none" as const,
    };
  }
  const tier = scoreTier(s.score);
  const what = s.totalFindings === 0
    ? "Nothing sensitive detected."
    : `${s.totalFindings} item${s.totalFindings === 1 ? "" : "s"} found`;
  return {
    score:   s.score,
    label:   String(s.score),
    caption: `${what} · ${s.sourceLabel}`,
    tier,
  };
});

/* ── Arrow icon for action cards ──────────────────────────── */
function ArrowRight() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    >
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export default function Dashboard() {
  const hero = heroState.value;
  const last = lastScanSummary.value;
  const hasScore = hero.score >= 0;

  return (
    <>
      <Header
        eyebrow="Overview"
        title="Your exposure score"
        subtitle="How much of your sensitive data is at risk."
      />

      {/* ── Hero with centered gauge ─────────────────────────── */}
      <div
        class="sm-hero"
        role="status"
        aria-label={`Exposure score: ${hero.label}`}
      >
        {hasScore ? (
          <ExposureGauge score={hero.score} size={120} strokeWidth={8} />
        ) : (
          <div class="sm-hero__gauge" style={{ width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg
              aria-hidden="true"
              focusable="false"
              width={120} height={120} viewBox="0 0 120 120" class="sm-score-ring"
            >
              <circle class="sm-score-ring__bg" cx={60} cy={60} r={56} strokeWidth={8} fill="none" />
            </svg>
          </div>
        )}
        <div class="sm-hero__info">
          <div class="sm-hero__score">{hero.label}</div>
          <div class="sm-hero__label">
            {hasScore ? tierLabel(hero.score) : "No scan yet"}
          </div>
          <p class="sm-hero__caption">{hero.caption}</p>
        </div>
      </div>

      {/* ── Quick stats ─────────────────────────────────────── */}
      {last && (
        <div class="sm-stats" role="region" aria-label="Scan summary">
          <div class="sm-stat">
            <div class="sm-stat__value" style={{ color: "var(--sm-danger)" }}>
              {last.critical}
            </div>
            <div class="sm-stat__label">Critical</div>
          </div>
          <div class="sm-stat">
            <div class="sm-stat__value" style={{ color: "var(--sm-warning)" }}>
              {last.warning}
            </div>
            <div class="sm-stat__label">Warning</div>
          </div>
          <div class="sm-stat">
            <div class="sm-stat__value" style={{ color: "var(--sm-accent)" }}>
              {last.info}
            </div>
            <div class="sm-stat__label">Info</div>
          </div>
        </div>
      )}

      {/* ── Quick actions ───────────────────────────────────── */}
      <div class="sm-stack">
        {/* Use <button> not div[role=button] — native semantics for screen readers */}
        <button
          type="button"
          class="sm-action-card"
          onClick={() => { window.location.href = "/scan"; }}
        >
          <div class="sm-action-card__icon sm-action-card__icon--brand" aria-hidden="true">
            <svg
              aria-hidden="true"
              focusable="false"
              width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6" /><path d="M8 11h6" />
            </svg>
          </div>
          <div class="sm-action-card__body">
            <div class="sm-action-card__title">Scan a file or text</div>
            <div class="sm-action-card__desc">Drop a document or paste text to check for sensitive data.</div>
          </div>
          <span class="sm-action-card__arrow" aria-hidden="true"><ArrowRight /></span>
        </button>

        <button
          type="button"
          class="sm-action-card"
          onClick={() => { window.location.href = "/cloud"; }}
        >
          <div class="sm-action-card__icon sm-action-card__icon--success" aria-hidden="true">
            <svg
              aria-hidden="true"
              focusable="false"
              width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
            >
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
          </div>
          <div class="sm-action-card__body">
            <div class="sm-action-card__title">Audit Google Drive</div>
            <div class="sm-action-card__desc">Check which files are public and could expose you.</div>
          </div>
          <span class="sm-action-card__arrow" aria-hidden="true"><ArrowRight /></span>
        </button>

        <button
          type="button"
          class="sm-action-card"
          onClick={() => { window.location.href = "/radar"; }}
        >
          <div class="sm-action-card__icon sm-action-card__icon--warning" aria-hidden="true">
            <svg
              aria-hidden="true"
              focusable="false"
              width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
            >
              <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" /><path d="M4 6h.01" /><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" /><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" /><path d="M12 18h.01" /><circle cx="12" cy="12" r="2" />
            </svg>
          </div>
          <div class="sm-action-card__body">
            <div class="sm-action-card__title">Check for breaches</div>
            <div class="sm-action-card__desc">Find out if your data has appeared in a known breach.</div>
          </div>
          <span class="sm-action-card__arrow" aria-hidden="true"><ArrowRight /></span>
        </button>
      </div>

      {/* ── Plan badge ──────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--sm-space-3) var(--sm-space-4)",
          background: "var(--sm-surface)",
          border: "1px solid var(--sm-border)",
          borderRadius: "var(--sm-radius-lg)",
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: "var(--sm-fs-md)" }}>Free plan</span>
          <span class="sm-caption" style={{ marginLeft: "8px" }}>5 scans/month &middot; 10 MB max</span>
        </div>
        <Badge variant="free">Free</Badge>
      </div>
    </>
  );
}
