/**
 * T083 — AccountSwitcher component.
 *
 * Shows a dropdown for switching the active account within a module.
 * Displayed only when >1 eligible account is connected (FR-Acc8).
 *
 * Pure logic helpers are exported for unit testing.
 */

import type { Account } from "~/core/identity/types";
import type { Capability } from "~/core/identity/types";

/* ══════════════════════════════════════════════════════════════════
   Exported pure helpers (tested by T082)
   ══════════════════════════════════════════════════════════════════ */

/** Maps a capability key to a scope fragment for filtering. */
const CAP_SCOPE_MAP: Record<Capability, string> = {
  "drive.read":   "drive.readonly",
  "drive.write":  "drive",
  "gmail.dom":    "gmail",
  "outlook.read": "mail.read",
};

/**
 * Filter a list of accounts to those that have the required capability.
 * An account "has" a capability if at least one of its scopes contains
 * the capability's scope fragment.
 */
export function getEligibleAccounts(
  accounts: Account[],
  capability: Capability,
): Account[] {
  const needle = CAP_SCOPE_MAP[capability];
  return accounts.filter((a) => a.scopes.some((s) => s.includes(needle)));
}

/**
 * Returns `true` when the AccountSwitcher should be shown.
 *
 * Rule (FR-Acc8): show switcher only when >1 eligible account is connected
 * for the module's required capability.
 *
 * `accounts` should already be filtered to the relevant capability (e.g.
 * the result of `getEligibleAccounts(allAccounts, "drive.read")`).
 */
export function shouldShowSwitcher(
  accounts: Account[],
  _capability: Capability,
): boolean {
  return accounts.length > 1;
}

/* ══════════════════════════════════════════════════════════════════
   AccountSwitcher component
   ══════════════════════════════════════════════════════════════════ */

import type { AccountId, ModuleKey } from "~/core/identity/types";
import type { AccountManager } from "~/core/identity/account-manager";
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";

type AccountSwitcherProps = {
  manager:    AccountManager;
  moduleKey:  ModuleKey;
  capability: Capability;
};

const eligibleSignal = signal<Account[]>([]);
const activeSignal   = signal<AccountId | null>(null);

export function AccountSwitcher({ manager, moduleKey, capability }: AccountSwitcherProps) {
  useEffect(() => {
    void (async () => {
      const all      = await manager.list({ capability });
      const eligible = getEligibleAccounts(all, capability);
      eligibleSignal.value = eligible;
      activeSignal.value   = await manager.getActive(moduleKey);
    })();

    const unsub = manager.onChange(async (all) => {
      const eligible = getEligibleAccounts(all, capability);
      eligibleSignal.value = eligible;
    });
    return unsub;
  }, [manager, moduleKey, capability]);

  const eligible = eligibleSignal.value;
  const activeId = activeSignal.value;

  if (!shouldShowSwitcher(eligible, capability)) {
    return null;
  }

  async function handleChange(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    await manager.setActive(moduleKey, id);
    activeSignal.value = id;
  }

  return (
    <div class="sm-account-switcher">
      <label class="sm-account-switcher__label" htmlFor={`switcher-${moduleKey}`}>
        Account:
      </label>
      <select
        id={`switcher-${moduleKey}`}
        class="sm-select sm-account-switcher__select"
        aria-label="Switch active account"
        value={activeId ?? ""}
        onChange={handleChange}
      >
        {eligible.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    </div>
  );
}
