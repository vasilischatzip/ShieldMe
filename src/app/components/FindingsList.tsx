/**
 * FindingsList — group + render Findings safely for popup display.
 *
 * Critical privacy invariant: NEVER render `match.value` (the raw secret).
 * Only render `contextSnippet` (which already redacts the value with •••)
 * and the detector label.
 */
import type { Finding } from "~/detectors/types";
import { CATEGORIES, type CategoryId } from "~/core/rules";
import { t } from "~/core/i18n";

const SEVERITY_LABEL = {
  critical: { key: "scan_critical", color: "var(--sm-danger)" },
  warning:  { key: "scan_warning",  color: "var(--sm-warning, #b07b00)" },
  info:     { key: "scan_warning",  color: "var(--sm-text-subtle)" },
} as const;

function categoryMeta(catId: CategoryId): { label: string; icon: string } {
  const cat = CATEGORIES.find((c) => c.id === catId);
  if (!cat) return { label: catId, icon: "•" };
  return { label: t(cat.labelKey), icon: cat.icon };
}

function detectorLabel(detectorId: string): string {
  for (const cat of CATEGORIES) {
    const det = cat.detectors.find((d) => d.id === detectorId);
    if (det) return t(det.labelKey);
  }
  return detectorId;
}

interface Props {
  findings: readonly Finding[];
  onClear?: () => void;
}

export default function FindingsList({ findings, onClear }: Props) {
  if (findings.length === 0) {
    return (
      <div class="sm-card" role="status" aria-live="polite">
        <p class="sm-section-title" style={{ marginBottom: "4px" }}>
          ✅ {t("scan_noFindings")}
        </p>
        <p class="sm-caption" style={{ margin: 0 }}>
          Nothing the active protections recognised. You can adjust which categories
          are watched in Settings.
        </p>
      </div>
    );
  }

  // Group by category for scannability
  const groups = new Map<CategoryId, Finding[]>();
  for (const f of findings) {
    const arr = groups.get(f.categoryId) ?? [];
    arr.push(f);
    groups.set(f.categoryId, arr);
  }

  // Stable ordering: categories in CATEGORIES order
  const ordered: Array<[CategoryId, Finding[]]> = [];
  for (const cat of CATEGORIES) {
    const arr = groups.get(cat.id);
    if (arr && arr.length > 0) ordered.push([cat.id, arr]);
  }

  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning:  findings.filter((f) => f.severity === "warning").length,
    info:     findings.filter((f) => f.severity === "info").length,
  };

  return (
    <section aria-label="Scan findings" class="sm-stack--sm">
      <div
        class="sm-card"
        style={{
          background: "var(--sm-bg-subtle)",
          display:    "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap:        "8px",
        }}
      >
        <div>
          <p class="sm-section-title" style={{ margin: 0 }}>
            Found {findings.length} item{findings.length === 1 ? "" : "s"}
          </p>
          <p class="sm-caption" style={{ margin: 0 }}>
            {counts.critical} critical · {counts.warning} warning
          </p>
        </div>
        {onClear ? (
          <button type="button" class="sm-btn sm-btn--ghost" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      {ordered.map(([catId, items]) => {
        const meta = categoryMeta(catId);
        return (
          <div key={catId} class="sm-card">
            <div class="sm-card__title">
              <span aria-hidden="true">{meta.icon}</span> {meta.label}
              <span class="sm-caption" style={{ marginLeft: "8px", fontWeight: 400 }}>
                {items.length}
              </span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
              {items.map((f, i) => {
                const sev = SEVERITY_LABEL[f.severity];
                const conf = Math.round((f.confidence ?? 0) * 100);
                return (
                  <li
                    key={`${f.detectorId}-${f.match.start}-${i}`}
                    style={{
                      borderTop:    i === 0 ? "none" : "1px solid var(--sm-border)",
                      padding:      "8px 0",
                      display:      "flex",
                      flexDirection: "column",
                      gap:          "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          fontSize:   "var(--sm-fs-xs)",
                          color:      sev.color,
                          fontWeight: 600,
                          textTransform: "uppercase",
                        }}
                      >
                        {t(sev.key)}
                      </span>
                      <span class="sm-row__title" style={{ fontWeight: 500 }}>
                        {detectorLabel(f.detectorId)}
                      </span>
                      <span class="sm-caption" style={{ marginLeft: "auto" }}>
                        {conf}% confident
                      </span>
                    </div>
                    <code
                      style={{
                        fontSize: "var(--sm-fs-xs)",
                        color:    "var(--sm-text-subtle)",
                        background: "var(--sm-bg-subtle)",
                        padding:  "4px 8px",
                        borderRadius: "4px",
                        display:  "block",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {f.contextSnippet}
                    </code>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
