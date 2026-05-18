/**
 * T044a — BreachedAccount unit tests.
 *
 * Key invariants:
 *   • setKey stores an encrypted envelope (not the plaintext key).
 *   • clearKey removes the stored key.
 *   • check decrypts the key, sends it in hibp-api-key header, never logs it.
 *   • check returns [] for accounts with no breaches (HIBP 404).
 *   • check throws NoKeyError if no key stored.
 *   • Ownership verification runs before any HIBP network call.
 *   • OwnershipError from verifier propagates without calling HIBP.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createBreachedAccount,
  NoKeyError,
  OwnershipError,
  type OwnershipVerifier,
  type BreachEntry,
} from "~/radar/hibp-emails";
import { FakeLocalStore } from "../../fakes/fake-storage";
import { generateWrappingKey, decryptString } from "~/core/crypto";

/* ── Test fixtures ──────────────────────────────────────────────── */

const TEST_HIBP_KEY  = "test-hibp-api-key-abc123";
const TEST_EMAIL     = "user@example.com";
const OTHER_EMAIL    = "other@example.com";

const BREACH_FIXTURE: BreachEntry[] = [
  {
    name:        "Adobe",
    domain:      "adobe.com",
    breachDate:  "2013-10-04",
    dataClasses: ["Email addresses", "Password hints", "Passwords", "Usernames"],
  },
  {
    name:        "LinkedIn",
    domain:      "linkedin.com",
    breachDate:  "2012-05-05",
    dataClasses: ["Email addresses", "Passwords"],
  },
];

// HIBP-shaped raw response (PascalCase)
const RAW_BREACH_RESPONSE = BREACH_FIXTURE.map(e => ({
  Name:        e.name,
  Domain:      e.domain,
  BreachDate:  e.breachDate,
  DataClasses: e.dataClasses,
}));

/* ── Helpers ────────────────────────────────────────────────────── */

function makeAlwaysAllowOwnership(): OwnershipVerifier {
  return vi.fn(async (_email, _proof) => { /* no-op */ });
}

function makeAlwaysDenyOwnership(reason = "test rejection"): OwnershipVerifier {
  return vi.fn(async (email, _proof) => {
    throw new OwnershipError(email, reason);
  });
}

function makeBreachedFetch(email: string, entries: typeof RAW_BREACH_RESPONSE): typeof fetch {
  return vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    const u = String(url);
    if (u.includes(encodeURIComponent(email))) {
      return new Response(JSON.stringify(entries), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;
}

function makeCleanFetch(): typeof fetch {
  // HIBP returns 404 for no breaches
  return vi.fn(async () => new Response("Not Found", { status: 404 })) as typeof fetch;
}

function makeErrorFetch(status: number): typeof fetch {
  return vi.fn(async () => new Response("Error", { status })) as typeof fetch;
}

/* ── Setup ──────────────────────────────────────────────────────── */

let store: FakeLocalStore;
let wrappingKey: string;

beforeEach(async () => {
  store = new FakeLocalStore();
  wrappingKey = await generateWrappingKey();
});

function getWrappingKey() { return Promise.resolve(wrappingKey); }

/* ── setKey ─────────────────────────────────────────────────────── */

describe("BreachedAccount.setKey", () => {
  it("stores an encrypted envelope in the store", async () => {
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership());
    await checker.setKey(TEST_HIBP_KEY);

    const snap = store.snapshot();
    expect(snap["hibp.emailKey"]).toBeDefined();
    const envelope = snap["hibp.emailKey"] as { iv: string; ciphertext: string };
    expect(envelope).toHaveProperty("iv");
    expect(envelope).toHaveProperty("ciphertext");
  });

  it("does NOT store the plaintext key", async () => {
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership());
    await checker.setKey(TEST_HIBP_KEY);

    const raw = JSON.stringify(store.snapshot());
    expect(raw).not.toContain(TEST_HIBP_KEY);
  });

  it("encrypted value decrypts back to original key", async () => {
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership());
    await checker.setKey(TEST_HIBP_KEY);

    const envelope = store.snapshot()["hibp.emailKey"] as { iv: string; ciphertext: string };
    const decoded  = await decryptString(envelope, wrappingKey);
    expect(decoded).toBe(TEST_HIBP_KEY);
  });

  it("overwrites a previously stored key", async () => {
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership());
    await checker.setKey("first-key");
    await checker.setKey("second-key");

    const envelope = store.snapshot()["hibp.emailKey"] as { iv: string; ciphertext: string };
    const decoded  = await decryptString(envelope, wrappingKey);
    expect(decoded).toBe("second-key");
  });

  it("each call produces a different IV (unique ciphertext)", async () => {
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership());
    await checker.setKey(TEST_HIBP_KEY);
    const env1 = store.snapshot()["hibp.emailKey"] as { iv: string };

    await checker.setKey(TEST_HIBP_KEY);
    const env2 = store.snapshot()["hibp.emailKey"] as { iv: string };

    expect(env1.iv).not.toBe(env2.iv);
  });
});

