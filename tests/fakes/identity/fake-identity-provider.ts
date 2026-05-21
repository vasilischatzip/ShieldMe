/**
 * T075 — FakeIdentityProvider test double.
 *
 * Implements the full IdentityProvider interface so downstream modules
 * (AccountManager, Drive, Email Guardian) can be tested without network I/O
 * or a real OAuth flow.
 *
 * Usage:
 *
 *   const fake = new FakeIdentityProvider("google");
 *   fake._seedAccounts([myAccount]);          // pre-populate account list
 *   fake._queueSignIn(authResult);            // next signIn() returns this
 *   fake._setSignInError({ kind: "user-cancelled" }); // next signIn() throws
 *   fake._reset();                            // clear all state between tests
 */

import type { IdentityProvider, AuthRequest, AuthResult, ScopeUpgradeRequest } from "~/core/identity/identity-provider";
import type { Account, AccountId, EncryptedBlob, ProviderId, Tokens } from "~/core/identity/types";

/* ── Helpers ─────────────────────────────────────────────────────── */

function makeEncryptedBlob(value: string): EncryptedBlob {
  return { ciphertext: btoa(value), iv: btoa("fake-iv-000000000") };
}

function makeFakeTokens(scopes: string[]): Tokens {
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  return {
    accessToken:  makeEncryptedBlob("fake-access-token"),
    refreshToken: makeEncryptedBlob("fake-refresh-token"),
    expiresAt,
    scopes,
  };
}

let _uidCounter = 1;
function nextUlid(): string {
  return `01FAKE${String(_uidCounter++).padStart(20, "0")}`;
}

/* ── FakeIdentityProvider ────────────────────────────────────────── */

export class FakeIdentityProvider implements IdentityProvider {
  readonly providerId: ProviderId;

  private _accounts = new Map<AccountId, Account>();
  private _signInQueue: AuthResult[]  = [];
  private _signInError: unknown       = undefined;
  private _refreshError: unknown      = undefined;
  private _validateResult: { sub: string; email?: string; valid: boolean } | null = null;
  private _revokedAccounts = new Set<AccountId>();

  constructor(providerId: ProviderId = "google") {
    this.providerId = providerId;
  }

  // ── IdentityProvider interface ─────────────────────────────────

  async signIn(req: AuthRequest): Promise<AuthResult> {
    if (this._signInError !== undefined) {
      const err = this._signInError;
      this._signInError = undefined;
      throw err;
    }
    if (this._signInQueue.length > 0) {
      return this._signInQueue.shift()!;
    }
    // Auto-create a fake account
    const id = nextUlid();
    const account: Account = {
      id,
      provider:    this.providerId,
      label:       `fake-user-${id}@example.com`,
      namespace:   `acc.${id}`,
      addedAt:     new Date().toISOString(),
      lastUsedAt:  new Date().toISOString(),
      scopes:      req.scopes,
    };
    if (req.withOpenId) {
      account.subject = `sub-${id}`;
    }
    this._accounts.set(id, account);
    return { account, tokens: makeFakeTokens(req.scopes) };
  }

  async refresh(accountId: AccountId): Promise<Tokens> {
    if (this._refreshError !== undefined) {
      const err = this._refreshError;
      this._refreshError = undefined;
      throw err;
    }
    const account = this._accounts.get(accountId);
    if (!account) throw { kind: "token-expired-no-refresh", accountId };
    return makeFakeTokens(account.scopes);
  }

  async upgradeScope(req: ScopeUpgradeRequest): Promise<Tokens> {
    const account = this._accounts.get(req.account);
    if (!account) throw { kind: "provider-unreachable" };
    const merged = [...new Set([...account.scopes, ...req.additionalScopes])];
    const updated: Account = { ...account, scopes: merged };
    this._accounts.set(req.account, updated);
    return makeFakeTokens(merged);
  }

  async signOut(accountId: AccountId): Promise<void> {
    this._revokedAccounts.add(accountId);
    this._accounts.delete(accountId);
  }

  async validateIdToken(
    idToken: string,
  ): Promise<{ sub: string; email?: string; valid: boolean }> {
    if (this._validateResult !== null) {
      return this._validateResult;
    }
    // Default: treat all non-empty tokens as valid; extract encoded sub
    if (!idToken) return { sub: "", valid: false };
    return { sub: `sub-from-${idToken.slice(0, 8)}`, email: "fake@example.com", valid: true };
  }

  async list(): Promise<Account[]> {
    return [...this._accounts.values()];
  }

  // ── Test helpers ───────────────────────────────────────────────

  /**
   * Pre-populate the account list (used when you want `list()` to return
   * known accounts without going through `signIn()`).
   */
  _seedAccounts(accounts: Account[]): void {
    for (const a of accounts) this._accounts.set(a.id, a);
  }

  /**
   * Queue a specific AuthResult to be returned by the next `signIn()` call.
   * Multiple calls queue multiple results in FIFO order.
   */
  _queueSignIn(result: AuthResult): void {
    this._signInQueue.push(result);
  }

  /** Make the next `signIn()` call throw the given error. */
  _setSignInError(err: unknown): void {
    this._signInError = err;
  }

  /** Make the next `refresh()` call throw the given error. */
  _setRefreshError(err: unknown): void {
    this._refreshError = err;
  }

  /**
   * Override the result returned by `validateIdToken()`.
   * Pass `null` to restore default behaviour.
   */
  _setValidateResult(
    result: { sub: string; email?: string; valid: boolean } | null,
  ): void {
    this._validateResult = result;
  }

  /** Returns true if `signOut()` was called for this account. */
  _wasRevoked(accountId: AccountId): boolean {
    return this._revokedAccounts.has(accountId);
  }

  /** Clear all state between tests. */
  _reset(): void {
    this._accounts.clear();
    this._signInQueue.length = 0;
    this._signInError        = undefined;
    this._refreshError       = undefined;
    this._validateResult     = null;
    this._revokedAccounts.clear();
  }
}
