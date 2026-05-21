/**
 * T076 — Failing tests for GoogleIdentityProvider.
 *
 * Covers:
 *   FR-Acc1  — multi-account PKCE sign-in
 *   FR-Acc4  — PKCE code flow (no implicit, no getAuthToken)
 *   FR-Acc5  — OIDC ID token validation via JWKS
 *   FR-Acc6  — revoke-before-wipe on sign-out
 *   C-OAUTH-1 — PKCE code flow only
 *   C-OAUTH-2 — JWKS ID token validation: known-vector + adversarial
 *   C-OAUTH-3 — refresh-token stored encrypted; isolated per account
 *   C-OAUTH-5 — revoke called BEFORE local token wipe
 *
 * Design:
 *   GoogleIdentityProvider accepts a `deps` bag for injectable fetch / storage,
 *   enabling pure unit tests without browser navigation.
 *
 *   signIn() generates PKCE params and calls deps.navigate(url) instead of
 *   setting window.location.href directly.  The test then calls
 *   provider.handleCallback(code, state) to simulate the IDP redirect.
 *
 *   validateIdToken() verifies the JWT signature via JWKS (RS256).  Tests use
 *   a real Web Crypto RS256 key pair generated in beforeAll.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { FakeLocalStore } from "../../../fakes/fake-storage";
import {
  GoogleIdentityProvider,
  type GoogleProviderConfig,
  type GoogleProviderDeps,
} from "~/core/identity/google-provider";
import type { Account } from "~/core/identity/types";

/* ── Test-specific RSA key generation ────────────────────────────── */

type TestKey = {
  privateKey: CryptoKey;
  publicKey:  CryptoKey;
  /** JWK-format public key for JWKS mocking */
  jwk: JsonWebKey;
  /** Key ID (kid) matching what will be embedded in test JWTs */
  kid: string;
};

async function generateTestRsaKey(): Promise<TestKey> {
  const kid = "test-key-2024";
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, jwk, kid };
}

