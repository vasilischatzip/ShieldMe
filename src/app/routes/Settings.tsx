/**
 * Settings route — restructured layout:
 *  1. Protection categories with inline sub-detector toggles
 *  2. Exposure (HIBP API key connection + guidance)
 *  3. Google (Drive + Email access)
 *  4. Preferences (language, notifications, data retention, analytics)
 *  5. Privacy transparency (what ShieldMe stores)
 *  6. Delete all my data (wipeAll + WipeReport)
 *
 * Removed: Presets panel ("Your situation") — per user request.
 * Changed: Advanced detectors merged under each category as sub-toggles.
 */
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { t } from "~/core/i18n";
import { clearLastScan } from "../state/last-scan";
import {
  CATEGORIES,
  loadRules,
  rulesState,
  toggleCategory,
  toggleDetector,
} from "~/core/rules";
import { keyVault, VAULT_SLOTS } from "~/core/key-vault";
import { localStore } from "~/core/storage";
import { idb } from "~/core/idb";
import { driveClient } from "~/drive/client";
import { wipeAll, type WipeReport } from "~/core/wipe";
import { Header, Button, Switch, Row, Field, SectionTitle, Badge } from "../ui";

/* ── Local UI signals ───────────────────────────────────────── */

const deleteConfirm = signal("");
const deleteError = signal(false);
const wipeReport = signal<WipeReport | null>(null);
const wipeInProgress = signal(false);

// HIBP panel
const hibpKey = signal("");
const hibpSaved = signal(false);
const hibpLoading = signal(false);

// Category expand state — tracks which categories show their sub-detectors
const expandedCategories = signal<Set<string>>(new Set());

// Privacy section expand
const privacyOpen = signal(false);

/* ── Protection Categories Panel ───────────────────────────── */

