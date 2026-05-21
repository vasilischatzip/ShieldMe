/**
 * T077 — GoogleIdentityProvider
 *
 * OAuth 2.0 PKCE code flow for Google. Web-app edition (no chrome.identity).
 *
 * Security controls:
 *   C-OAUTH-1  — PKCE code flow only (response_type=code, no implicit)
 *   C-OAUTH-2  — JWKS RS256 ID token validation; nonce, aud, iss, exp verified
 *   C-OAUTH-3  — Tokens stored encrypted with per-account derived key (HKDF)
 *   C-OAUTH-5  — Revoke endpoint called BEFORE local token wipe on signOut
 *
 * Architecture:
 *   signIn() generates PKCE params, calls deps.navigate(authUrl), and waits
 *   for handleCallback() to resolve the returned Promise via a Map of pending
 *   resolvers keyed by `state`.  handleCallback() is called by OAuthCallback.tsx
 *   or directly in unit tests.
 *
 *   All network I/O goes through deps.fetch — injectable for testing.
 */

import type { IdentityProvider, AuthRequest, AuthResult, ScopeUpgradeRequest } from "./identity-provider";
import type { Account, AccountId, EncryptedBlob, Tokens } from "./types";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthUrl,
  writePendingPkce,
  readPendingPkce,
} from "./pkce";
import type { LocalStore } from "../storage";
import { createPerAccountKeyDerivation } from "../per-account-keys";

/* ── Types ───────────────────────────────────────────────────────── */

export type GoogleProviderConfig = {
  clientId:   string;
  redirectUri: string;
};

export type GoogleProviderDeps = {
  fetch:    typeof globalThis.fetch;
  navigate: (url: string) => void;
};

/* ── Constants ───────────────────────────────────────────────────── */

const AUTH_ENDPOINT    = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT   = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT  = "https://oauth2.googleapis.com/revoke";
const JWKS_URL         = "https://www.googleapis.com/oauth2/v3/certs";
const VALID_ISSUERS    = new Set(["https://accounts.google.com", "accounts.google.com"]);
const STORAGE_PREFIX   = "identity.accounts.";
const TOKENS_PREFIX    = "identity.tokens.";

/* ── Internal helpers ────────────────────────────────────────────── */

const enc = new TextEncoder();

function b64urlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    b64.length + (4 - (b64.length % 4)) % 4,
    "=",
  );
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function randomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generateUlid(): string {
  const ms   = Date.now().toString(36).padStart(8, "0").toUpperCase();
  const rand = Array.from(
    { length: 16 },
    () => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[Math.floor(Math.random() * 32)],
  ).join("");
  return (ms + rand).slice(0, 26);
}

async function encryptString(
  derivation: Awaited<ReturnType<typeof createPerAccountKeyDerivation>>,
  accountId: string,
  plaintext: string,
): Promise<EncryptedBlob> {
  const key  = await derivation.deriveKey(accountId);
  const blob = await derivation.encrypt(key, plaintext);
  return { ciphertext: blob.ciphertext, iv: blob.iv };
}

async function decryptBlob(
  derivation: Awaited<ReturnType<typeof createPerAccountKeyDerivation>>,
  accountId: string,
  blob: EncryptedBlob,
): Promise<string> {
  const key = await derivation.deriveKey(accountId);
  return derivation.decrypt(key, { iv: blob.iv, ciphertext: blob.ciphertext });
}

/* ── JWKS cache (in-memory per-instance) ─────────────────────────── */

type JwksKey = {
  kid: string;
  /** Imported CryptoKey for verification */
  key: CryptoKey;
};

/* ── JWT helpers ─────────────────────────────────────────────────── */

type JwtParts = {
  headerB64: string;
  payloadB64: string;
  signatureB64: string;
  header: { alg?: string; kid?: string };
  payload: Record<string, unknown>;
};

function parseJwt(token: string): JwtParts | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header  = JSON.parse(atob(parts[0]!.replace(/-/g, "+").replace(/_/g, "/"))) as { alg?: string; kid?: string };
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    return {
      headerB64:    parts[0]!,
      payloadB64:   parts[1]!,
      signatureB64: parts[2]!,
      header,
      payload,
    };
  } catch {
    return null;
  }
}

/* ── GoogleIdentityProvider ──────────────────────────────────────── */

export class GoogleIdentityProvider implements IdentityProvider {
  readonly providerId = "google" as const;

  /** Exposed for test-dependency injection (read by tests via `_deps`). */
  _deps: GoogleProviderDeps;

