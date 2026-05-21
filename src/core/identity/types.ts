/**
 * Identity & account model types.
 *
 * Contract: specs/001-shieldme-mvp/contracts/identity-providers.md §1
 *
 * Vendor-agnostic; concrete implementations live in `google-provider.ts`
 * (and future `microsoft-provider.ts`, `apple-provider.ts`).
 */

/* ── Account ─────────────────────────────────────────────────────── */

export type AccountId = string;       // ULID, locally generated — never the IDP's user ID
export type ProviderId = "google" | "microsoft" | "apple";

export type Account = {
  /** ULID, locally generated. Never the IDP's user ID. */
  id: AccountId;
  provider: ProviderId;
  /** OIDC `sub` claim from the IDP's ID token. Stable across sessions. */
  subject?: string;
  /** Display label (email or Microsoft UPN) — shown in account switcher only. */
  label: string;
  /**
   * Per-account scope namespace.
   * All localStorage and IDB writes pertaining to this account live under
   * this namespace, e.g. `acc.${id}`.
   */
  namespace: string;
  addedAt: string;
  lastUsedAt: string;
  /** Capabilities granted (provider-specific scope strings, normalised). */
  scopes: string[];
};

/* ── Tokens ──────────────────────────────────────────────────────── */

/**
 * Encrypted token blob (base64 ciphertext + base64 IV).
 * Never stored or transmitted in plaintext.
 */
export type EncryptedBlob = {
  ciphertext: string;
  iv: string;
};

export type Tokens = {
  /** Encrypted at rest. Never logged. */
  accessToken: EncryptedBlob;
  /** May be absent if IDP doesn't issue a refresh token. */
  refreshToken: EncryptedBlob;
  /** OIDC; captured on first auth, used for `sub` extraction. */
  idToken?: EncryptedBlob;
  expiresAt: string;
  scopes: string[];
};

/* ── Identity errors ─────────────────────────────────────────────── */

export type IdentityError =
  | { kind: "user-cancelled" }
  | { kind: "consent-denied" }
  | { kind: "scope-denied"; scopes: string[] }
  | { kind: "token-expired-no-refresh"; accountId: AccountId }
  | { kind: "id-token-invalid"; reason: string }
  | { kind: "rate-limited"; retryAfterSec: number }
  | { kind: "provider-unreachable" };

/* ── Module keys ─────────────────────────────────────────────────── */

/**
 * Identifies which app module is requesting the active account.
 * AccountManager stores per-module active-account preferences.
 */
export type ModuleKey = "drive" | "email" | "radar";

/* ── Capability ──────────────────────────────────────────────────── */

export type Capability = "drive.read" | "drive.write" | "gmail.dom" | "outlook.read";
