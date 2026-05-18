# Contract — Identity Providers

**Status:** binding · **Updated:** 2026-05-09 · **Constitution:** §XIII Identity & Account Sovereignty

Defines the seam between ShieldMe and any identity provider (IDP) the user connects. MVP ships with **Google** only. Microsoft (Entra) and Apple sign-in are scaffolded as future implementations and slot in via this interface without changes to call sites.

The contract distinguishes two responsibilities:
- **Authorization** — the user grants ShieldMe access to a third-party API (e.g., Google Drive). Produces OAuth access + refresh tokens.
- **Authentication (optional)** — the user proves who they are to ShieldMe via an OIDC ID token. Produces a stable `sub` for entitlement attachment.

Multi-account is first-class: the user may connect any number of Google (and future Microsoft/Apple) accounts. Each account has its own scoped namespace.

---

## 1. Account model

```ts
// src/core/identity/types.ts

export type AccountId = string;       // ULID, locally generated
export type ProviderId = "google" | "microsoft" | "apple";

export type Account = {
  id: AccountId;                       // ULID, never the IDP's user ID
  provider: ProviderId;
  /** OIDC `sub` claim from the IDP's ID token. Stable across sessions. */
  subject?: string;
  /** Display label (email or Microsoft UPN) — shown in account switcher only. */
  label: string;
  /** Per-account scope namespace. All `chrome.storage.local` and IDB writes
   *  pertaining to this account live under this namespace. */
  namespace: string;                   // e.g. `acc.${id}`
  addedAt: string;
  lastUsedAt: string;
  /** Capabilities granted (provider-specific scope strings, normalized). */
  scopes: string[];
};

export type Tokens = {
  /** Encrypted at rest. Never logged. */
  accessToken: EncryptedBlob;
  refreshToken: EncryptedBlob;         // may be absent if IDP doesn't issue
  idToken?: EncryptedBlob;             // OIDC; captured on first auth, used for `sub`
  expiresAt: string;
  scopes: string[];
};
```

## 2. IdentityProvider interface

```ts
// src/core/identity/identity-provider.ts

export type AuthRequest = {
  /** Provider-specific scope strings, e.g. `["https://www.googleapis.com/auth/drive.readonly"]`. */
  scopes: string[];
  /** When true, request OIDC `openid email profile` on top of `scopes`.
   *  Capture the ID token; store `sub` on the resulting Account. */
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
  additionalScopes: string[];          // e.g. add "drive" (write)
};

export interface IdentityProvider {
  readonly providerId: ProviderId;

  /** Interactive auth flow. Opens IDP UI in a new tab. PKCE code flow. */
  signIn(req: AuthRequest): Promise<AuthResult>;

  /** Refresh the access token. Refresh-token rotation supported if IDP rotates. */
  refresh(account: AccountId): Promise<Tokens>;

  /** Add scopes to an existing account. Triggers a fresh consent screen. */
  upgradeScope(req: ScopeUpgradeRequest): Promise<Tokens>;

  /** Revoke at the IDP and wipe locally. */
  signOut(account: AccountId): Promise<void>;

  /** Validate an ID token client-side via JWKS. Pure; safe to call repeatedly. */
  validateIdToken(idToken: string): Promise<{ sub: string; email?: string; valid: boolean }>;

  /** All accounts managed by this provider. */
  list(): Promise<Account[]>;
}
```

**Implementation notes:**
- All providers use **PKCE code flow** in `chrome.identity.launchWebAuthFlow`. No implicit flow. No client secret in the extension.
- For Google: client ID is dev-distinct from prod (so the OAuth verification covers prod only).
- For Microsoft: tenant `common` for personal MSA + workplace accounts.
- For Apple: not implemented in v1; interface ready.
- `chrome.identity.getAuthToken` is **forbidden** because it doesn't support multi-account — `launchWebAuthFlow` is the only path.

## 3. AccountManager

Single point of account state. Components consume this; they never reach into individual `IdentityProvider` instances.