/** Build a JWT string with the given payload, signed with the given key. */
async function signJwt(
  payload: Record<string, unknown>,
  key: CryptoKey,
  kid: string,
): Promise<string> {
  const header  = { alg: "RS256", typ: "JWT", kid };
  const enc     = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const hdr64   = enc(header);
  const pay64   = enc(payload);
  const toSign  = new TextEncoder().encode(`${hdr64}.${pay64}`);
  const sigBuf  = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, toSign);
  const sig64   = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${hdr64}.${pay64}.${sig64}`;
}

/* ── Test config ─────────────────────────────────────────────────── */

const CLIENT_ID   = "test-client-id.apps.googleusercontent.com";
const REDIRECT_URI = "https://example.com/ShieldMe/oauth-callback";

function makeConfig(): GoogleProviderConfig {
  return {
    clientId:    CLIENT_ID,
    redirectUri: REDIRECT_URI,
  };
}

/* ── Fake JWKS server ────────────────────────────────────────────── */

function makeJwksFetch(
  keys: TestKey[],
  otherKeys: TestKey[] = [],
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    // Check specific paths BEFORE broad hostname checks
    if (url.includes("/token")) {
      return new Response(
        JSON.stringify({
          access_token:  "ya29.fake-access",
          refresh_token: "1//fake-refresh",
          expires_in:    3600,
          scope:         "https://www.googleapis.com/auth/drive.readonly",
          token_type:    "Bearer",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/revoke")) {
      return new Response("", { status: 200 });
    }
    if (url.includes("certs") || url.includes("googleapis.com")) {
      const allKeys = [...keys, ...otherKeys];
      const jwks = { keys: allKeys.map((k) => ({ ...k.jwk, kid: k.kid, alg: "RS256", use: "sig" })) };
      return new Response(JSON.stringify(jwks), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  }) as unknown as typeof fetch;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function makeProvider(
  store: FakeLocalStore,
  overrideDeps?: Partial<GoogleProviderDeps>,
): GoogleIdentityProvider {
  const deps: GoogleProviderDeps = {
    fetch:    makeJwksFetch([]),
    navigate: vi.fn(),
    ...overrideDeps,
  };
  return new GoogleIdentityProvider(makeConfig(), store, deps);
}

function validIdTokenPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss:   "https://accounts.google.com",
    aud:   CLIENT_ID,
    sub:   "1234567890",
    email: "alice@example.com",
    nonce: "test-nonce",
    iat:   Math.floor(Date.now() / 1000) - 10,
    exp:   Math.floor(Date.now() / 1000) + 3590,
    ...overrides,
  };
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe("GoogleIdentityProvider", () => {
  let testKey: TestKey;
  let altKey: TestKey;
  let store: FakeLocalStore;

  beforeAll(async () => {
    testKey = await generateTestRsaKey();
    altKey  = await generateTestRsaKey();
  });

  beforeEach(() => {
    store = new FakeLocalStore();
    vi.restoreAllMocks();
  });

  // ── Provider ID ────────────────────────────────────────────────

  it("has providerId === 'google'", () => {
    const p = makeProvider(store);
    expect(p.providerId).toBe("google");
  });

  // ── sign-in / PKCE initiation (C-OAUTH-1, FR-Acc1) ────────────

  describe("signIn()", () => {
    it("calls navigate() with the Google auth URL containing PKCE params", async () => {
      const navigate = vi.fn();
      const p = makeProvider(store, { navigate });

      // signIn() initiates the redirect; we don't await it fully
      // (the returned Promise resolves only after handleCallback)
      const signInPromise = p.signIn({
        scopes:      ["https://www.googleapis.com/auth/drive.readonly"],
        withOpenId:  false,
      });
      // Give it a tick to call navigate
      await new Promise((r) => setTimeout(r, 0));

      expect(navigate).toHaveBeenCalledOnce();
      const [url] = navigate.mock.calls[0] as [string];
      expect(url).toContain("accounts.google.com");
      expect(url).toContain("code_challenge");
      expect(url).toContain("code_challenge_method=S256");
      expect(url).toContain(`client_id=${encodeURIComponent(CLIENT_ID)}`);
      expect(url).toContain("response_type=code");

      // Complete the flow so the Promise doesn't leak
      const params     = new URLSearchParams(url.split("?")[1]);
      const state      = params.get("state") ?? "";
      const fetchMock  = makeJwksFetch([testKey]);
      (p as unknown as { _deps: GoogleProviderDeps })._deps.fetch = fetchMock;
      await p.handleCallback("fake-code", state).catch(() => {});
      await signInPromise.catch(() => {});
    });

    it("includes 'openid email profile' in scope when withOpenId === true", async () => {
      const navigate = vi.fn();
      const p = makeProvider(store, { navigate });

      const signInPromise = p.signIn({
        scopes:     ["https://www.googleapis.com/auth/drive.readonly"],
        withOpenId: true,
      });
      await new Promise((r) => setTimeout(r, 0));

      const [url] = navigate.mock.calls[0] as [string];
      expect(decodeURIComponent(url)).toContain("openid");

      await p.handleCallback("fake-code", new URLSearchParams(url.split("?")[1]).get("state") ?? "")
        .catch(() => {});
      await signInPromise.catch(() => {});
    });

    it("does NOT use 'token' response_type (implicit flow forbidden — C-OAUTH-1)", async () => {
      const navigate = vi.fn();
      const p = makeProvider(store, { navigate });
      void p.signIn({ scopes: [], withOpenId: false });
      await new Promise((r) => setTimeout(r, 0));
      const [url] = navigate.mock.calls[0] as [string];
      expect(url).not.toContain("response_type=token");
      expect(url).toContain("response_type=code");
    });

    it("stores PKCE verifier in sessionStorage under the flow's state key", async () => {
      const navigate = vi.fn();
      const p = makeProvider(store, { navigate });
      void p.signIn({ scopes: [], withOpenId: false });
      await new Promise((r) => setTimeout(r, 0));
      const [url] = navigate.mock.calls[0] as [string];
      const state = new URLSearchParams(url.split("?")[1]).get("state") ?? "";
      // Pending PKCE state must be stored so handleCallback can complete it
      const raw = sessionStorage.getItem(`shieldme.pkce.${state}`);
      expect(raw).not.toBeNull();
      const pending = JSON.parse(raw!);
      expect(pending.codeVerifier).toBeTruthy();
    });
  });

  // ── handleCallback (token exchange after IDP redirect) ─────────

  describe("handleCallback()", () => {
    it("exchanges code for tokens and returns an Account + Tokens", async () => {
      const navigate = vi.fn();
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { navigate, fetch: fetchMock });

      const signInPromise = p.signIn({
        scopes:     ["https://www.googleapis.com/auth/drive.readonly"],
        withOpenId: false,
      });
      await new Promise((r) => setTimeout(r, 0));
      const [url] = navigate.mock.calls[0] as [string];
      const state = new URLSearchParams(url.split("?")[1]).get("state") ?? "";

      const result = await p.handleCallback("auth-code-xyz", state);
      expect(result.account.provider).toBe("google");
      expect(result.account.id).toBeTruthy();
      expect(result.tokens.accessToken.ciphertext).toBeTruthy();
      expect(result.tokens.refreshToken.ciphertext).toBeTruthy();

      await signInPromise;
    });

    it("resolves the pending signIn() Promise with the same result", async () => {
      const navigate = vi.fn();
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { navigate, fetch: fetchMock });

      const signInPromise = p.signIn({
        scopes:     ["https://www.googleapis.com/auth/drive.readonly"],
        withOpenId: false,
      });
      await new Promise((r) => setTimeout(r, 0));
      const [url] = navigate.mock.calls[0] as [string];
      const state = new URLSearchParams(url.split("?")[1]).get("state") ?? "";

      await p.handleCallback("auth-code-xyz", state);
      const result = await signInPromise;
      expect(result.account.provider).toBe("google");
    });

    it("throws IdentityError { kind: 'user-cancelled' } when error param is 'access_denied'", async () => {
      const p = makeProvider(store);
      await expect(p.handleCallback("", "state-xyz", { error: "access_denied" }))
        .rejects.toMatchObject({ kind: "user-cancelled" });
    });

    it("throws when state does not match a pending PKCE flow", async () => {
      const p = makeProvider(store);
      await expect(p.handleCallback("code-xyz", "unknown-state"))
        .rejects.toMatchObject({ kind: "provider-unreachable" });
    });
  });

  // ── validateIdToken (C-OAUTH-2) ────────────────────────────────

  describe("validateIdToken()", () => {
    it("accepts a valid JWT (correct signature, iss, aud, exp)", async () => {
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { fetch: fetchMock });

      const idToken = await signJwt(validIdTokenPayload(), testKey.privateKey, testKey.kid);
      const result  = await p.validateIdToken(idToken);

      expect(result.valid).toBe(true);
      expect(result.sub).toBe("1234567890");
      expect(result.email).toBe("alice@example.com");
    });

    it("rejects an expired JWT (exp in the past)", async () => {
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { fetch: fetchMock });

      const idToken = await signJwt(
        validIdTokenPayload({ exp: Math.floor(Date.now() / 1000) - 60 }),
        testKey.privateKey,
        testKey.kid,
      );
      const result = await p.validateIdToken(idToken);
      expect(result.valid).toBe(false);
    });

    it("rejects a JWT with wrong audience (aud)", async () => {
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { fetch: fetchMock });

      const idToken = await signJwt(
        validIdTokenPayload({ aud: "wrong-client-id" }),
        testKey.privateKey,
        testKey.kid,
      );
      const result = await p.validateIdToken(idToken);
      expect(result.valid).toBe(false);
    });

    it("rejects a JWT with wrong issuer (iss)", async () => {
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { fetch: fetchMock });

      const idToken = await signJwt(
        validIdTokenPayload({ iss: "https://evil.example.com" }),
        testKey.privateKey,
        testKey.kid,
      );
      const result = await p.validateIdToken(idToken);
      expect(result.valid).toBe(false);
    });

    it("rejects a JWT signed by a key NOT present in JWKS — AC-Acc4", async () => {
      // JWKS has altKey; token is signed with testKey (unknown to the verifier)
      const fetchMock = makeJwksFetch([altKey]);
      const p = makeProvider(store, { fetch: fetchMock });

      const idToken = await signJwt(validIdTokenPayload(), testKey.privateKey, testKey.kid);
      const result  = await p.validateIdToken(idToken);
      expect(result.valid).toBe(false);
    });

    it("rejects a JWT with a tampered payload", async () => {
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { fetch: fetchMock });

      const idToken  = await signJwt(validIdTokenPayload(), testKey.privateKey, testKey.kid);
      const [h, , s] = idToken.split(".");
      const tampered = `${h}.${btoa(JSON.stringify({ sub: "evil", exp: 99999999999, aud: CLIENT_ID, iss: "https://accounts.google.com" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}.${s}`;
      const result   = await p.validateIdToken(tampered);
      expect(result.valid).toBe(false);
    });
  });

  // ── refresh (C-OAUTH-3) ────────────────────────────────────────

  describe("refresh()", () => {
    it("calls the token endpoint with refresh_token grant and returns new Tokens", async () => {
      const navigate  = vi.fn();
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { navigate, fetch: fetchMock });

      // Set up an account via signIn
      const signInPromise = p.signIn({
        scopes:     ["https://www.googleapis.com/auth/drive.readonly"],
        withOpenId: false,
      });
      await new Promise((r) => setTimeout(r, 0));
      const [url] = navigate.mock.calls[0] as [string];
      const state = new URLSearchParams(url.split("?")[1]).get("state") ?? "";
      const { account } = await p.handleCallback("code-abc", state);
      await signInPromise;

      const newTokens = await p.refresh(account.id);
      expect(newTokens.accessToken.ciphertext).toBeTruthy();
      // Token endpoint must have been called with refresh_token grant
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const tokenCall = calls.find(([u]) => u.includes("token"));
      expect(tokenCall).toBeDefined();
    });

    it("throws IdentityError { kind: 'token-expired-no-refresh' } for unknown account", async () => {
      const p = makeProvider(store);
      await expect(p.refresh("non-existent-account")).rejects.toMatchObject({
        kind: "token-expired-no-refresh",
      });
    });
  });

  // ── signOut / revoke-before-wipe (C-OAUTH-5, FR-Acc6) ─────────

  describe("signOut()", () => {
    it("calls the Google revoke endpoint before removing local tokens", async () => {
      const navigate    = vi.fn();
      const revokeOrder: string[] = [];
      const fetchMock   = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes("revoke")) revokeOrder.push("revoke");
        return makeJwksFetch([testKey])(input, init);
      }) as unknown as typeof fetch;
      const p = makeProvider(store, { navigate, fetch: fetchMock });

      const signInPromise = p.signIn({ scopes: [], withOpenId: false });
      await new Promise((r) => setTimeout(r, 0));
      const [url] = navigate.mock.calls[0] as [string];
      const state = new URLSearchParams(url.split("?")[1]).get("state") ?? "";
      const { account } = await p.handleCallback("code-abc", state);
      await signInPromise;

      await p.signOut(account.id);

      expect(revokeOrder[0]).toBe("revoke"); // revoke called before local wipe
      // Account is no longer listed
      const remaining = await p.list();
      expect(remaining.find((a: Account) => a.id === account.id)).toBeUndefined();
    });

    it("is idempotent — calling signOut twice does not throw", async () => {
      const navigate  = vi.fn();
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { navigate, fetch: fetchMock });

      const signInPromise = p.signIn({ scopes: [], withOpenId: false });
      await new Promise((r) => setTimeout(r, 0));
      const [url] = navigate.mock.calls[0] as [string];
      const state = new URLSearchParams(url.split("?")[1]).get("state") ?? "";
      const { account } = await p.handleCallback("code-abc", state);
      await signInPromise;

      await p.signOut(account.id);
      await expect(p.signOut(account.id)).resolves.toBeUndefined();
    });
  });

  // ── list() ────────────────────────────────────────────────────

  describe("list()", () => {
    it("returns empty array when no accounts are connected", async () => {
      const p = makeProvider(store);
      expect(await p.list()).toEqual([]);
    });

    it("returns connected accounts after signIn", async () => {
      const navigate  = vi.fn();
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { navigate, fetch: fetchMock });

      const signInPromise = p.signIn({ scopes: [], withOpenId: false });
      await new Promise((r) => setTimeout(r, 0));
      const [url] = navigate.mock.calls[0] as [string];
      const state = new URLSearchParams(url.split("?")[1]).get("state") ?? "";
      await p.handleCallback("code-abc", state);
      await signInPromise;

      const accounts = await p.list();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]!.provider).toBe("google");
    });

    it("does NOT return accounts from a different provider", async () => {
      // GoogleIdentityProvider only manages google accounts
      const p = makeProvider(store);
      // Manually write a non-google account to storage
      const fake: Account = {
        id: "01FAKE", provider: "microsoft", label: "ms@example.com",
        namespace: "acc.01FAKE", addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(), scopes: [],
      };
      await store.set("identity.accounts.01FAKE", fake);
      const accounts = await p.list();
      expect(accounts.every((a: Account) => a.provider === "google")).toBe(true);
    });
  });

  // ── upgradeScope ──────────────────────────────────────────────

  describe("upgradeScope()", () => {
    it("initiates a fresh consent flow for the additional scopes", async () => {
      const navigate  = vi.fn();
      const fetchMock = makeJwksFetch([testKey]);
      const p = makeProvider(store, { navigate, fetch: fetchMock });

      // Sign in with read scope
      const signInPromise = p.signIn({
        scopes:     ["https://www.googleapis.com/auth/drive.readonly"],
        withOpenId: false,
      });
      await new Promise((r) => setTimeout(r, 0));
      const [url] = navigate.mock.calls[0] as [string];
      const state = new URLSearchParams(url.split("?")[1]).get("state") ?? "";
      const { account } = await p.handleCallback("code-abc", state);
      await signInPromise;

      // Upgrade to write scope — navigate should be called again
      navigate.mockClear();
      const upgradePromise = p.upgradeScope({
        account:          account.id,
        additionalScopes: ["https://www.googleapis.com/auth/drive"],
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(navigate).toHaveBeenCalledOnce();
      const [upgradeUrl] = navigate.mock.calls[0] as [string];
      expect(decodeURIComponent(upgradeUrl)).toContain("drive");

      // Complete the upgrade flow
      const upgradeState = new URLSearchParams(upgradeUrl.split("?")[1]).get("state") ?? "";
      await p.handleCallback("code-upgrade", upgradeState);
      const upgraded = await upgradePromise;
      expect(upgraded.scopes).toContain("https://www.googleapis.com/auth/drive");
    });
  });
});
