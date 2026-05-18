/**
 * PKCE helpers for browser-native OAuth 2.0 PKCE flows.
 *
 * No chrome.identity. Uses Web Crypto + window.location.
 */

export type TokenResponse = {
  access_token:   string;
  refresh_token?: string;
  id_token?:      string;
  expires_in:     number;
  scope:          string;
  token_type:     string;
};

/* ── Code verifier / challenge ──────────────────────────────── */

/**
 * Generates a 96-byte random URL-safe base64 code verifier.
 * RFC 7636 §4.1 — recommended 43–128 char; 96 bytes → 128-char base64url.
 */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(96);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/**
 * Computes S256 code challenge: BASE64URL(SHA-256(ASCII(code_verifier))).
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest  = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToBase64Url(new Uint8Array(digest));
}

/* ── URL builders ───────────────────────────────────────────── */

export type BuildAuthUrlOpts = {
  authEndpoint:  string;
  clientId:      string;
  scopes:        string[];
  redirectUri:   string;
  state:         string;
  codeChallenge: string;
};

export function buildAuthUrl(opts: BuildAuthUrlOpts): string {
  const params = new URLSearchParams({
    response_type:         "code",
    client_id:             opts.clientId,
    redirect_uri:          opts.redirectUri,
    scope:                 opts.scopes.join(" "),
    state:                 opts.state,
    code_challenge:        opts.codeChallenge,
    code_challenge_method: "S256",
    access_type:           "offline",
    prompt:                "consent",
  });
  return `${opts.authEndpoint}?${params.toString()}`;
}

/* ── Token exchange ─────────────────────────────────────────── */

export type ExchangeCodeOpts = {
  tokenEndpoint: string;
  clientId:      string;
  code:          string;
  redirectUri:   string;
  codeVerifier:  string;
};

export async function exchangeCodeForTokens(opts: ExchangeCodeOpts): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type:    "authorization_code",
    client_id:     opts.clientId,
    code:          opts.code,
    redirect_uri:  opts.redirectUri,
    code_verifier: opts.codeVerifier,
  });
  const resp = await fetch(opts.tokenEndpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => `(status ${resp.status})`);
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }
  return resp.json() as Promise<TokenResponse>;
}

/* ── Token refresh ──────────────────────────────────────────── */

export type RefreshTokenOpts = {
  tokenEndpoint: string;
  clientId:      string;
  refreshToken:  string;
};

export async function refreshAccessToken(opts: RefreshTokenOpts): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    client_id:     opts.clientId,
    refresh_token: opts.refreshToken,
  });
  const resp = await fetch(opts.tokenEndpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => `(status ${resp.status})`);
    throw new Error(`Token refresh failed (${resp.status}): ${text}`);
  }
  return resp.json() as Promise<TokenResponse>;
}

/* ── Token revocation ───────────────────────────────────────── */

export type RevokeTokenOpts = {
  revokeEndpoint: string;
  token:          string;
};

export async function revokeToken(opts: RevokeTokenOpts): Promise<void> {
  const body = new URLSearchParams({ token: opts.token });
  await fetch(opts.revokeEndpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  // Revocation failures are intentionally ignored (best-effort sign-out)
}

/* ── Pending-flow storage (sessionStorage) ──────────────────── */

/**
 * Bookkeeping for an in-flight PKCE flow. Stored in `sessionStorage` keyed by
 * `state` so the OAuth callback page can look up the verifier and the page
 * the user should land on after token exchange.
 */
export type PendingPkce = {
  providerId: "google" | "microsoft" | "apple";
  clientId: string;
  tokenEndpoint: string;
  redirectUri: string;
  codeVerifier: string;
  redirectAfter: string;
};

const PKCE_PREFIX = "shieldme.pkce.";

export function writePendingPkce(state: string, pending: PendingPkce): void {
  sessionStorage.setItem(PKCE_PREFIX + state, JSON.stringify(pending));
}

export function readPendingPkce(state: string): PendingPkce | null {
  const raw = sessionStorage.getItem(PKCE_PREFIX + state);
  if (!raw) return null;
  sessionStorage.removeItem(PKCE_PREFIX + state);
  try {
    return JSON.parse(raw) as PendingPkce;
  } catch {
    return null;
  }
}

/* ── Internal helpers ───────────────────────────────────────── */

function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