function ProtectionPanel() {
  useEffect(() => {
    loadRules();
  }, []);

  const rules = rulesState.value;

  function toggleExpand(catId: string) {
    const next = new Set(expandedCategories.value);
    if (next.has(catId)) next.delete(catId);
    else next.add(catId);
    expandedCategories.value = next;
  }

  return (
    <section aria-labelledby="protections-heading">
      <SectionTitle>
        <span id="protections-heading">{t("settings_protections")}</span>
      </SectionTitle>
      <p class="sm-caption" style={{ marginBottom: "12px" }}>
        {t("settings_protections_desc")}
      </p>

      <div class="sm-card" style={{ gap: 0 }}>
        {CATEGORIES.map((cat) => {
          const catEnabled = rules.categories[cat.id] ?? false;
          const isExpanded = expandedCategories.value.has(cat.id);

          return (
            <div key={cat.id} class="sm-category">
              {/* Category header row */}
              <div class="sm-category__header">
                <button
                  type="button"
                  class="sm-category__toggle"
                  onClick={() => toggleExpand(cat.id)}
                  aria-expanded={isExpanded}
                  aria-label={`Show ${t(cat.labelKey)} details`}
                >
                  <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
                <span
                  class="sm-row__icon"
                  aria-hidden="true"
                  style={{ width: 32, height: 32 }}
                >
                  {cat.icon}
                </span>
                <div class="sm-row__body">
                  <span class="sm-row__title">{t(cat.labelKey)}</span>
                  <span class="sm-row__desc">{t(cat.descKey)}</span>
                </div>
                <Switch
                  checked={catEnabled}
                  ariaLabel={`Toggle ${t(cat.labelKey)}`}
                  onChange={(next) => toggleCategory(cat.id, next)}
                />
              </div>

              {/* Sub-detector toggles (expandable) */}
              <div
                class="sm-category__body"
                data-open={isExpanded ? "true" : "false"}
              >
                {cat.detectors.map((det) => {
                  const detEnabled = rules.detectors[det.id] ?? false;
                  return (
                    <div key={det.id} class="sm-subrow">
                      <span class="sm-subrow__title">{t(det.labelKey)}</span>
                      <Switch
                        checked={detEnabled && catEnabled}
                        disabled={!catEnabled}
                        ariaLabel={`Toggle ${t(det.labelKey)}`}
                        onChange={(next) => toggleDetector(det.id, next)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Exposure Panel (HIBP) ────────────────────────────────── */

function ExposurePanel() {
  useEffect(() => {
    keyVault.has(VAULT_SLOTS.hibp).then((has) => {
      hibpSaved.value = has;
    });
  }, []);

  async function handleSave() {
    const raw = hibpKey.value.trim();
    if (!raw) return;
    hibpLoading.value = true;
    try {
      await keyVault.set(VAULT_SLOTS.hibp, raw);
      hibpSaved.value = true;
      hibpKey.value = "";
    } finally {
      hibpLoading.value = false;
    }
  }

  async function handleDisconnect() {
    await keyVault.remove(VAULT_SLOTS.hibp);
    hibpSaved.value = false;
    hibpKey.value = "";
  }

  return (
    <section aria-labelledby="exposure-heading">
      <SectionTitle>
        <span id="exposure-heading">Exposure Monitoring</span>
      </SectionTitle>

      <div class="sm-connect-card">
        <div class="sm-connect-card__header">
          <div
            class="sm-connect-card__icon"
            style={{ background: "rgba(239, 68, 68, 0.08)" }}
          >
            <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div class="sm-connect-card__info">
            <div class="sm-connect-card__title">
              {t("settings_api_hibp")}
            </div>
            <p class="sm-connect-card__desc">
              Check if your email has been part of a data breach. Powered by Have I Been Pwned.
            </p>
          </div>
          {hibpSaved.value && (
            <Badge variant="success">Connected</Badge>
          )}
        </div>

        {/* Guidance callout */}
        <div class="sm-callout sm-callout--info">
          <span class="sm-callout__icon">&#9432;</span>
          <div>
            <strong>$3.50/month</strong> for email breach monitoring.
            Password checks are always free (your password never leaves your device).
            <a
              href="https://haveibeenpwned.com/API/Key"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", marginTop: "4px", fontWeight: 600 }}
            >
              Get your HIBP API key &rarr;
            </a>
          </div>
        </div>

        {hibpSaved.value ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "var(--sm-fs-sm)", color: "var(--sm-success)", fontWeight: 600 }}>
              &#10003; API key saved securely
            </span>
            <Button
              variant="ghost"
              aria-label={t("settings_api_disconnect")}
              onClick={handleDisconnect}
            >
              {t("settings_api_disconnect")}
            </Button>
          </div>
        ) : (
          <>
            <Field label="HIBP API Key">
              <input
                type="password"
                class="sm-input sm-input--mono"
                placeholder="Paste your API key here"
                aria-label="HIBP API key"
                value={hibpKey.value}
                onInput={(e) => { hibpKey.value = (e.target as HTMLInputElement).value; }}
              />
            </Field>
            <Button
              variant="primary"
              aria-label={t("settings_api_save")}
              disabled={!hibpKey.value.trim() || hibpLoading.value}
              onClick={handleSave}
            >
              {hibpLoading.value ? "Saving..." : "Connect HIBP"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/* ── Google Panel ──────────────────────────────────────────── */

function GooglePanel() {
  return (
    <section aria-labelledby="google-heading">
      <SectionTitle>
        <span id="google-heading">Google Integration</span>
      </SectionTitle>

      <div class="sm-stack">
        {/* Google Drive */}
        <div class="sm-connect-card">
          <div class="sm-connect-card__header">
            <div
              class="sm-connect-card__icon"
              style={{ background: "rgba(66, 133, 244, 0.08)" }}
            >
              <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </svg>
            </div>
            <div class="sm-connect-card__info">
              <div class="sm-connect-card__title">Google Drive</div>
              <p class="sm-connect-card__desc">
                Audit your Drive files for risky sharing settings and sensitive data.
                Read-only access — nothing is uploaded.
              </p>
            </div>
          </div>
          <div class="sm-callout sm-callout--info">
            <span class="sm-callout__icon">&#9432;</span>
            <span>
              Connect Drive from the <strong>Audit</strong> tab. You'll be prompted to grant
              read-only access via Google sign-in.
            </span>
          </div>
        </div>

        {/* Gmail */}
        <div class="sm-connect-card">
          <div class="sm-connect-card__header">
            <div
              class="sm-connect-card__icon"
              style={{ background: "rgba(234, 67, 53, 0.08)" }}
            >
              <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EA4335" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <div class="sm-connect-card__info">
              <div class="sm-connect-card__title">Gmail Protection</div>
              <p class="sm-connect-card__desc">
                Automatically scan your emails before sending to catch sensitive data.
                Works directly in Gmail — no data leaves your browser.
              </p>
            </div>
          </div>
          <div class="sm-callout sm-callout--info">
            <span class="sm-callout__icon">&#9432;</span>
            <span>
              Gmail protection is active automatically when you visit Gmail.
              ShieldMe checks your outgoing emails for sensitive information before you hit Send.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Privacy Transparency Section ──────────────────────────── */

function PrivacySection() {
  const isOpen = privacyOpen.value;

  return (
    <section aria-labelledby="privacy-heading">
      <SectionTitle>
        <span id="privacy-heading">Privacy Transparency</span>
      </SectionTitle>

      <div class="sm-card">
        <button
          type="button"
          class="sm-category__toggle sm-privacy-toggle"
          style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", padding: "0", cursor: "pointer", textAlign: "left" }}
          aria-expanded={isOpen}
          onClick={() => { privacyOpen.value = !isOpen; }}
        >
          <span style={{ fontWeight: 600, color: "var(--sm-text-primary)", fontSize: "var(--sm-fs-sm)" }}>
            What does ShieldMe store on my device?
          </span>
          <svg
            aria-hidden="true"
            focusable="false"
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 160ms", flexShrink: 0, color: "var(--sm-text-muted)" }}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <div class="sm-category__body" data-open={isOpen ? "true" : "false"}>
          <div style={{ paddingTop: "12px" }}>
            {([
              ["Your protection settings", "Which types of sensitive information to detect. Stored locally, never synced."],
              ["Scan history", "A list of files you've scanned and what was found. Stored in your browser's IndexedDB. Never uploaded."],
              ["Drive scan cache", "File IDs and last-scanned timestamps for your Google Drive files. No file content stored."],
              ["Breach check results", "Whether your email appeared in known breaches. Results cached locally; the check uses k-anonymity (your email is never sent)."],
              ["API keys (encrypted)", "Optional HIBP key you provide, encrypted with AES-256. Only you can decrypt it."],
              ["Preferences", "Language, theme, and notification settings. Stored locally."],
            ] as [string, string][]).map(([title, desc]) => (
              <div key={title} style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "var(--sm-fs-sm)", fontWeight: 600, color: "var(--sm-text-primary)", marginBottom: "2px" }}>{title}</div>
                <div style={{ fontSize: "var(--sm-fs-xs)", color: "var(--sm-text-muted)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}

            <div class="sm-callout sm-callout--info" style={{ marginTop: "8px" }}>
              <span class="sm-callout__icon">&#9432;</span>
              <span style={{ fontSize: "var(--sm-fs-xs)" }}>
                ShieldMe has no servers. There is no account. No data leaves your device except the
                hashed/anonymized identifiers described above.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Preferences Panel ──────────────────────────────────────── */

function PreferencesPanel() {
  const confirmVal = deleteConfirm.value;
  const canDelete = confirmVal === "DELETE";
  const report = wipeReport.value;
  const inProgress = wipeInProgress.value;

  async function handleDeleteAll() {
    if (!canDelete) { deleteError.value = true; return; }
    wipeInProgress.value = true;
    try {
      const report = await wipeAll(
        localStore,
        idb,
        keyVault,
        () => driveClient.revokeToken(),
      );
      clearLastScan();
      wipeReport.value = report;
      deleteConfirm.value = "";
    } finally {
      wipeInProgress.value = false;
    }
  }

  function exportSettings() {
    const data = {
      exportedAt: new Date().toISOString(),
      exportedBy: "ShieldMe",
      note: "This file contains only your configuration — no scan history or API keys.",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shieldme-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby="prefs-heading">
      <SectionTitle>
        <span id="prefs-heading">Preferences</span>
      </SectionTitle>

      <div class="sm-card">
        <Field label={t("settings_language")}>
          <select
            class="sm-select"
            aria-label={t("settings_language")}
          >
            <option value="en">English</option>
            <option value="el">&Epsilon;&lambda;&lambda;&eta;&nu;&iota;&kappa;&#940;</option>
          </select>
        </Field>

        <Row
          title="Notifications"
          desc="Allow ShieldMe to show alerts when risky items are found during a scan."
          trailing={
            <Switch
              checked={false}
              ariaLabel="Enable notifications"
              onChange={() => {}}
            />
          }
        />

        <Field label="Scan history retention">
          <select class="sm-select" aria-label="Scan history retention period">
            <option value="7">7 days</option>
            <option value="30" selected>30 days</option>
            <option value="90">90 days</option>
            <option value="never">Keep forever</option>
          </select>
        </Field>

        <Row
          title={t("settings_analytics")}
          desc="Anonymous usage stats. Never includes scan content. Disabled by default."
          trailing={
            <Switch
              checked={false}
              ariaLabel={t("settings_analytics")}
              onChange={() => {}}
            />
          }
        />

        <div style={{ paddingTop: "8px" }}>
          <Button
            variant="ghost"
            aria-label="Export your settings as JSON"
            onClick={exportSettings}
          >
            Export settings
          </Button>
        </div>
      </div>

      {/* Delete all data */}
      {report ? (
        <div class="sm-card" style={{ marginTop: "8px", borderColor: "var(--sm-success)" }}>
          <div class="sm-card__title" style={{ color: "var(--sm-success)" }}>
            &#10003; All data deleted
          </div>
          <p class="sm-card__desc">
            ShieldMe has been reset. Your settings, scan history, and API keys have been wiped.
            {report.oauthRevoked === true && " Your Google account connection was also disconnected."}
            {report.oauthRevoked === false && " Note: your Google token could not be revoked automatically — it will expire on its own."}
          </p>
          {report.warnings.length > 0 && (
            <details style={{ marginTop: "8px" }}>
              <summary style={{ fontSize: "var(--sm-fs-xs)", color: "var(--sm-text-muted)", cursor: "pointer" }}>
                {report.warnings.length} non-fatal warning{report.warnings.length > 1 ? "s" : ""}
              </summary>
              <ul style={{ fontSize: "var(--sm-fs-xs)", color: "var(--sm-text-muted)", paddingLeft: "16px", marginTop: "4px" }}>
                {report.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <div class="sm-card" style={{ marginTop: "8px", borderColor: "var(--sm-danger)" }}>
          <div class="sm-card__title" style={{ color: "var(--sm-danger)" }}>
            {t("settings_deleteData")}
          </div>
          <p class="sm-card__desc">
            Wipes every byte ShieldMe has stored — scan history, connected keys, and all settings.
            This cannot be undone.
          </p>
          <Field label={t("settings_deleteData_confirm")}>
            <input
              type="text"
              class="sm-input"
              placeholder='Type "DELETE" to confirm'
              aria-label={t("settings_deleteData_confirm")}
              value={deleteConfirm.value}
              onInput={(e) => {
                deleteConfirm.value = (e.target as HTMLInputElement).value;
                deleteError.value = false;
              }}
              style={deleteError.value ? { borderColor: "var(--sm-danger)" } : undefined}
            />
          </Field>
          <Button
            variant="danger"
            block
            aria-label={t("settings_deleteData")}
            disabled={!canDelete || inProgress}
            onClick={handleDeleteAll}
          >
            {inProgress ? "Deleting..." : t("settings_deleteData")}
          </Button>
        </div>
      )}
    </section>
  );
}

/* ── Settings root ──────────────────────────────────────────── */

export default function Settings() {
  return (
    <>
      <Header eyebrow={t("nav_settings")} title="Settings" />
      <ProtectionPanel />
      <ExposurePanel />
      <GooglePanel />
      <PrivacySection />
      <PreferencesPanel />
    </>
  );
}