```ts
// src/core/identity/account-manager.ts

export type AccountFilter = { provider?: ProviderId; capability?: Capability };
export type Capability = "drive.read" | "drive.write" | "gmail.dom" | "outlook.read";

export interface AccountManager {
  /** Add a new account (interactive). Multi-account: never replaces, always appends. */
  add(provider: ProviderId, scopes: string[], opts?: { withOpenId?: boolean }): Promise<Account>;

  /** Remove an account: revoke at IDP, wipe namespace, drop tokens. Idempotent. */
  remove(id: AccountId): Promise<void>;

  /** Switch the "active" account for a given module. Modules persist their own
   *  active-account preference; AccountManager just stores the pointer. */
  setActive(moduleKey: ModuleKey, id: AccountId): Promise<void>;
  getActive(moduleKey: ModuleKey): Promise<AccountId | null>;

  /** List all accounts, optionally filtered. */
  list(filter?: AccountFilter): Promise<Account[]>;

  /** Get a fresh access token for the named account; refreshes if expired. */
  accessToken(id: AccountId, scope: string): Promise<string>;

  /** Subscribe to account-set changes (UI account switcher). */
  onChange(fn: (accounts: Account[]) => void): () => void;
}

export type ModuleKey = "drive" | "email" | "radar";
```

**Per-account namespacing:**
- `chrome.storage.local` keys for account-scoped state are prefixed: `acc.${accountId}.driveMeta`, `acc.${accountId}.usage`, etc.
- IDB stores have a compound key `[accountId, originalKey]`.
- `Wipe.wipeAll()` (storage contract §5) iterates all account namespaces.

## 4. Token storage

- Access + refresh + ID tokens are encrypted with the existing wrapping key (`Crypto.encryptString` from `contracts/storage-schema.md` §3).
- Tokens never leave RAM unwrapped except for the duration of a single fetch call.
- `chrome.storage.local` key: `tokens.${accountId}` → `Tokens`.
- The active access token cache is **per-call**, not module-level: every `accessToken()` call may decrypt and refresh; no module holds a long-lived decrypted token.

## 5. OIDC validation (client-side, no server)

For providers that issue ID tokens (Google, Microsoft, Apple):

1. Fetch JWKS from the provider's well-known URL once per session, cache in IDB for 24h.
2. Verify ID token: signature (RS256/ES256), issuer, audience, expiration, `nonce` matches PKCE-derived nonce.
3. Extract `sub`, `email` (only for display label).
4. Discard the ID token after extracting `sub` unless we explicitly want to keep it for the entitlement service (M6+).

**Egress allowlist additions** (gated by user opting into the corresponding provider; see `contracts/integration-apis.md` §1):

| Host | Provider | Purpose |
|---|---|---|
| `https://oauth2.googleapis.com/*` | Google | Token exchange + revoke |
| `https://www.googleapis.com/oauth2/v3/certs` | Google | JWKS (OIDC) |
| `https://login.microsoftonline.com/common/oauth2/v2.0/*` | Microsoft | Token exchange |
| `https://login.microsoftonline.com/common/discovery/v2.0/keys` | Microsoft | JWKS (OIDC) |
| `https://appleid.apple.com/auth/*` | Apple (v2+) | Token exchange |
| `https://appleid.apple.com/auth/keys` | Apple | JWKS |

## 6. UX surface

- **Settings → Accounts**: list of connected accounts with provider badge, label, last-used date, [Manage] [Disconnect].
- **Module headers** (Drive, Email, Radar): when more than one account has the relevant capability, show an account switcher.
- **First connection flow**: triggered when the user enables a capability needing a provider. After consent, the user lands back on the module.
- **Disconnect dialog**: type-to-confirm. Lists what will be wiped (cached audit, whitelists, broker progress for that account).

## 7. Free vs Premium

- Free tier: connect **up to 2 accounts** total (any provider). TierGate feature `accounts-max`.
- Premium: unlimited accounts.
- Why a free cap: discourages connecting many test accounts; reduces support load. 2 covers personal + work for the typical user.

## 8. Errors

```ts
export type IdentityError =
  | { kind: "user-cancelled" }
  | { kind: "consent-denied" }
  | { kind: "scope-denied"; scopes: string[] }
  | { kind: "token-expired-no-refresh"; accountId: AccountId }
  | { kind: "id-token-invalid"; reason: string }
  | { kind: "rate-limited"; retryAfterSec: number }
  | { kind: "provider-unreachable" };
```

UI surfaces each kind with dedicated copy. Never throw raw `Error`.

## 9. Test contract

- Fakes for each `IdentityProvider` under `tests/fakes/identity/`.
- E2E test seed: provision two test Google accounts (per `docs/testing-fixtures.md`); add both via `add()`; assert independent namespaces; revoke one; assert other persists.
- JWKS validation tests use known vectors (Google's published demo tokens are not valid for production but are useful for unit-testing the validator path).

## 10. What's deferred

- Cross-device sync of preferences. Requires server. Constitutional question.
- ShieldMe-issued JWTs (custom session tokens). Not needed.
- Social login (LinkedIn, GitHub) for a "ShieldMe account" — also not needed for MVP.
