/**
 * DriveClient — T037 (SPA pivot).
 *
 * Thin OAuth PKCE + Drive REST v3 client for ShieldMe.
 *
 * Responsibilities:
 *   • Acquire an OAuth access token via browser-native PKCE redirect flow.
 *   • List all files in Drive with pagination (files.list, nextPageToken loop).
 *   • Download file content (files.get?alt=media) respecting the token bucket.
 *   • Token-bucket throttle: max 5 concurrent requests, ~8 req/s refill.
 *   • Retry: 403 userRateLimitExceeded → exponential backoff (1 s, 2 s … 60 s).
 *             429 → honour Retry-After header.
 *   • Incremental re-audit support: store/load startPageToken via LocalStore.
 *
 * Contract: docs/engineering-qa.md §Q4
 *
 * OAuth flow:
 *   connect()  — generates verifier+challenge, persists verifier in sessionStorage,
 *                redirects to Google's auth page.
 *   OAuthCallback route (TP7) — on redirect-back, calls exchangeCodeForTokens,
 *                               stores tokens in LocalStore, redirects to /cloud.
 *   disconnect() — calls revokeToken, wipes tokens from storage.
 */

import { localStore } from "~/core/storage";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthUrl,
  refreshAccessToken,
  revokeToken,
  type TokenResponse,
} from "~/core/identity/pkce";

/* ── OAuth config ─────────────────────────────────────────── */

const GOOGLE_AUTH_ENDPOINT  = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

// Client ID must be set via VITE_GOOGLE_CLIENT_ID env var.
// In production this is a public-client ID (no client_secret for SPAs).
const CLIENT_ID: string = (import.meta.env?.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";

/** OAuth scopes required for Drive audit. */
export const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/* ── Storage keys ─────────────────────────────────────────── */

const STORAGE_KEY_PAGE_TOKEN    = "drive.changesStartPageToken";
const STORAGE_KEY_ACCESS_TOKEN  = "drive.accessToken";
const STORAGE_KEY_REFRESH_TOKEN = "drive.refreshToken";
const STORAGE_KEY_EXPIRES_AT    = "drive.expiresAt";
const SESSION_KEY_VERIFIER      = "shieldme.pkce.verifier";
const SESSION_KEY_STATE         = "shieldme.pkce.state";

/* ── Drive API types ─────────────────────────────────────────── */

export type DrivePermission = {
  id:           string;
  type:         "user" | "group" | "domain" | "anyone";
  role:         "owner" | "organizer" | "fileOrganizer" | "writer" | "commenter" | "reader";
  emailAddress?: string;
  domain?:       string;
  allowFileDiscovery?: boolean;
  displayName?:  string;
  deleted?:      boolean;
};

export type DriveFile = {
  id:             string;
  name:           string;
  mimeType:       string;
  modifiedTime:   string;    // RFC 3339
  owners?:        Array<{ emailAddress: string; displayName: string }>;
  sharedWithMeTime?: string;
  permissions?:   DrivePermission[];
  parents?:       string[];
  webViewLink?:   string;
};

export type FilesListResponse = {
  nextPageToken?: string;
  files:          DriveFile[];
};

export type ChangesListResponse = {
  nextPageToken?:  string;
  newStartPageToken?: string;
  changes: Array<{
    fileId:  string;
    removed: boolean;
    file?:   DriveFile;
  }>;
};

export type StartPageTokenResponse = {
  startPageToken: string;
};

/* ── Drive API endpoints ─────────────────────────────────────── */

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const CHANGES_ENDPOINT     = "https://www.googleapis.com/drive/v3/changes";

const TOKEN_BUCKET_CAPACITY  = 5;
const REFILL_RATE_MS         = 125;
const MAX_BACKOFF_MS         = 60_000;

/* ── Token bucket ─────────────────────────────────────────────── */

class TokenBucket {
  private tokens:     number;
  private lastRefill: number;
  private queue:      Array<() => void> = [];

  constructor(
    private readonly capacity: number,
    private readonly refillMs: number,
  ) {
    this.tokens     = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now     = Date.now();
    const elapsed = now - this.lastRefill;
    const gained  = Math.floor(elapsed / this.refillMs);
    if (gained > 0) {
      this.tokens     = Math.min(this.capacity, this.tokens + gained);
      this.lastRefill = now;
    }
  }

  acquire(): Promise<void> {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return Promise.resolve();
    }
    return new Promise(resolve => { this.queue.push(resolve); });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      setTimeout(next, this.refillMs);
    } else {
      this.refill();
      this.tokens = Math.min(this.capacity, this.tokens + 1);
    }
  }
}

/* ── Error types ──────────────────────────────────────────────── */

export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveAuthError";
  }
}

