/**
 * T043a — PwnedPasswords k-anonymity unit tests.
 *
 * Key invariants:
 *   • Only the 5-char prefix is sent to the network (k-anonymity).
 *   • Full hash and plaintext never appear in the fetch URL.
 *   • Correct breached/clean status returned.
 *   • Network errors propagate as thrown Error.
 */
import { describe, it, expect, vi } from "vitest";
import { createPwnedPasswords } from "~/radar/hibp-passwords";

/* ── SHA-1 helpers (reference values computed via Web Crypto) ──── */

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const SHA1_PASSWORD_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

// SHA-1("hunter2") = F3BBBD66A63D4BF1747940578EC3D0103530E21D
const SHA1_HUNTER2_PREFIX = "F3BBB";
const SHA1_HUNTER2_SUFFIX = "D66A63D4BF1747940578EC3D0103530E21D";

// SHA-1("correct horse battery staple") = ACBB7B2DC74CD3FA40862E7780BD8B1B9B4AB95F
// SHA1_PASSPHRASE_PREFIX = "ACBB7", SHA1_PASSPHRASE_SUFFIX used inline below

/* ── Mock factory ───────────────────────────────────────────────── */

function makeMockFetch(
  suffix: string,
  count: number,
  statusCode = 200,
): typeof fetch {
  return vi.fn(async (_url: RequestInfo | URL) => {
    if (statusCode !== 200) {
      return new Response("Service Unavailable", { status: statusCode });
    }
    // Simulate a range response: include the target suffix + some dummy lines
    const body = [
      `AAAAABBBBBCCCCCDDDDDEEEEEFFFFFF000:5`,
      `${suffix}:${count}`,
      `FFFFFEEEEEDDDDDCCCCCBBBBBAAAAAAB1:12`,
      // Padding lines (HIBP pads responses to 800+ lines — we simulate a few)
      `0000000000000000000000000000000000:0`,
    ].join("\r\n");
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

function makeEmptyFetch(): typeof fetch {
  return vi.fn(async () => {
    return new Response("AAAAABBBBBCCCCCDDDDDEEEEEFFFFFF000:5\r\n", { status: 200 });
  }) as typeof fetch;
}

/* ── K-anonymity: only prefix in URL ────────────────────────────── */

describe("PwnedPasswords — k-anonymity invariant", () => {
  it("sends only the 5-char prefix in the URL for a breached password", async () => {
    const mockFetch = makeMockFetch(SHA1_PASSWORD_SUFFIX, 3645804);
    const checker = createPwnedPasswords(mockFetch);
    await checker.check("password");

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = String((mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    // URL must end with the 5-char prefix only
    expect(calledUrl).toContain("api.pwnedpasswords.com/range/5BAA6");
    // Full hash must NOT appear in the URL
    expect(calledUrl).not.toContain(SHA1_PASSWORD_SUFFIX);
    expect(calledUrl).not.toContain("5BAA61E4C9B93"); // partial full hash
  });

  it("prefix for 'hunter2' is correct", async () => {
    const mockFetch = makeMockFetch(SHA1_HUNTER2_SUFFIX, 17357);
    const checker = createPwnedPasswords(mockFetch);
    await checker.check("hunter2");

    const calledUrl = String((mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(calledUrl).toContain(`/range/${SHA1_HUNTER2_PREFIX}`);
    expect(calledUrl).not.toContain(SHA1_HUNTER2_SUFFIX);
  });

  it("URL contains exactly 5 hex chars after /range/", async () => {
    const mockFetch = makeEmptyFetch();
    const checker = createPwnedPasswords(mockFetch);
    await checker.check("correct horse battery staple");

    const calledUrl = String((mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    const match = calledUrl.match(/\/range\/([A-F0-9]+)$/i);
    expect(match).not.toBeNull();
    expect(match![1]).toHaveLength(5);
  });
});

/* ── Breached result ─────────────────────────────────────────────── */

describe("PwnedPasswords — breached", () => {
  it("returns breached with correct count when suffix present", async () => {
    const mockFetch = makeMockFetch(SHA1_PASSWORD_SUFFIX, 3645804);
    const checker = createPwnedPasswords(mockFetch);
    const result = await checker.check("password");

    expect(result.status).toBe("breached");
    if (result.status === "breached") {
      expect(result.count).toBe(3645804);
    }
  });

  it("returns breached for 'hunter2' with correct count", async () => {
    const mockFetch = makeMockFetch(SHA1_HUNTER2_SUFFIX, 17357);
    const checker = createPwnedPasswords(mockFetch);
    const result = await checker.check("hunter2");

    expect(result.status).toBe("breached");
    if (result.status === "breached") {
      expect(result.count).toBe(17357);
    }
  });

  it("handles count=1 (single breach) correctly", async () => {
    const mockFetch = makeMockFetch(SHA1_PASSWORD_SUFFIX, 1);
    const checker = createPwnedPasswords(mockFetch);
    const result = await checker.check("password");
    expect(result.status).toBe("breached");
    if (result.status === "breached") expect(result.count).toBe(1);
  });
});

/* ── Clean result ────────────────────────────────────────────────── */

describe("PwnedPasswords — clean", () => {
  it("returns clean when suffix not in response", async () => {
    const mockFetch = makeEmptyFetch(); // suffix not in the response
    const checker = createPwnedPasswords(mockFetch);
    const result = await checker.check("correct horse battery staple");
    expect(result.status).toBe("clean");
  });

  it("returns clean for passphrase not in breach list", async () => {
    // We mock a response that contains a DIFFERENT suffix
    const mockFetch = makeMockFetch("DEADBEEFDEADBEEFDEADBEEFDEADBEEF00000", 5);
    const checker = createPwnedPasswords(mockFetch);
    const result = await checker.check("correct horse battery staple");
    // SHA1_PASSPHRASE_SUFFIX !== "DEADBEEFDEADBEEFDEADBEEFDEADBEEF00000"
    expect(result.status).toBe("clean");
  });
});

/* ── Network errors ──────────────────────────────────────────────── */

describe("PwnedPasswords — network errors", () => {
  it("throws on 503 Service Unavailable", async () => {
    const mockFetch = makeMockFetch("", 0, 503);
    const checker = createPwnedPasswords(mockFetch);
    await expect(checker.check("password")).rejects.toThrow("503");
  });

  it("throws on 429 Too Many Requests", async () => {
    const mockFetch = makeMockFetch("", 0, 429);
    const checker = createPwnedPasswords(mockFetch);
    await expect(checker.check("password")).rejects.toThrow("429");
  });

  it("propagates fetch rejection (network down)", async () => {
    const mockFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const checker = createPwnedPasswords(mockFetch);
    await expect(checker.check("password")).rejects.toThrow("Failed to fetch");
  });
});

/* ── Add-Padding header ──────────────────────────────────────────── */

describe("PwnedPasswords — request headers", () => {
  it("sends Add-Padding: true header", async () => {
    const mockFetch = makeEmptyFetch();
    const checker = createPwnedPasswords(mockFetch);
    await checker.check("password");

    const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const options = callArgs[1] as RequestInit | undefined;
    const headers = options?.headers as Record<string, string> | undefined;
    expect(headers?.["Add-Padding"]).toBe("true");
  });
});

/* ── CRLF + LF line endings ─────────────────────────────────────── */

describe("PwnedPasswords — response parsing", () => {
  it("handles LF-only line endings", async () => {
    const mockFetch = vi.fn(async () => {
      const body = `AAAAABBBBB:5\n${SHA1_PASSWORD_SUFFIX}:7\nCCCCCDDDDD:2\n`;
      return new Response(body, { status: 200 });
    }) as typeof fetch;
    const checker = createPwnedPasswords(mockFetch);
    const result = await checker.check("password");
    expect(result.status).toBe("breached");
    if (result.status === "breached") expect(result.count).toBe(7);
  });

  it("handles padding lines (count=0) without false positives", async () => {
    const mockFetch = vi.fn(async () => {
      // All padding lines — suffix we want is not present
      const body = [
        `AAAAABBBBB:0`,
        `CCCCCDDDDD:0`,
        `EEEEEFFFFF:0`,
      ].join("\r\n");
      return new Response(body, { status: 200 });
    }) as typeof fetch;
    const checker = createPwnedPasswords(mockFetch);
    const result = await checker.check("password");
    expect(result.status).toBe("clean");
  });

  it("handles case-insensitive suffix comparison", async () => {
    // Response with lowercase suffix
    const mockFetch = vi.fn(async () => {
      const lowerSuffix = SHA1_PASSWORD_SUFFIX.toLowerCase();
      return new Response(`${lowerSuffix}:42\r\n`, { status: 200 });
    }) as typeof fetch;
    const checker = createPwnedPasswords(mockFetch);
    const result = await checker.check("password");
    expect(result.status).toBe("breached");
    if (result.status === "breached") expect(result.count).toBe(42);
  });
});