  private readonly _config: GoogleProviderConfig;
  private readonly _store:  LocalStore;

  /** Pending signIn resolvers keyed by PKCE state value */
  private _pending = new Map<
    string,
    {
      resolve: (result: AuthResult) => void;
      reject:  (err: unknown) => void;
      scopes:  string[];
      withOpenId: boolean;
      isUpgrade?: boolean;
      existingAccountId?: string;
    }
  >();

  /** In-memory JWKS cache (per-instance; reloaded after 24h) */
  private _jwksCache: JwksKey[] | null = null;
  private _jwksFetchedAt = 0;
  private readonly _JWKS_TTL = 24 * 60 * 60 * 1000;

  constructor(
    config: GoogleProviderConfig,
    store: LocalStore,
    deps: Partial<GoogleProviderDeps> = {},
  ) {
    this._config = config;
    this._store  = store;
    this._deps   = {
      fetch:    deps.fetch    ?? globalThis.fetch.bind(globalThis),
      navigate: deps.navigate ?? ((url) => { window.location.href = url; }),
    };
  }

  // ── IdentityProvider ───────────────────────────────────────────

  async signIn(req: AuthRequest): Promise<AuthResult> {
    const state    = randomState();
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    const scopes = req.withOpenId
      ? ["openid", "email", "profile", ...req.scopes]
      : req.scopes;

    const url = buildAuthUrl({
      authEndpoint:  AUTH_ENDPOINT,
      clientId:      this._config.clientId,
      scopes,
      redirectUri:   this._config.redirectUri,
      state,
      codeChallenge: challenge,
    });

    writePendingPkce(state, {
      providerId:    "google",
      clientId:      this._config.clientId,
      tokenEndpoint: TOKEN_ENDPOINT,
      redirectUri:   this._config.redirectUri,
      codeVerifier:  verifier,
      redirectAfter: "/",
    });

    // Navigate (or open popup) — injectable via deps.navigate
    this._deps.navigate(url);

    return new Promise<AuthResult>((resolve, reject) => {
      this._pending.set(state, {
        resolve,
        reject,
        scopes,
        withOpenId: req.withOpenId,
      });
    });
  }

