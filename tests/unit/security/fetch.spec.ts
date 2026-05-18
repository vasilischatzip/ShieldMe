/**
 * T067 — C-NET-2 runtime fetch wrapper tests.
 *
 * Write-first (TDD): written before src/security/fetch.ts exists.
 *
 * Security control: C-NET-2
 * Every fetch originating from ShieldMe must pass through `shieldFetch`.
 * Any request to a host not in the active egress allowlist is rejected
 * synchronously with a `FetchBlockedError`.
 *
 * Feature-flag gates:
 *   - Plausible (telemetry opt-in)
 *   - tessdata (OCR traineddata download)
 *   - HIBP keyed (email breach check — requires user-supplied key)
 *   - Stripe (M6+)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  shieldFetch,
  FetchBlockedError,
  createShieldFetch,
} from "~/security/fetch";

/* ── Helpers ──────────────────────────────────────────────────── */

function mockFetchOk(): typeof fetch {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response('{"ok":true}', { status: 200 });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* ════════════════════════════════════════════════════════════════
   1. Allowlisted hosts — should pass through
   ════════════════════════════════════════════════════════════════ */

describe("shieldFetch — allowlisted hosts pass through", () => {
  it("allows api.pwnedpasswords.com", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("https://api.pwnedpasswords.com/range/A94A8", { method: "GET" }),
    ).resolves.toBeDefined();
    expect(inner).toHaveBeenCalledOnce();
  });

  it("allows haveibeenpwned.com", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("https://haveibeenpwned.com/api/v3/breachedaccount/test%40example.com"),
    ).resolves.toBeDefined();
  });

  it("allows www.googleapis.com", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("https://www.googleapis.com/drive/v3/files"),
    ).resolves.toBeDefined();
  });

  it("allows accounts.google.com", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("https://accounts.google.com/o/oauth2/token"),
    ).resolves.toBeDefined();
  });

  it("allows oauth2.googleapis.com", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("https://oauth2.googleapis.com/token"),
    ).resolves.toBeDefined();
  });

  it("subdomain of allowed host is also allowed", async () => {
    // e.g. api.haveibeenpwned.com is a subdomain of haveibeenpwned.com
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("https://api.haveibeenpwned.com/v3/"),
    ).resolves.toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════
   2. Blocked hosts — must throw FetchBlockedError
   ════════════════════════════════════════════════════════════════ */

describe("shieldFetch — blocked hosts throw FetchBlockedError", () => {
  it("blocks requests to google.com (not in allowlist)", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("https://google.com/search?q=shieldme"),
    ).rejects.toBeInstanceOf(FetchBlockedError);
    expect(inner).not.toHaveBeenCalled();
  });

  it("blocks requests to attacker.com", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("https://attacker.com/exfil"),
    ).rejects.toBeInstanceOf(FetchBlockedError);
    expect(inner).not.toHaveBeenCalled();
  });

  it("blocks data: URIs", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("data:text/plain;base64,SGVsbG8="),
    ).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("FetchBlockedError includes the blocked host in its message", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    try {
      await sf("https://evil.example.com/steal");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FetchBlockedError);
      expect((err as FetchBlockedError).message).toContain("evil.example.com");
    }
  });

  it("FetchBlockedError has host property", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    try {
      await sf("https://evil.example.com/steal");
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as FetchBlockedError).blockedHost).toBe("evil.example.com");
    }
  });
});

/* ════════════════════════════════════════════════════════════════
   3. Feature-flagged optional hosts
   ════════════════════════════════════════════════════════════════ */

describe("shieldFetch — feature-flagged optional hosts", () => {
  it("blocks tessdata when tessdata flag is OFF (default)", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz"),
    ).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("allows tessdata when tessdata flag is ON", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner, enabledFeatures: new Set(["tessdata"]) });
    await expect(
      sf("https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz"),
    ).resolves.toBeDefined();
  });

  it("blocks plausible when telemetry flag is OFF (default)", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    await expect(
      sf("https://plausible.io/api/event"),
    ).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("allows plausible when telemetry flag is ON", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner, enabledFeatures: new Set(["telemetry"]) });
    await expect(
      sf("https://plausible.io/api/event"),
    ).resolves.toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════
   4. Request and URL object variants
   ════════════════════════════════════════════════════════════════ */

describe("shieldFetch — accepts URL and Request objects", () => {
  it("accepts a URL object for an allowed host", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    const url = new URL("https://api.pwnedpasswords.com/range/A94A8");
    await expect(sf(url)).resolves.toBeDefined();
  });

  it("accepts a Request object for an allowed host", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    const req = new Request("https://api.pwnedpasswords.com/range/A94A8");
    await expect(sf(req)).resolves.toBeDefined();
  });

  it("rejects a URL object for a blocked host", async () => {
    const inner = mockFetchOk();
    const sf = createShieldFetch({ inner });
    const url = new URL("https://evil.example.com/");
    await expect(sf(url)).rejects.toBeInstanceOf(FetchBlockedError);
  });
});

/* ════════════════════════════════════════════════════════════════
   5. Default singleton shieldFetch
   ════════════════════════════════════════════════════════════════ */

describe("shieldFetch — default export rejects blocked hosts", () => {
  it("shieldFetch is a function", () => {
    expect(typeof shieldFetch).toBe("function");
  });

  it("shieldFetch rejects clearly-blocked host", async () => {
    await expect(
      shieldFetch("https://definitely-not-allowed.com/"),
    ).rejects.toBeInstanceOf(FetchBlockedError);
  });
});