/* ── clearKey ────────────────────────────────────────────────────── */

describe("BreachedAccount.clearKey", () => {
  it("removes the stored key", async () => {
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership());
    await checker.setKey(TEST_HIBP_KEY);
    await checker.clearKey();

    expect(store.snapshot()["hibp.emailKey"]).toBeUndefined();
  });

  it("is a no-op when no key is stored", async () => {
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership());
    await expect(checker.clearKey()).resolves.not.toThrow();
  });
});

/* ── hasKey ──────────────────────────────────────────────────────── */

describe("BreachedAccount.hasKey", () => {
  it("returns false when no key stored", async () => {
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership());
    expect(await checker.hasKey()).toBe(false);
  });

  it("returns true after setKey", async () => {
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership());
    await checker.setKey(TEST_HIBP_KEY);
    expect(await checker.hasKey()).toBe(true);
  });

  it("returns false after clearKey", async () => {
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership());
    await checker.setKey(TEST_HIBP_KEY);
    await checker.clearKey();
    expect(await checker.hasKey()).toBe(false);
  });
});

/* ── check — ownership ───────────────────────────────────────────── */

describe("BreachedAccount.check — ownership", () => {
  it("calls ownership verifier before any network request", async () => {
    const verifier = makeAlwaysAllowOwnership();
    const mockFetch = makeCleanFetch();
    const checker = createBreachedAccount(store, getWrappingKey, verifier, mockFetch);
    await checker.setKey(TEST_HIBP_KEY);

    await checker.check(TEST_EMAIL, { kind: "chrome-profile" });

    expect(verifier).toHaveBeenCalledWith(TEST_EMAIL, { kind: "chrome-profile" });
  });

  it("throws OwnershipError and does NOT call HIBP when ownership fails", async () => {
    const verifier  = makeAlwaysDenyOwnership("wrong profile");
    const mockFetch = makeCleanFetch();
    const checker   = createBreachedAccount(store, getWrappingKey, verifier, mockFetch);
    await checker.setKey(TEST_HIBP_KEY);

    await expect(
      checker.check(OTHER_EMAIL, { kind: "chrome-profile" })
    ).rejects.toThrow(OwnershipError);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

/* ── check — NoKeyError ──────────────────────────────────────────── */

describe("BreachedAccount.check — NoKeyError", () => {
  it("throws NoKeyError if no key is stored", async () => {
    const checker = createBreachedAccount(
      store,
      getWrappingKey,
      makeAlwaysAllowOwnership(),
      makeCleanFetch(),
    );
    await expect(
      checker.check(TEST_EMAIL, { kind: "chrome-profile" })
    ).rejects.toThrow(NoKeyError);
  });
});

/* ── check — HIBP call ───────────────────────────────────────────── */

describe("BreachedAccount.check — network", () => {
  it("sends hibp-api-key header with the decrypted key", async () => {
    const mockFetch = makeCleanFetch();
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership(), mockFetch);
    await checker.setKey(TEST_HIBP_KEY);
    await checker.check(TEST_EMAIL, { kind: "chrome-profile" });

    const callInit = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    const headers = callInit.headers as Record<string, string>;
    expect(headers["hibp-api-key"]).toBe(TEST_HIBP_KEY);
  });

  it("sends user-agent: ShieldMe-Extension header", async () => {
    const mockFetch = makeCleanFetch();
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership(), mockFetch);
    await checker.setKey(TEST_HIBP_KEY);
    await checker.check(TEST_EMAIL, { kind: "chrome-profile" });

    const callInit = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    const headers = callInit.headers as Record<string, string>;
    expect(headers["user-agent"]).toBe("ShieldMe-Extension");
  });

  it("URL contains the encoded email address", async () => {
    const mockFetch = makeCleanFetch();
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership(), mockFetch);
    await checker.setKey(TEST_HIBP_KEY);
    await checker.check(TEST_EMAIL, { kind: "chrome-profile" });

    const calledUrl = String((mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(calledUrl).toContain(encodeURIComponent(TEST_EMAIL));
    expect(calledUrl).toContain("haveibeenpwned.com");
  });

  it("URL includes truncateResponse=false", async () => {
    const mockFetch = makeCleanFetch();
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership(), mockFetch);
    await checker.setKey(TEST_HIBP_KEY);
    await checker.check(TEST_EMAIL, { kind: "chrome-profile" });

    const calledUrl = String((mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(calledUrl).toContain("truncateResponse=false");
  });

  it("returns [] for HIBP 404 (no breaches)", async () => {
    const mockFetch = makeCleanFetch();
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership(), mockFetch);
    await checker.setKey(TEST_HIBP_KEY);

    const result = await checker.check(TEST_EMAIL, { kind: "chrome-profile" });
    expect(result).toEqual([]);
  });

  it("returns parsed breach list on 200 response", async () => {
    const mockFetch = makeBreachedFetch(TEST_EMAIL, RAW_BREACH_RESPONSE);
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership(), mockFetch);
    await checker.setKey(TEST_HIBP_KEY);

    const result = await checker.check(TEST_EMAIL, { kind: "chrome-profile" });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(BREACH_FIXTURE[0]);
    expect(result[1]).toEqual(BREACH_FIXTURE[1]);
  });

  it("maps PascalCase HIBP fields to camelCase BreachEntry fields", async () => {
    const mockFetch = makeBreachedFetch(TEST_EMAIL, RAW_BREACH_RESPONSE);
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership(), mockFetch);
    await checker.setKey(TEST_HIBP_KEY);

    const result = await checker.check(TEST_EMAIL, { kind: "chrome-profile" });
    // All fields must be camelCase
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("domain");
    expect(result[0]).toHaveProperty("breachDate");
    expect(result[0]).toHaveProperty("dataClasses");
    expect(result[0]).not.toHaveProperty("Name");
    expect(result[0]).not.toHaveProperty("BreachDate");
  });

  it("throws on non-404 error status", async () => {
    const mockFetch = makeErrorFetch(401);
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership(), mockFetch);
    await checker.setKey(TEST_HIBP_KEY);

    await expect(
      checker.check(TEST_EMAIL, { kind: "chrome-profile" })
    ).rejects.toThrow("401");
  });

  it("throws on 429 rate-limit response", async () => {
    const mockFetch = makeErrorFetch(429);
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership(), mockFetch);
    await checker.setKey(TEST_HIBP_KEY);

    await expect(
      checker.check(TEST_EMAIL, { kind: "chrome-profile" })
    ).rejects.toThrow("429");
  });
});

/* ── Key never in URL ───────────────────────────────────────────── */

describe("BreachedAccount — key never in URL or logged", () => {
  it("API key does NOT appear in the fetch URL", async () => {
    const mockFetch = makeCleanFetch();
    const checker = createBreachedAccount(store, getWrappingKey, makeAlwaysAllowOwnership(), mockFetch);
    await checker.setKey(TEST_HIBP_KEY);
    await checker.check(TEST_EMAIL, { kind: "chrome-profile" });

    const calledUrl = String((mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(calledUrl).not.toContain(TEST_HIBP_KEY);
  });
});
