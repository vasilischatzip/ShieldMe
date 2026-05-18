/**
 * Radar popup route — Exposure Radar.
 *
 * Sections:
 *   1. Password breach check (always free, k-anonymity via HIBP range API)
 *   2. Email breach check   (requires HIBP API key saved in Settings)
 *   3. Data broker checklist (20+ sites, manual tracking)
 *   4. Automated removal    (DeleteMe — Coming Soon, captures intent)
 *
 * Privacy invariants:
 *   • Password plaintext never leaves device; only a 5-char SHA-1 prefix is sent.
 *   • HIBP API key is stored encrypted via Crypto module; decrypted only during fetch.
 *   • All data broker status is persisted locally — zero network calls for checklist.
 */
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { t } from "~/core/i18n";
import { Header, Card, Button, Badge } from "../ui";
import { localStore } from "~/core/storage";
import { createPwnedPasswords, type PwnedResult } from "~/radar/hibp-passwords";
import {
  createBreachedAccount,
  OwnershipError,
  NoKeyError,
  type BreachList,
} from "~/radar/hibp-emails";
import { chromeOwnershipVerifier } from "~/radar/ownership";
import {
  createManualProvider,
  type BrokerSite,
  type RemovalStatus,
} from "~/radar/providers/manual-provider";

/* ── Service singletons ─────────────────────────────────────────── */

const pwnedPasswords = createPwnedPasswords();

async function getWrappingKey(): Promise<string> {
  const key = await localStore.get<string>("meta.wrappingKey");
  if (!key) throw new Error("Wrapping key not initialised");
  return key;
}

const hibpEmails = createBreachedAccount(
  localStore,
  getWrappingKey,
  chromeOwnershipVerifier,
);

const brokerProvider = createManualProvider(localStore);

/* ── Password check state ───────────────────────────────────────── */

type PwdState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "result"; result: PwnedResult }
  | { kind: "error"; message: string };

const pwdInput  = signal<string>("");
const pwdState  = signal<PwdState>({ kind: "idle" });

async function checkPassword(): Promise<void> {
  const val = pwdInput.value.trim();
  if (!val) return;
  pwdState.value = { kind: "checking" };
  try {
    const result = await pwnedPasswords.check(val);
    pwdState.value = { kind: "result", result };
    pwdInput.value = ""; // clear plaintext immediately
  } catch (e) {
    pwdState.value = { kind: "error", message: String(e) };
    pwdInput.value = "";
  }
}

/* ── Email check state ──────────────────────────────────────────── */

type EmailState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "result"; breaches: BreachList }
  | { kind: "no-key" }
  | { kind: "ownership-error"; message: string }
  | { kind: "error"; message: string };

const emailInput  = signal<string>("");
const emailState  = signal<EmailState>({ kind: "idle" });

async function checkEmail(): Promise<void> {
  const val = emailInput.value.trim();
  if (!val) return;
  emailState.value = { kind: "checking" };
  try {
    const hasKey = await hibpEmails.hasKey();
    if (!hasKey) {
      emailState.value = { kind: "no-key" };
      return;
    }
    const breaches = await hibpEmails.check(val, { kind: "chrome-profile" });
    emailState.value = { kind: "result", breaches };
  } catch (e) {
    if (e instanceof NoKeyError) {
      emailState.value = { kind: "no-key" };
    } else if (e instanceof OwnershipError) {
      emailState.value = { kind: "ownership-error", message: (e as Error).message };
    } else {
      emailState.value = { kind: "error", message: String(e) };
    }
  }
}

/* ── Broker checklist state ─────────────────────────────────────── */

type BrokerEntry = { site: BrokerSite; status: RemovalStatus };
const brokerList    = signal<BrokerEntry[]>([]);
const brokerLoading = signal<boolean>(false);
const brokerExpanded = signal<boolean>(false);

async function loadBrokers(): Promise<void> {
  brokerLoading.value = true;
  try {
    const sites    = await brokerProvider.listSites();
    const entries  = await Promise.all(
      sites.map(async site => ({
        site,
        status: await brokerProvider.status(site.id),
      })),
    );
    brokerList.value = entries;
  } finally {
    brokerLoading.value = false;
  }
}