export class DriveRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Drive rate limit — retry after ${retryAfterMs} ms`);
    this.name = "DriveRateLimitError";
  }
}

export class DriveApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Drive API ${status}: ${message}`);
    this.name = "DriveApiError";
  }
}

/* ── Client interface ─────────────────────────────────────────── */

export interface DriveClient {
  /** Initiate PKCE OAuth redirect. Stores verifier in sessionStorage. */
  connect(): Promise<void>;

  /** Acquire a valid access token from storage (refreshing if expired). */
  getToken(): Promise<string>;

  /** Revoke the stored OAuth token (sign-out). */
  revokeToken(): Promise<void>;

  /** Store tokens received from OAuth callback. */
  storeTokens(tokens: TokenResponse): Promise<void>;

  listFiles(fields?: string): AsyncGenerator<DriveFile[], void, void>;
  listChanges(): AsyncGenerator<Array<{ fileId: string; removed: boolean; file?: DriveFile }>, void, void>;
  downloadFile(fileId: string): Promise<ArrayBuffer>;
  saveStartPageToken(token: string): Promise<void>;
  loadStartPageToken(): Promise<string | undefined>;
}

/* ── Fields string for files.list ────────────────────────────── */

export const DEFAULT_LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,modifiedTime,owners,sharedWithMeTime,permissions,parents,webViewLink)";

/* ── Factory ─────────────────────────────────────────────────── */

export type DriveClientOpts = {
  fetchFn?:        typeof fetch;
  store?:          { get<T>(k: string): Promise<T | undefined>; set<T>(k: string, v: T): Promise<void> };
  bucketCapacity?: number;
  refillMs?:       number;
  clientId?:       string;
  redirectUri?:    string;
};

