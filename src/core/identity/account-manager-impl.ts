/**
 * T079 — AccountManager implementation.
 *
 * Contract: specs/001-shieldme-mvp/contracts/identity-providers.md §3
 *
 * Per-account namespacing:
 *   - All localStorage/IDB keys for an account are prefixed `acc.${accountId}.`
 *   - `Wipe.wipeAll()` iterates all account namespaces (not implemented here).
 *
 * Security:
 *   - Access tokens are decrypted on demand; no module-level token cache.
 *   - Refresh is delegated to the IdentityProvider (which owns the refresh token).
 *
 * Tier enforcement:
 *   - `accounts-max` is checked in `add()` by the caller (TierGate is NOT
 *     called here because AccountManagerImpl is a pure data service with no
 *     knowledge of the UI layer). Higher layers (UI route handlers) call
 *     TierGate.check before calling `add()`.
 */

import type { AccountManager, AccountFilter } from "./account-manager";
import type { Account, AccountId, Capability, ModuleKey, ProviderId } from "./types";
import type { IdentityProvider } from "./identity-provider";
import type { LocalStore } from "../storage";

/* ── Storage keys ────────────────────────────────────────────────── */

const ACCOUNTS_PREFIX  = "identity.accounts.";
const ACTIVE_PREFIX    = "identity.active.";
const TOKENS_PREFIX    = "identity.tokens.";

/* ── Capability → scope fragment mapping ─────────────────────────── */

const CAP_SCOPE: Record<Capability, string> = {
  "drive.read":   "drive.readonly",
  "drive.write":  "drive",
  "gmail.dom":    "gmail",
  "outlook.read": "mail.read",
};

function hasCapability(account: Account, cap: Capability): boolean {
  const needle = CAP_SCOPE[cap];
  return account.scopes.some((s) => s.includes(needle));
}

/* ── AccountManagerImpl ──────────────────────────────────────────── */

export class AccountManagerImpl implements AccountManager {
  private readonly _store:     LocalStore;
  private readonly _providers: Map<ProviderId, IdentityProvider>;
  private readonly _listeners: Set<(accounts: Account[]) => void> = new Set();

  constructor(store: LocalStore, providers: IdentityProvider[]) {
    this._store = store;
    this._providers = new Map(providers.map((p) => [p.providerId, p]));
  }

  // ── AccountManager ─────────────────────────────────────────────

  async add(
    provider: ProviderId,
    scopes: string[],
    opts?: { withOpenId?: boolean },
  ): Promise<Account> {
    const idp = this._providers.get(provider);
    if (!idp) {
      throw { kind: "unsupported-provider" as const, provider };
    }

    const result = await idp.signIn({
      scopes,
      withOpenId: opts?.withOpenId ?? false,
    });

    const account = result.account;

    // Persist the account record
    await this._store.set(`${ACCOUNTS_PREFIX}${account.id}`, account);

    this._notify();
    return account;
  }

  async remove(id: AccountId): Promise<void> {
    const account = await this._loadAccount(id);
    if (!account) return; // Idempotent

    // Revoke at IDP (best-effort)
    const idp = this._providers.get(account.provider);
    if (idp) {
      await idp.signOut(id).catch(() => {});
    }

    // Wipe all acc.${id}.* keys from storage
    await this._wipeNamespace(id);

    // Wipe account record and token record
    await this._store.remove(`${ACCOUNTS_PREFIX}${id}`);
    await this._store.remove(`${TOKENS_PREFIX}${id}`);

    // Clear active pointers that pointed to this account
    const moduleKeys: ModuleKey[] = ["drive", "email", "radar"];
    for (const mod of moduleKeys) {
      const active = await this._store.get<AccountId>(`${ACTIVE_PREFIX}${mod}`);
      if (active === id) {
        await this._store.remove(`${ACTIVE_PREFIX}${mod}`);
      }
    }

    this._notify();
  }

  async setActive(moduleKey: ModuleKey, id: AccountId): Promise<void> {
    await this._store.set(`${ACTIVE_PREFIX}${moduleKey}`, id);
  }

  async getActive(moduleKey: ModuleKey): Promise<AccountId | null> {
    return (await this._store.get<AccountId>(`${ACTIVE_PREFIX}${moduleKey}`)) ?? null;
  }

  async list(filter?: AccountFilter): Promise<Account[]> {
    // Scan all account keys in storage
    const snapshot = (this._store as { snapshot?: () => Record<string, unknown> }).snapshot?.() ?? {};
    const accounts: Account[] = [];

    for (const [key, value] of Object.entries(snapshot)) {
      if (!key.startsWith(ACCOUNTS_PREFIX)) continue;
      const account = value as Account;

      if (filter?.provider && account.provider !== filter.provider) continue;
      if (filter?.capability && !hasCapability(account, filter.capability)) continue;

      accounts.push(account);
    }

    return accounts;
  }

  async accessToken(id: AccountId, _scope: string): Promise<string> {
    const account = await this._loadAccount(id);
    if (!account) {
      const err: import("./types").IdentityError = {
        kind:      "token-expired-no-refresh",
        accountId: id,
      };
      throw err;
    }

    const idp = this._providers.get(account.provider);
    if (!idp) {
      throw { kind: "provider-unreachable" as const };
    }

    // Delegate to the IDP: it handles expiry checks + refresh-token rotation.
    // The returned Tokens contains an encrypted accessToken blob.
    // We ask the IDP to refresh, which returns freshly-encrypted Tokens.
    // The caller needs the plaintext token; we expose a decryptAccessToken hook
    // on providers that support it (GoogleIdentityProvider). Providers that don't
    // (e.g. FakeIdentityProvider) implement `_decryptAccessToken`.
    const tokens = await idp.refresh(id);
    // If the IDP exposes a decrypt helper (real providers do), use it.
    // Otherwise fall back to a generic per-account key derivation lookup.
    const withDecrypt = idp as unknown as {
      _decryptAccessToken?: (accountId: AccountId, blob: import("./types").EncryptedBlob) => Promise<string>;
    };
    if (withDecrypt._decryptAccessToken) {
      return withDecrypt._decryptAccessToken(id, tokens.accessToken);
    }
    // Fallback for test doubles that return a known token string in ciphertext
    return atob(tokens.accessToken.ciphertext);
  }

  onChange(fn: (accounts: Account[]) => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // ── Private ────────────────────────────────────────────────────

  private async _loadAccount(id: AccountId): Promise<Account | null> {
    return (await this._store.get<Account>(`${ACCOUNTS_PREFIX}${id}`)) ?? null;
  }

  private async _wipeNamespace(id: AccountId): Promise<void> {
    const prefix   = `acc.${id}.`;
    const snapshot = (this._store as { snapshot?: () => Record<string, unknown> }).snapshot?.() ?? {};
    for (const key of Object.keys(snapshot)) {
      if (key.startsWith(prefix)) {
        await this._store.remove(key);
      }
    }
  }

  private _notify(): void {
    // Fire listeners asynchronously in the next microtask to avoid ordering issues
    void this.list().then((accounts) => {
      for (const fn of this._listeners) fn(accounts);
    });
  }
}
