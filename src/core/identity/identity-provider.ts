/**
 * IdentityProvider interface.
 *
 * Contract: specs/001-shieldme-mvp/contracts/identity-providers.md §2
 *
 * All providers use PKCE code flow. No implicit flow. No client secret.
 * `chrome.identity.getAuthToken` is forbidden (doesn't support multi-account).
 */

import type { Account, AccountId, ProviderId, Tokens } from "./types";

/* ── Auth request / result ───────────────────────────────────────── */

export type AuthRequest = {
  /**
   * Provider-specific scope strings,
   * e.g. `["https://www.googleapis.com/auth/drive.readonly"]`.
   */
  scopes: string[];
  /**
   * When true, request OIDC `openid email profile` on top of `scopes`.
   * Capture the ID token; store `sub` on the resulting Account.
   */
  withOpenId: boolean;
  /** Optional login hint shown in the IDP UI. */
  loginHint?: string;
};

export type AuthResult = {
  account: Account;
  tokens: Tokens;
};

export type ScopeUpgradeRequest = {
  account: AccountId;
  additionalScopes: string[];
};

/* ── IdentityProvider ────────────────────────────────────────────── */

export interface IdentityProvider {
  readonly providerId: ProviderId;

  /** Interactive auth flow. Opens IDP UI in a new tab. PKCE code flow. */
  signIn(req: AuthRequest): Promise<AuthResult>;

  /** Refresh the access token. Refresh-token rotation is supported. */
  refresh(account: AccountId): Promise<Tokens>;

  /** Add scopes to an existing account. Triggers a fresh consent screen. */
  upgradeScope(req: ScopeUpgradeRequest): Promise<Tokens>;

  /** Revoke at the IDP and wipe locally. */
  signOut(account: AccountId): Promise<void>;

  /**
   * Validate an ID token client-side via JWKS.
   * Pure; safe to call repeatedly.
   */
  validateIdToken(
    idToken: string,
  ): Promise<{ sub: string; email?: string; valid: boolean }>;

  /** All accounts managed by this provider. */
  list(): Promise<Account[]>;
}
