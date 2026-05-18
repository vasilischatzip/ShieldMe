/**
 * HIBP PwnedPasswords — k-anonymity range check.
 *
 * Contract:
 *   • Only the 5-character hex prefix of SHA-1(plaintext) ever leaves the device.
 *   • The full hash and the plaintext are kept in memory only and never logged,
 *     stored, or included in any network request.
 *
 * Flow:
 *   1. SHA-1(plaintext) → uppercase hex, e.g. "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8"
 *   2. prefix = first 5 chars ("5BAA6"), suffix = the rest
 *   3. GET https://api.pwnedpasswords.com/range/{prefix}
 *   4. Linear search for the suffix in the returned list
 *   5. Return breached/clean; discard plaintext reference
 *
 * Egress: api.pwnedpasswords.com  (authorised in contracts/integration-apis.md §2)
 */

export type PwnedResult =
  | { status: "clean" }
  | { status: "breached"; count: number };

export interface PwnedPasswords {
  check(plaintext: string): Promise<PwnedResult>;
}

const RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range/";

/* ── SHA-1 via Web Crypto ──────────────────────────────────────── */

async function sha1UpperHex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf  = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/* ── Response parser ───────────────────────────────────────────── */

/**
 * Parses the HIBP range response text.
 * Each line is "SUFFIX:COUNT" (CRLF or LF delimited, with optional padding lines).
 * Returns the count for the given suffix, or 0 if not found.
 */
function findSuffix(responseText: string, suffix: string): number {
  for (const rawLine of responseText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const lineSuffix = line.slice(0, colon).toUpperCase();
    if (lineSuffix === suffix) {
      const count = parseInt(line.slice(colon + 1), 10);
      return isNaN(count) ? 1 : count;
    }
  }
  return 0;
}

/* ── Implementation ────────────────────────────────────────────── */

class HibpPasswordsChecker implements PwnedPasswords {
  async check(plaintext: string): Promise<PwnedResult> {
    const hash   = await sha1UpperHex(plaintext);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    // Only the prefix (5 chars) crosses the network — k-anonymity guarantee.
    const resp = await fetch(`${RANGE_ENDPOINT}${prefix}`, {
      method: "GET",
      headers: {
        // Ask HIBP to pad the response so response length doesn't reveal the hash.
        "Add-Padding": "true",
      },
    });

    if (!resp.ok) {
      throw new Error(`HIBP range request failed with status ${resp.status}`);
    }

    const text  = await resp.text();
    const count = findSuffix(text, suffix);

    // Explicitly drop references (help GC; strings are immutable in JS but
    // keeping named bindings alive is a code-review smell).
    return count > 0
      ? { status: "breached", count }
      : { status: "clean" };
  }
}

/** Singleton — stateless; safe to reuse. */
export const pwnedPasswords: PwnedPasswords = new HibpPasswordsChecker();

/** Factory for testing with injected `fetchFn`. */
export function createPwnedPasswords(
  fetchFn: typeof fetch = fetch,
): PwnedPasswords {
  return {
    async check(plaintext: string): Promise<PwnedResult> {
      const hash   = await sha1UpperHex(plaintext);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);

      const resp = await fetchFn(`${RANGE_ENDPOINT}${prefix}`, {
        method: "GET",
        headers: { "Add-Padding": "true" },
      });

      if (!resp.ok) {
        throw new Error(`HIBP range request failed with status ${resp.status}`);
      }

      const text  = await resp.text();
      const count = findSuffix(text, suffix);
      return count > 0 ? { status: "breached", count } : { status: "clean" };
    },
  };
}