async function requestRemoval(siteId: string): Promise<void> {
  const newStatus = await brokerProvider.requestRemoval(siteId);
  brokerList.value = brokerList.value.map(e =>
    e.site.id === siteId ? { ...e, status: newStatus } : e,
  );
}

/* ── Dark-web notify intent ─────────────────────────────────────── */

const notifyIntent = signal<boolean>(false);

async function captureNotifyIntent(): Promise<void> {
  await localStore.set("radar.darkWebNotify", true);
  notifyIntent.value = true;
}

/* ── Component ──────────────────────────────────────────────────── */

export default function Radar() {
  useEffect(() => {
    localStore.get<boolean>("radar.darkWebNotify").then(v => {
      if (v) notifyIntent.value = true;
    });
  }, []);

  return (
    <>
      <Header
        eyebrow={t("nav_radar")}
        title="Exposure Radar"
        subtitle="Check if your information has already leaked — and start cleaning it up."
      />

      {/* ── 1. Password breach check ─────────────────────────── */}
      <Card title={`🔐 ${t("radar_passwordCheck")}`}>
        <p class="sm-card__desc">
          We only send a 5-character partial hash to HIBP — your password never leaves your device.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            type="password"
            placeholder="Enter a password to check"
            value={pwdInput.value}
            onInput={e => { pwdInput.value = (e.target as HTMLInputElement).value; }}
            onKeyDown={e => { if (e.key === "Enter") void checkPassword(); }}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border, #ccc)" }}
            aria-label="Password to check"
          />
          <Button
            variant="primary"
            onClick={() => void checkPassword()}
            disabled={pwdState.value.kind === "checking" || !pwdInput.value.trim()}
          >
            {pwdState.value.kind === "checking" ? "Checking…" : "Check"}
          </Button>
        </div>

        {pwdState.value.kind === "result" && (
          <div style={{ marginTop: 8 }} role="status" aria-live="polite">
            {pwdState.value.result.status === "breached" ? (
              <span style={{ color: "var(--color-critical, #d32f2f)", fontWeight: 600 }}>
                ⚠ Found in {pwdState.value.result.count.toLocaleString()} breach{pwdState.value.result.count !== 1 ? "es" : ""}.
                Do not use this password.
              </span>
            ) : (
              <span style={{ color: "var(--color-ok, #2e7d32)", fontWeight: 600 }}>
                ✓ Not found in any known data breach.
              </span>
            )}
          </div>
        )}

        {pwdState.value.kind === "error" && (
          <p style={{ marginTop: 8, color: "var(--color-warning, #e65100)" }} role="alert">
            Check failed: {pwdState.value.message}
          </p>
        )}
      </Card>

      {/* ── 2. Email breach check ────────────────────────────── */}
      <Card title={`📧 ${t("radar_emailCheck")}`}>
        <p class="sm-card__desc">
          See all known data breaches for your email address. Requires a free HIBP key
          — add yours in Settings.
        </p>

        {emailState.value.kind === "no-key" ? (
          <p style={{ marginTop: 8, color: "var(--color-warning, #e65100)" }}>
            No HIBP key saved. Add your free key in{" "}
            <a href="#settings" style={{ textDecoration: "underline" }}>Settings → HIBP Key</a>.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                type="email"
                placeholder="you@example.com"
                value={emailInput.value}
                onInput={e => { emailInput.value = (e.target as HTMLInputElement).value; }}
                onKeyDown={e => { if (e.key === "Enter") void checkEmail(); }}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border, #ccc)" }}
                aria-label="Email address to check"
              />
              <Button
                variant="primary"
                onClick={() => void checkEmail()}
                disabled={emailState.value.kind === "checking" || !emailInput.value.trim()}
              >
                {emailState.value.kind === "checking" ? "Checking…" : "Check"}
              </Button>
            </div>

            {emailState.value.kind === "result" && (
              <div style={{ marginTop: 8 }} role="status" aria-live="polite">
                {emailState.value.breaches.length === 0 ? (
                  <span style={{ color: "var(--color-ok, #2e7d32)", fontWeight: 600 }}>
                    ✓ No breaches found for this address.
                  </span>
                ) : (
                  <div>
                    <p style={{ fontWeight: 600, color: "var(--color-critical, #d32f2f)" }}>
                      Found in {emailState.value.breaches.length} breach{emailState.value.breaches.length !== 1 ? "es" : ""}:
                    </p>
                    <ul style={{ margin: "6px 0 0 0", padding: "0 0 0 18px" }}>
                      {emailState.value.breaches.map(b => (
                        <li key={b.name} style={{ marginBottom: 4 }}>
                          <strong>{b.name}</strong>{" "}
                          <span style={{ fontSize: "0.85em", color: "var(--color-muted, #666)" }}>
                            ({b.breachDate}) — {b.dataClasses.join(", ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {emailState.value.kind === "ownership-error" && (
              <p style={{ marginTop: 8, color: "var(--color-warning, #e65100)" }} role="alert">
                Ownership check failed — only your signed-in Chrome account email can be checked.
              </p>
            )}

            {emailState.value.kind === "error" && (
              <p style={{ marginTop: 8, color: "var(--color-warning, #e65100)" }} role="alert">
                Check failed: {emailState.value.message}
              </p>
            )}
          </>
        )}
      </Card>

      {/* ── 3. Data broker checklist ─────────────────────────── */}
      <Card title={`📋 ${t("radar_brokerChecklist")}`}>
        <p class="sm-card__desc">
          Walk through 20+ data-removal sites and track your progress.
          No automation — you visit each site yourself; we track your status.
        </p>

        {!brokerExpanded.value ? (
          <Button
            variant="ghost"
            block
            onClick={() => {
              brokerExpanded.value = true;
              void loadBrokers();
            }}
          >
            Show removal checklist
          </Button>
        ) : brokerLoading.value ? (
          <p style={{ marginTop: 8, color: "var(--color-muted, #666)" }}>Loading sites…</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {brokerList.value.map(({ site, status }) => (
              <div
                key={site.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--color-border, #eee)",
                }}
              >
                <div>
                  <a
                    href={site.optOutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 500 }}
                  >
                    {site.name}
                  </a>
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: "0.75em",
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: site.formDifficulty === "easy"
                        ? "var(--color-ok-bg, #e8f5e9)"
                        : site.formDifficulty === "medium"
                          ? "var(--color-warn-bg, #fff3e0)"
                          : "var(--color-critical-bg, #fce4e4)",
                      color: site.formDifficulty === "easy"
                        ? "var(--color-ok, #2e7d32)"
                        : site.formDifficulty === "medium"
                          ? "var(--color-warning, #e65100)"
                          : "var(--color-critical, #d32f2f)",
                    }}
                  >
                    {site.formDifficulty}
                  </span>
                </div>

                {status.state === "unchecked" ? (
                  <Button
                    variant="ghost"
                    onClick={() => void requestRemoval(site.id)}
                  >
                    Mark requested
                  </Button>
                ) : status.state === "requested" ? (
                  <span style={{ color: "var(--color-warning, #e65100)", fontSize: "0.85em" }}>⏳ Requested</span>
                ) : status.state === "confirmed" ? (
                  <span style={{ color: "var(--color-ok, #2e7d32)", fontSize: "0.85em" }}>✓ Removed</span>
                ) : (
                  <span style={{ color: "var(--color-muted, #888)", fontSize: "0.85em", textTransform: "capitalize" }}>
                    {status.state}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── 4. Automated removal — Coming Soon ─────────────── */}
      <div
        class="sm-card"
        style={{ opacity: 0.85 }}
        aria-label={t("radar_deleteMe_placeholder")}
        data-testid="deleteme-card"
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span class="sm-card__title">🤖 {t("radar_deleteMe_placeholder")}</span>
          <Badge variant="soon">{t("tier_free_comingSoon")}</Badge>
        </div>
        <p class="sm-card__desc">
          Automated removal requests sent on your behalf via DeleteMe. Premium feature — coming soon.
        </p>
        {notifyIntent.value ? (
          <p style={{ color: "var(--color-ok, #2e7d32)", fontWeight: 600, marginTop: 6 }}>
            ✓ We'll notify you when this feature launches.
          </p>
        ) : (
          <Button
            variant="ghost"
            onClick={() => void captureNotifyIntent()}
            data-testid="deleteme-notify-btn"
          >
            Notify me when available
          </Button>
        )}
      </div>
    </>
  );
}