export function createDriveClient(opts: DriveClientOpts = {}): DriveClient {
  const fetchFn   = opts.fetchFn ?? fetch.bind(globalThis);
  const store     = opts.store   ?? localStore;
  const clientId  = opts.clientId ?? CLIENT_ID;
  const redirectUri = opts.redirectUri ?? (typeof window !== "undefined"
    ? `${window.location.origin}/oauth/callback`
    : "http://localhost:5173/oauth/callback");
  const bucket    = new TokenBucket(
    opts.bucketCapacity ?? TOKEN_BUCKET_CAPACITY,
    opts.refillMs       ?? REFILL_RATE_MS,
  );

  // ── PKCE connect ──────────────────────────────────────────────
  async function connect(): Promise<void> {
    const verifier   = generateCodeVerifier();
    const challenge  = await generateCodeChallenge(verifier);
    const state      = generateCodeVerifier().slice(0, 32);

    sessionStorage.setItem(SESSION_KEY_VERIFIER, verifier);
    sessionStorage.setItem(SESSION_KEY_STATE,    state);

    const url = buildAuthUrl({
      authEndpoint:  GOOGLE_AUTH_ENDPOINT,
      clientId,
      scopes:        [DRIVE_READONLY_SCOPE],
      redirectUri,
      state,
      codeChallenge: challenge,
    });

    window.location.href = url;
  }

  // ── Token storage ─────────────────────────────────────────────
  async function storeTokens(tokens: TokenResponse): Promise<void> {
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    await store.set(STORAGE_KEY_ACCESS_TOKEN,  tokens.access_token);
    await store.set(STORAGE_KEY_EXPIRES_AT,    expiresAt);
    if (tokens.refresh_token) {
      await store.set(STORAGE_KEY_REFRESH_TOKEN, tokens.refresh_token);
    }
  }

  // ── Get a valid access token ──────────────────────────────────
  async function getToken(): Promise<string> {
    const accessToken = await store.get<string>(STORAGE_KEY_ACCESS_TOKEN);
    const expiresAt   = await store.get<number>(STORAGE_KEY_EXPIRES_AT);

    const isExpired = !expiresAt || Date.now() >= expiresAt - 60_000;

    if (accessToken && !isExpired) return accessToken;

    // Try to refresh
    const refreshToken = await store.get<string>(STORAGE_KEY_REFRESH_TOKEN);
    if (!refreshToken) {
      throw new DriveAuthError("Not connected to Drive — call connect() first");
    }

    const newTokens = await refreshAccessToken({
      tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
      clientId,
      refreshToken,
    });
    await storeTokens(newTokens);
    return newTokens.access_token;
  }

  // ── Revoke ────────────────────────────────────────────────────
  async function revokeStoredToken(): Promise<void> {
    const token = await store.get<string>(STORAGE_KEY_ACCESS_TOKEN);
    if (token) {
      await revokeToken({ revokeEndpoint: GOOGLE_REVOKE_ENDPOINT, token });
    }
    await store.set(STORAGE_KEY_ACCESS_TOKEN,  "");
    await store.set(STORAGE_KEY_REFRESH_TOKEN, "");
    await store.set(STORAGE_KEY_EXPIRES_AT,    0);
  }

  // ── Throttled fetch with retry ─────────────────────────────────────
  async function throttledFetch(url: string, token: string, attempt = 0): Promise<Response> {
    await bucket.acquire();
    let resp: Response;
    try {
      resp = await fetchFn(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } finally {
      bucket.release();
    }

    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get("Retry-After") ?? "5", 10) * 1000;
      await sleep(retryAfter);
      return throttledFetch(url, token, attempt + 1);
    }

    if (resp.status === 403) {
      let body: Record<string, unknown> = {};
      try { body = (await resp.clone().json()) as Record<string, unknown>; } catch { /* ignore */ }
      const errObj = body["error"] as Record<string, unknown> | undefined;
      const errors = errObj?.["errors"] as Array<{ reason?: string }> | undefined;
      const isRateLimit = errors?.some(
        e => e.reason === "userRateLimitExceeded" || e.reason === "rateLimitExceeded",
      );
      if (isRateLimit && attempt < 6) {
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt + Math.random() * 500);
        await sleep(backoff);
        return throttledFetch(url, token, attempt + 1);
      }
    }

    return resp;
  }

  // ── files.list ────────────────────────────────────────────────
  async function* listFiles(fields = DEFAULT_LIST_FIELDS): AsyncGenerator<DriveFile[], void, void> {
    const token = await getToken();
    let pageToken: string | undefined;

    do {
      const url = buildUrl(DRIVE_FILES_ENDPOINT, {
        fields,
        pageSize: "1000",
        ...(pageToken ? { pageToken } : {}),
      });
      const resp = await throttledFetch(url, token);
      if (!resp.ok) {
        const msg = await safeText(resp);
        throw new DriveApiError(resp.status, msg);
      }
      const page = (await resp.json()) as FilesListResponse;
      if (page.files.length > 0) yield page.files;
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  // ── changes.list ──────────────────────────────────────────────
  async function* listChanges(): AsyncGenerator<
    Array<{ fileId: string; removed: boolean; file?: DriveFile }>,
    void,
    void
  > {
    const token       = await getToken();
    const storedToken = await loadStartPageToken();

    if (!storedToken) {
      const stUrl  = buildUrl(`${CHANGES_ENDPOINT}/startPageToken`, {});
      const stResp = await throttledFetch(stUrl, token);
      if (stResp.ok) {
        const stData = (await stResp.json()) as StartPageTokenResponse;
        await saveStartPageToken(stData.startPageToken);
      }
      return;
    }

    let pageToken: string | undefined = storedToken;

    while (pageToken) {
      const url = buildUrl(CHANGES_ENDPOINT, {
        pageToken,
        fields:   "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,permissions,owners,webViewLink))",
        pageSize: "1000",
      });
      const resp = await throttledFetch(url, token);
      if (!resp.ok) {
        const msg = await safeText(resp);
        throw new DriveApiError(resp.status, msg);
      }
      const page = (await resp.json()) as ChangesListResponse;
      if (page.changes.length > 0) yield page.changes;
      if (page.newStartPageToken) {
        await saveStartPageToken(page.newStartPageToken);
        break;
      }
      pageToken = page.nextPageToken;
    }
  }

  // ── files.get?alt=media ────────────────────────────────────────────
  async function downloadFile(fileId: string): Promise<ArrayBuffer> {
    const token = await getToken();
    const url   = `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`;
    const resp  = await throttledFetch(url, token);
    if (!resp.ok) {
      const msg = await safeText(resp);
      throw new DriveApiError(resp.status, msg);
    }
    return resp.arrayBuffer();
  }

  // ── startPageToken persistence ─────────────────────────────────────
  async function saveStartPageToken(token: string): Promise<void> {
    await store.set(STORAGE_KEY_PAGE_TOKEN, token);
  }

  async function loadStartPageToken(): Promise<string | undefined> {
    return store.get<string>(STORAGE_KEY_PAGE_TOKEN);
  }

  return {
    connect,
    getToken,
    revokeToken: revokeStoredToken,
    storeTokens,
    listFiles,
    listChanges,
    downloadFile,
    saveStartPageToken,
    loadStartPageToken,
  };
}

/* ── Production singleton ────────────────────────────────────── */

export const driveClient: DriveClient = createDriveClient();

/* ── Helpers ──────────────────────────────────────────────────── */

function buildUrl(base: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return q ? `${base}?${q}` : base;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeText(resp: Response): Promise<string> {
  try { return await resp.text(); } catch { return `(status ${resp.status})`; }
}
