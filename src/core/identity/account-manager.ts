/**
 * AccountManager interface.
 *
 * Contract: specs/001-shieldme-mvp/contracts/identity-providers.md §3
 *
 * Single point of account state. Components consume this; they never reach
 * into individual IdentityProvider instances.
 *
 * Per-account namespacing:
 *   - localStorage keys: `acc.${accountId}.driveMeta`, etc.
 *   - IDB stores: compound key `[accountId, originalKey]`.
 *   - Wipe.wipeAll() iterates all account namespaces.
 */

import type { Account, AccountId, Capability, ModuleKey, ProviderId } from "./types";

export type AccountFilter = {
  provider?: ProviderId;
  capability?: Capability;
};

export interface AccountManager {
  /**
   * Add a new account (interactive).
   * Multi-account: never replaces, always appends.
   */
  add(
    provider: ProviderId,
    scopes: string[],
    opts?: { withOpenId?: boolean },
  ): Promise<Account>;

  /**
   * Remove an account: revoke at IDP, wipe namespace, drop tokens.
   * Idempotent — calling with an unknown ID is a no-op.
   */
  remove(id: AccountId): Promise<void>;

  /**
   * Switch the "active" account for a given module.
   * Modules persist their own active-account preference;
   * AccountManager just stores the pointer.
   */
  setActive(moduleKey: ModuleKey, id: AccountId): Promise<void>;

  /** Retrieve the active account for a module. */
  getActive(moduleKey: ModuleKey): Promise<AccountId | null>;

  /** List all accounts, optionally filtered. */
  list(filter?: AccountFilter): Promise<Account[]>;

  /**
   * Get a fresh access token for the named account.
   * Refreshes silently if the stored token is expired.
   */
  accessToken(id: AccountId, scope: string): Promise<string>;

  /**
   * Subscribe to account-set changes (drives the UI account switcher).
   * Returns an unsubscribe function.
   */
  onChange(fn: (accounts: Account[]) => void): () => void;
}
