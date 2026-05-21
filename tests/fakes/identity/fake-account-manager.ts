/**
 * T075 — FakeAccountManager test double.
 *
 * Implements the full AccountManager interface so Drive, Email Guardian,
 * Radar, and Settings components can be tested without a real PKCE flow,
 * token storage, or IDP network calls.
 *
 * Multi-account scenarios are fully supported:
 *   - `_seedAccounts([...])` — pre-load known accounts
 *   - `_setAccessToken(id, token)` — control what `accessToken()` returns
 *   - `_setActiveFor(module, id)` — pre-set active account per module
 *   - `_setAddError(err)` — make next `add()` throw
 *
 * Usage:
 *
 *   const fake = new FakeAccountManager();
 *   fake._seedAccounts([accountA, accountB]);
 *   fake._setActiveFor("drive", accountA.id);
 *   fake._setAccessToken(accountA.id, "tok-abc");
 *   const tok = await fake.accessToken(accountA.id, "drive.read"); // "tok-abc"
 */

import type { AccountManager, AccountFilter } from "~/core/identity/account-manager";
import type { Account, AccountId, Capability, ModuleKey, ProviderId } from "~/core/identity/types";

/* ── Internal helpers ────────────────────────────────────────────── */

let _uidCounter = 1000;
function nextUlid(): string {
  return `01FAKEAM${String(_uidCounter++).padStart(18, "0")}`;
}

function capabilityMatchesScope(cap: Capability, scopes: string[]): boolean {
  const capToScope: Record<Capability, string> = {
    "drive.read":    "drive.readonly",
    "drive.write":   "drive",
    "gmail.dom":     "gmail",
    "outlook.read":  "mail.read",
  };
  const needle = capToScope[cap];
  return scopes.some((s) => s.includes(needle));
}

/* ── FakeAccountManager ──────────────────────────────────────────── */

export class FakeAccountManager implements AccountManager {
  private _accounts    = new Map<AccountId, Account>();
  private _activeKeys  = new Map<ModuleKey, AccountId>();
  private _tokens      = new Map<AccountId, string>();
  private _addError: unknown = undefined;
  private _removeError: unknown = undefined;
  private _listeners   = new Set<(accounts: Account[]) => void>();

  // ── AccountManager interface ───────────────────────────────────

  async add(
    provider: ProviderId,
    scopes: string[],
    opts?: { withOpenId?: boolean },
  ): Promise<Account> {
    if (this._addError !== undefined) {
      const err = this._addError;
      this._addError = undefined;
      throw err;
    }
    const id = nextUlid();
    const account: Account = {
      id,
      provider,
      label:      `fake-${provider}-${id}@example.com`,
      namespace:  `acc.${id}`,
      addedAt:    new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      scopes,
    };
    if (opts?.withOpenId) {
      account.subject = `sub-${id}`;
    }
    this._accounts.set(id, account);
    this._emitChange();
    return account;
  }

  async remove(id: AccountId): Promise<void> {
    if (this._removeError !== undefined) {
      const err = this._removeError;
      this._removeError = undefined;
      throw err;
    }
    if (this._accounts.has(id)) {
      this._accounts.delete(id);
      this._tokens.delete(id);
      // Clean up active pointers that referenced this account
      for (const [mod, activeId] of this._activeKeys) {
        if (activeId === id) this._activeKeys.delete(mod);
      }
      this._emitChange();
    }
  }

  async setActive(moduleKey: ModuleKey, id: AccountId): Promise<void> {
    this._activeKeys.set(moduleKey, id);
  }

  async getActive(moduleKey: ModuleKey): Promise<AccountId | null> {
    return this._activeKeys.get(moduleKey) ?? null;
  }

  async list(filter?: AccountFilter): Promise<Account[]> {
    let results = [...this._accounts.values()];
    if (filter?.provider) {
      results = results.filter((a) => a.provider === filter.provider);
    }
    if (filter?.capability) {
      results = results.filter((a) => capabilityMatchesScope(filter.capability!, a.scopes));
    }
    return results;
  }

  async accessToken(id: AccountId, _scope: string): Promise<string> {
    const fixed = this._tokens.get(id);
    if (fixed !== undefined) return fixed;
    const account = this._accounts.get(id);
    if (!account) throw { kind: "token-expired-no-refresh", accountId: id };
    return `fake-access-token-${id}`;
  }

  onChange(fn: (accounts: Account[]) => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // ── Test helpers ───────────────────────────────────────────────

  /**
   * Pre-populate the account list without going through `add()`.
   * Useful for testing read-only operations (list, getActive, accessToken).
   */
  _seedAccounts(accounts: Account[]): void {
    for (const a of accounts) this._accounts.set(a.id, a);
  }

  /**
   * Control what `accessToken(id, ...)` returns for a given account.
   * Pass `undefined` to revert to the auto-generated default.
   */
  _setAccessToken(id: AccountId, token: string | undefined): void {
    if (token === undefined) {
      this._tokens.delete(id);
    } else {
      this._tokens.set(id, token);
    }
  }

  /** Pre-set the active account for a module (bypasses async setActive). */
  _setActiveFor(moduleKey: ModuleKey, id: AccountId): void {
    this._activeKeys.set(moduleKey, id);
  }

  /** Make the next `add()` call throw the given error. */
  _setAddError(err: unknown): void {
    this._addError = err;
  }

  /** Make the next `remove()` call throw the given error. */
  _setRemoveError(err: unknown): void {
    this._removeError = err;
  }

  /** Synchronous snapshot of the current account list (for assertions). */
  _snapshot(): Account[] {
    return [...this._accounts.values()];
  }

  /** Clear all state between tests. */
  _reset(): void {
    this._accounts.clear();
    this._activeKeys.clear();
    this._tokens.clear();
    this._listeners.clear();
    this._addError    = undefined;
    this._removeError = undefined;
  }

  // ── Internal ───────────────────────────────────────────────────

  private _emitChange(): void {
    const accounts = [...this._accounts.values()];
    for (const fn of this._listeners) fn(accounts);
  }
}
