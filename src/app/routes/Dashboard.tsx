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
import { link } from "../base";

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

      {/* ── 2-column: hero (left) + quick actions (right) ─── */}
      <div class="sm-dashboard-grid">

        {/* Left: hero score card */}
        <div
          class="sm-hero"
          role="status"
          aria-label={`Exposure score: ${hero.label}`}
        >
          {hasScore ? (
            <ExposureGauge score={hero.score} size={160} strokeWidth={10} />
          ) : (
            <div style={{ width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg
                aria-hidden="true"
                focusable="false"
                width={160} height={160} viewBox="0 0 160 160"
              >
                <circle
                  cx={80} cy={80} r={74}
                  strokeWidth={10} fill="none"
                  stroke="var(--sm-border-strong)"
                />
              </svg>
            </div>
          )}
          <div class="sm-hero__info">
            <div class="sm-hero__score">{hero.label}</div>
            <div class="sm-hero__label">
              {hasScore ? tierLabel(hero.score) : "No scan yet"}
            </div>
            <p class="sm-hero__caption">{hero.caption}</p>
            {/* Inline stats when last scan exists */}
            {last && (
              <div class="sm-stats" role="region" aria-label="Scan summary" style={{ marginTop: 20 }}>
                <div class="sm-stat">
                  <div class="sm-stat__value" style={{ color: "var(--sm-danger)" }}>{last.critical}</div>
                  <div class="sm-stat__label">Critical</div>
                </div>
                <div class="sm-stat">
                  <div class="sm-stat__value" style={{ color: "var(--sm-warning)" }}>{last.warning}</div>
                  <div class="sm-stat__label">Warning</div>
                </div>
                <div class="sm-stat">
                  <div class="sm-stat__value" style={{ color: "var(--sm-accent)" }}>{last.info}</div>
                  <div class="sm-stat__label">Info</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: quick actions */}
        <div class="sm-stack">
          <button
            type="button"
            class="sm-action-card"
            onClick={() => { window.location.href = link("/scan"); }}
          >
            <div class="sm-action-card__icon sm-action-card__icon--brand" aria-hidden="true">
              <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
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
            onClick={() => { window.location.href = link("/cloud"); }}
          >
            <div class="sm-action-card__icon sm-action-card__icon--success" aria-hidden="true">
              <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
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
            onClick={() => { window.location.href = link("/radar"); }}
          >
            <div class="sm-action-card__icon sm-action-card__icon--warning" aria-hidden="true">
              <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" /><path d="M4 6h.01" /><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" /><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" /><path d="M12 18h.01" /><circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <div class="sm-action-card__body">
              <div class="sm-action-card__title">Check for breaches</div>
              <div class="sm-action-card__desc">Find out if your data has appeared in a known breach.</div>
            </div>
            <span class="sm-action-card__arrow" aria-hidden="true"><ArrowRight /></span>
          </button>

          <button
            type="button"
            class="sm-action-card"
            onClick={() => { window.location.href = link("/email"); }}
          >
            <div class="sm-action-card__icon sm-action-card__icon--brand" aria-hidden="true">
              <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <div class="sm-action-card__body">
              <div class="sm-action-card__title">Scan an email</div>
              <div class="sm-action-card__desc">Paste or upload an .eml file to check for exposure.</div>
            </div>
            <span class="sm-action-card__arrow" aria-hidden="true"><ArrowRight /></span>
          </button>
        </div>

      </div>

      {/* ── Open-source note ────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "16px 20px",
          background: "var(--sm-surface)",
          border: "1px solid var(--sm-border)",
          borderRadius: "var(--sm-radius-lg)",
        }}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sm-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span style={{ fontSize: "var(--sm-fs-sm)", color: "var(--sm-text-muted)" }}>
          Free &amp; open-source — MIT licensed. All scanning happens in your browser.{" "}
          <a href="https://github.com/vasilischatzip/ShieldMe" target="_blank" rel="noopener noreferrer">View source</a>
        </span>
        <span style={{ marginLeft: "auto", flexShrink: 0 }}><Badge variant="free">Free</Badge></span>
      </div>
    </>
  );
}