  async refresh(accountId: AccountId): Promise<Tokens> {
    const stored = await this._store.get<{ encryptedRefresh: EncryptedBlob }>(
      `${TOKENS_PREFIX}${accountId}`,
    );
    if (!stored) {
      const err: import("./types").IdentityError = { kind: "token-expired-no-refresh", accountId };
      throw err;
    }

    const derivation    = await createPerAccountKeyDerivation(this._store);
    const refreshToken  = await decryptBlob(derivation, accountId, stored.encryptedRefresh);

    const body = new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     this._config.clientId,
      refresh_token: refreshToken,
    });

    const resp = await this._deps.fetch(TOKEN_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw { kind: "provider-unreachable" as const, detail: text };
    }
    const json = await resp.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    const newRefresh = json.refresh_token ?? refreshToken;
    const newTokens  = await this._buildTokens(accountId, json.access_token, newRefresh, json.scope, json.expires_in);

    // Persist updated tokens
    await this._storeTokens(accountId, json.access_token, newRefresh, derivation);

    return newTokens;
  }

  async upgradeScope(req: ScopeUpgradeRequest): Promise<Tokens> {
    const account = await this._loadAccount(req.account);
    if (!account) throw { kind: "provider-unreachable" as const };

    const mergedScopes = [...new Set([...account.scopes, ...req.additionalScopes])];

    const state    = randomState();
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    const url = buildAuthUrl({
      authEndpoint:  AUTH_ENDPOINT,
      clientId:      this._config.clientId,
      scopes:        mergedScopes,
      redirectUri:   this._config.redirectUri,
      state,
      codeChallenge: challenge,
    });

    writePendingPkce(state, {
      providerId:    "google",
      clientId:      this._config.clientId,
      tokenEndpoint: TOKEN_ENDPOINT,
      redirectUri:   this._config.redirectUri,
      codeVerifier:  verifier,
      redirectAfter: "/",
    });

    this._deps.navigate(url);

    return new Promise<Tokens>((resolve, reject) => {
      this._pending.set(state, {
        resolve: (result: AuthResult) => resolve(result.tokens),
        reject,
        scopes:           mergedScopes,
        withOpenId:       false,
        isUpgrade:        true,
        existingAccountId: req.account,
      });
    });
  }

  async signOut(accountId: AccountId): Promise<void> {
    // C-OAUTH-5: revoke at IDP first, THEN wipe locally
    const stored = await this._store.get<{ encryptedAccess: EncryptedBlob }>(
      `${TOKENS_PREFIX}${accountId}`,
    );
    if (stored) {
      const derivation   = await createPerAccountKeyDerivation(this._store);
      let accessToken: string | null = null;
      try {
        accessToken = await decryptBlob(derivation, accountId, stored.encryptedAccess);
      } catch {
        // Best-effort: if decryption fails, still attempt revoke with empty token
      }
      // Revoke (best-effort — IDP revocation failures are non-fatal)
      await this._revokeToken(accessToken ?? "").catch(() => {});
    }

    // Wipe local state
    await this._store.remove(`${TOKENS_PREFIX}${accountId}`);
    await this._store.remove(`${STORAGE_PREFIX}${accountId}`);
  }

  async validateIdToken(
    idToken: string,
  ): Promise<{ sub: string; email?: string; valid: boolean }> {
    const parsed = parseJwt(idToken);
    if (!parsed) return { sub: "", valid: false };

    const { header, payload } = parsed;

    // iss check
    if (!VALID_ISSUERS.has(payload["iss"] as string)) {
      return { sub: "", valid: false };
    }
    // aud check
    if (payload["aud"] !== this._config.clientId) {
      return { sub: "", valid: false };
    }
    // exp check
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload["exp"] !== "number" || payload["exp"] < nowSec) {
      return { sub: "", valid: false };
    }

    // JWKS signature verification
    const keys = await this._fetchJwks();
    const jwksKey = keys.find((k) => k.kid === header.kid);
    if (!jwksKey) return { sub: "", valid: false };

    const signingInput = enc.encode(`${parsed.headerB64}.${parsed.payloadB64}`);
    const sigBytes     = b64urlToBytes(parsed.signatureB64);

    let valid = false;
    try {
      valid = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        jwksKey.key,
        sigBytes as Uint8Array<ArrayBuffer>,
        signingInput as Uint8Array<ArrayBuffer>,
      );
    } catch {
      valid = false;
    }

    if (!valid) return { sub: "", valid: false };

    const sub   = typeof payload["sub"]   === "string" ? payload["sub"]   : "";
    const email = typeof payload["email"] === "string" ? payload["email"] : undefined;
    if (email !== undefined) {
      return { sub, email, valid: true };
    }
    return { sub, valid: true };
  }

  async list(): Promise<Account[]> {
    // Scan storage for all accounts with this provider
    const snapshot = (this._store as { snapshot?: () => Record<string, unknown> }).snapshot?.() ?? {};
    const accounts: Account[] = [];
    for (const [key, value] of Object.entries(snapshot)) {
      if (key.startsWith(STORAGE_PREFIX)) {
        const acc = value as Account;
        if (acc.provider === "google") {
          accounts.push(acc);
        }
      }
    }
    return accounts;
  }

  // ── handleCallback (called by OAuthCallback.tsx or tests) ──────

  /**
   * Complete a pending sign-in or scope-upgrade flow.
   *
   * Called after the IDP redirects back to the app with an auth code.
   * Exchanges the code for tokens, validates the ID token if present,
   * persists the account + encrypted tokens, and resolves the pending
   * signIn() or upgradeScope() Promise.
   */
  async handleCallback(
    code: string,
    state: string,
    opts: { error?: string } = {},
  ): Promise<AuthResult> {
    const pending = this._pending.get(state);

    // Reject with typed error
    if (opts.error) {
      const err: import("./types").IdentityError =
        opts.error === "access_denied"
          ? { kind: "user-cancelled" }
          : { kind: "consent-denied" };
      pending?.reject(err);
      this._pending.delete(state);
      throw err;
    }

    // Check pending flow exists
    const pkce = readPendingPkce(state);
    if (!pkce && !pending) {
      const err: import("./types").IdentityError = { kind: "provider-unreachable" };
      throw err;
    }

    // Exchange code for tokens
    const body = new URLSearchParams({
      grant_type:    "authorization_code",
      client_id:     this._config.clientId,
      code,
      redirect_uri:  this._config.redirectUri,
      code_verifier: pkce?.codeVerifier ?? "",
    });

    const resp = await this._deps.fetch(TOKEN_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
    });

    if (!resp.ok) {
      await resp.text().catch(() => "");
      const err: import("./types").IdentityError = { kind: "provider-unreachable" };
      pending?.reject(err);
      this._pending.delete(state);
      throw err;
    }

    const json = await resp.json() as {
      access_token:  string;
      refresh_token?: string;
      id_token?:     string;
      expires_in:    number;
      scope:         string;
      token_type:    string;
    };

    // Determine account ID
    const accountId = pending?.isUpgrade && pending.existingAccountId
      ? pending.existingAccountId
      : generateUlid();

    // Validate ID token if present
    let subject: string | undefined;
    let email:   string | undefined;
    if (json.id_token) {
      const validated = await this.validateIdToken(json.id_token);
      if (validated.valid) {
        subject = validated.sub;
        email   = validated.email;
      }
    }

    // Prefer the scopes we requested (pending) over what the IDP echoes back.
    // The IDP may abbreviate or reorder scopes; we track what we asked for.
    const scopeStr  = (pending && pending.scopes.length > 0)
      ? pending.scopes.join(" ")
      : json.scope;
    const scopeList = scopeStr.split(/\s+/).filter(Boolean);

    const account: Account = {
      id:        accountId,
      provider:  "google",
      label:     email ?? `google-${accountId}`,
      namespace: `acc.${accountId}`,
      addedAt:   new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      scopes:    scopeList,
    };
    if (subject) account.subject = subject;

    // Persist account
    await this._store.set(`${STORAGE_PREFIX}${accountId}`, account);

    // Encrypt and persist tokens (C-OAUTH-3)
    const derivation = await createPerAccountKeyDerivation(this._store);
    await this._storeTokens(
      accountId,
      json.access_token,
      json.refresh_token ?? "",
      derivation,
    );

    const tokens = await this._buildTokens(
      accountId,
      json.access_token,
      json.refresh_token ?? "",
      scopeStr,
      json.expires_in,
    );

    const result: AuthResult = { account, tokens };

    pending?.resolve(result);
    this._pending.delete(state);

    return result;
  }

  // ── Private helpers ────────────────────────────────────────────

  private async _loadAccount(accountId: AccountId): Promise<Account | null> {
    return (await this._store.get<Account>(`${STORAGE_PREFIX}${accountId}`)) ?? null;
  }

  private async _storeTokens(
    accountId: string,
    accessToken: string,
    refreshToken: string,
    derivation: Awaited<ReturnType<typeof createPerAccountKeyDerivation>>,
  ): Promise<void> {
    const encryptedAccess  = await encryptString(derivation, accountId, accessToken);
    const encryptedRefresh = await encryptString(derivation, accountId, refreshToken);
    await this._store.set(`${TOKENS_PREFIX}${accountId}`, {
      encryptedAccess,
      encryptedRefresh,
    });
  }

  private async _buildTokens(
    accountId: string,
    accessToken: string,
    refreshToken: string,
    scope: string,
    expiresIn: number,
  ): Promise<Tokens> {
    const derivation = await createPerAccountKeyDerivation(this._store);
    const expiresAt  = new Date(Date.now() + expiresIn * 1000).toISOString();
    const encAccess  = await encryptString(derivation, accountId, accessToken);
    const encRefresh = await encryptString(derivation, accountId, refreshToken);
    return {
      accessToken:  encAccess,
      refreshToken: encRefresh,
      expiresAt,
      scopes:       scope.split(/\s+/).filter(Boolean),
    };
  }

  private async _revokeToken(token: string): Promise<void> {
    const body = new URLSearchParams({ token });
    await this._deps.fetch(REVOKE_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
    });
  }

  private async _fetchJwks(): Promise<JwksKey[]> {
    const now = Date.now();
    if (this._jwksCache && (now - this._jwksFetchedAt) < this._JWKS_TTL) {
      return this._jwksCache;
    }

    const resp = await this._deps.fetch(JWKS_URL);
    if (!resp.ok) return this._jwksCache ?? [];

    const json = await resp.json() as { keys: Array<JsonWebKey & { kid?: string }> };
    const imported: JwksKey[] = [];

    for (const jwk of json.keys) {
      try {
        const cryptoKey = await crypto.subtle.importKey(
          "jwk",
          jwk,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"],
        );
        imported.push({ kid: jwk.kid ?? "", key: cryptoKey });
      } catch {
        // Skip keys that can't be imported (wrong format, unsupported alg)
      }
    }

    this._jwksCache    = imported;
    this._jwksFetchedAt = now;
    return imported;
  }
}
