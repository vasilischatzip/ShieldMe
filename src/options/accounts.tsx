/**
 * T083 — Settings → Accounts panel.
 *
 * Renders the list of connected accounts with:
 *   - Provider badge
 *   - Account label (email)
 *   - Last-used date
 *   - [Disconnect] button → type-to-confirm dialog
 *
 * Spec refs: FR-Acc7
 *
 * Pure logic helpers are exported for unit testing (no DOM rendering required
 * in tests — matches project convention from rules.spec.tsx).
 */

import type { Account } from "~/core/identity/types";
import type { ProviderId } from "~/core/identity/types";

/* ══════════════════════════════════════════════════════════════════
   Exported pure helpers (tested by T082)
   ══════════════════════════════════════════════════════════════════ */

/**
 * Returns the human-readable badge label for a provider ID.
 * Used in the account list to show "Google", "Microsoft", "Apple".
 */
export function getProviderBadgeLabel(provider: ProviderId): string {
  const labels: Record<ProviderId, string> = {
    google:    "Google",
    microsoft: "Microsoft",
    apple:     "Apple",
  };
  return labels[provider] ?? provider;
}

/**
 * Returns `true` when the user's typed input exactly matches the account label.
 * The type-to-confirm dialog requires an exact (case-sensitive) match.
 *
 * Design choice: exact case-sensitive match prevents accidental confirmation
 * and mirrors the email address the user sees in the UI.
 */
export function canConfirmDisconnect(input: string, account: Account): boolean {
  return input.trim() !== "" && input === account.label;
}

/**
 * Format a last-used ISO date string into a human-readable relative label.
 * E.g. "2 minutes ago", "3 days ago", "Jan 15".
 */
export function formatLastUsed(isoDate: string): string {
  const date  = new Date(isoDate);
  const nowMs = Date.now();
  const diffMs = nowMs - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffH   = Math.floor(diffMin / 60);
  const diffD   = Math.floor(diffH   / 24);

  if (diffSec < 60)    return "just now";
  if (diffMin < 60)    return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffH   < 24)    return `${diffH} hour${diffH !== 1 ? "s" : ""} ago`;
  if (diffD   < 30)    return `${diffD} day${diffD !== 1 ? "s" : ""} ago`;

  // Older than 30 days: show a short date
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Build the warning message for the disconnect confirm dialog.
 * Lists what will be wiped when the account is disconnected.
 */
export function buildDisconnectWarning(account: Account): string {
  const parts: string[] = ["Your cached data and scan history for this account will be removed."];

  const hasDrive = account.scopes.some((s) => s.includes("drive"));
  if (hasDrive) {
    parts.push("Your Google Drive audit cache will be cleared.");
  }

  const hasGmail = account.scopes.some((s) => s.includes("gmail"));
  if (hasGmail) {
    parts.push("Your Gmail Guardian settings for this account will be removed.");
  }

  parts.push("Your account connection will be revoked at Google. This cannot be undone.");
  return parts.join(" ");
}

/* ══════════════════════════════════════════════════════════════════
   AccountsPanel component
   ══════════════════════════════════════════════════════════════════ */

import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { AccountManager } from "~/core/identity/account-manager";

type AccountsPanelProps = {
  manager: AccountManager;
};

type DisconnectDialog = {
  account: Account;
  input:   string;
  loading: boolean;
};

const accountsSignal   = signal<Account[]>([]);
const dialogSignal     = signal<DisconnectDialog | null>(null);

export function AccountsPanel({ manager }: AccountsPanelProps) {
  useEffect(() => {
    void manager.list().then((a) => { accountsSignal.value = a; });
    const unsub = manager.onChange((a) => { accountsSignal.value = a; });
    return unsub;
  }, [manager]);

  const accounts = accountsSignal.value;
  const dialog   = dialogSignal.value;

  function openDialog(account: Account) {
    dialogSignal.value = { account, input: "", loading: false };
  }

  function closeDialog() {
    dialogSignal.value = null;
  }

  async function handleDisconnect() {
    if (!dialog) return;
    if (!canConfirmDisconnect(dialog.input, dialog.account)) return;
    dialogSignal.value = { ...dialog, loading: true };
    await manager.remove(dialog.account.id);
    dialogSignal.value = null;
  }

  return (
    <section aria-labelledby="accounts-heading">
      <h2 id="accounts-heading" class="sm-section-title">Connected Accounts</h2>

      {accounts.length === 0 ? (
        <p class="sm-caption">No accounts connected yet.</p>
      ) : (
        <ul class="sm-account-list" aria-label="Connected accounts">
          {accounts.map((account) => (
            <li key={account.id} class="sm-account-item">
              <span class="sm-account-badge" aria-label={`Provider: ${getProviderBadgeLabel(account.provider)}`}>
                {getProviderBadgeLabel(account.provider)}
              </span>
              <span class="sm-account-label">{account.label}</span>
              <span class="sm-account-last-used" aria-label={`Last used: ${formatLastUsed(account.lastUsedAt)}`}>
                {formatLastUsed(account.lastUsedAt)}
              </span>
              <button
                type="button"
                class="sm-btn sm-btn--ghost sm-btn--sm"
                aria-label={`Disconnect ${account.label}`}
                onClick={() => openDialog(account)}
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Disconnect confirm dialog */}
      {dialog && (
        <div role="dialog" aria-modal="true" aria-labelledby="disconnect-dialog-title" class="sm-dialog">
          <h3 id="disconnect-dialog-title">Disconnect {dialog.account.label}?</h3>
          <p class="sm-caption">{buildDisconnectWarning(dialog.account)}</p>
          <p class="sm-caption">
            Type <strong>{dialog.account.label}</strong> to confirm:
          </p>
          <input
            type="text"
            class="sm-input"
            aria-label="Type account label to confirm disconnect"
            value={dialog.input}
            onInput={(e) => {
              dialogSignal.value = {
                ...dialog,
                input: (e.target as HTMLInputElement).value,
              };
            }}
          />
          <div class="sm-dialog__actions">
            <button
              type="button"
              class="sm-btn sm-btn--ghost"
              onClick={closeDialog}
              disabled={dialog.loading}
            >
              Cancel
            </button>
            <button
              type="button"
              class="sm-btn sm-btn--danger"
              disabled={!canConfirmDisconnect(dialog.input, dialog.account) || dialog.loading}
              onClick={handleDisconnect}
            >
              {dialog.loading ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
