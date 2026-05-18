/**
 * HIBP BreachedAccount — email breach lookup with encrypted API key at rest.
 *
 * Key storage:
 *   • The HIBP API key is AES-GCM-256 encrypted via `src/core/crypto.ts` using
 *     the device wrapping key (meta.wrappingKey from storage).
 *   • Only the wrapping key is stored unencrypted (device-local, never egresses).
 *   • The plaintext HIBP key lives in memory only for the duration of a single fetch.
 *
 * Ownership:
 *   • To prevent cross-account snooping, email must be verified via OwnershipProof
 *     before any HIBP request is dispatched.
 *   • chrome-profile: checks signed-in Chrome identity equals the requested email.
 *   • code-verified:  not implemented in MVP — throws NotYetImplementedError.
 *
 * Egress: haveibeenpwned.com  (authorised in contracts/integration-apis.md §3)
 */

import { encryptString, decryptString, type EncryptedEnvelope } from "~/core/crypto";
import type { LocalStore } from "~/core/storage";

/* ── Public types (mirror integration-apis.md §3) ─────────────── */

export type OwnershipProof =
  | { kind: "chrome-profile" }
  | { kind: "code-verified"; tokenId: string };

export type BreachEntry = {
  name: string;
  domain: string;
  breachDate: string;
  dataClasses: string[];
};

export type BreachList = BreachEntry[];

export interface BreachedAccount {
  /** Encrypt and persist the user's HIBP API key. */
  setKey(key: string): Promise<void>;
  /** Remove the stored API key. */
  clearKey(): Promise<void>;
  /** Returns true if a key has been saved. */
  hasKey(): Promise<boolean>;
  /**
   * Check an email address for breaches.
   * Throws `OwnershipError` if the ownership proof fails.
   * Throws `NoKeyError` if no API key has been stored.
   */
  check(email: string, ownership: OwnershipProof): Promise<BreachList>;
}

/* ── Error types ───────────────────────────────────────────────── */

export class OwnershipError extends Error {
  constructor(email: string, reason: string) {
    super(`Ownership verification failed for ${email}: ${reason}`);
    this.name = "OwnershipError";
  }
}

export class NoKeyError extends Error {
  constructor() {
    super("No HIBP API key stored. Call setKey() first.");
    this.name = "NoKeyError";
  }
}

export class NotYetImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not yet implemented in this version.`);
    this.name = "NotYetImplementedError";
  }
}

/* ── Dependency types ─────────────────────────────────────────── */

export type WrappingKeyProvider = () => Promise<string>;

/**
 * Verifies that the caller owns the email address.
 * Throws `OwnershipError` if verification fails.
 */
export type OwnershipVerifier = (
  email: string,
  proof: OwnershipProof,
) => Promise<void>;

/* ── Constants ─────────────────────────────────────────────────── */

const STORE_KEY   = "hibp.emailKey";
const HIBP_BASE   = "https://haveibeenpwned.com/api/v3/breachedaccount/";
const USER_AGENT  = "ShieldMe-Extension";

/* ── Factory ───────────────────────────────────────────────────── */

/**
 * Creates a `BreachedAccount` implementation.
 *
 * @param store           LocalStore instance for persisting the encrypted key.
 * @param getWrappingKey  Async accessor for the AES-GCM wrapping key (base64).
 * @param verifyOwnership Async function that throws OwnershipError on failure.
 * @param fetchFn         Injectable fetch (default: global fetch).
 */
export function createBreachedAccount(
  store: LocalStore,
  getWrappingKey: WrappingKeyProvider,
  verifyOwnership: OwnershipVerifier,
  fetchFn: typeof fetch = fetch,
): BreachedAccount {
  return {
    async setKey(key: string): Promise<void> {
      const wrappingKey = await getWrappingKey();
      const envelope    = await encryptString(key, wrappingKey);
      await store.set<EncryptedEnvelope>(STORE_KEY, envelope);
    },

    async clearKey(): Promise<void> {
      await store.remove(STORE_KEY);
    },

    async hasKey(): Promise<boolean> {
      const envelope = await store.get<EncryptedEnvelope>(STORE_KEY);
      return envelope !== undefined;
    },

    async check(email: string, ownership: OwnershipProof): Promise<BreachList> {
      // Step 1: verify ownership before accessing any HIBP data
      await verifyOwnership(email, ownership);

      // Step 2: retrieve and decrypt the API key
      const envelope = await store.get<EncryptedEnvelope>(STORE_KEY);
      if (!envelope) throw new NoKeyError();

      const wrappingKey = await getWrappingKey();
      const apiKey      = await decryptString(envelope, wrappingKey);

      // Step 3: call HIBP — key stays in memory only for this fetch
      const url  = `${HIBP_BASE}${encodeURIComponent(email)}?truncateResponse=false`;
      const resp = await fetchFn(url, {
        method: "GET",
        headers: {
          "hibp-api-key": apiKey,
          "user-agent":   USER_AGENT,
        },
      });

      // Key reference drops out of scope here — eligible for GC

      if (resp.status === 404) {
        // HIBP returns 404 for accounts with no breaches — that is "clean"
        return [];
      }

      if (!resp.ok) {
        throw new Error(`HIBP breachedaccount request failed with status ${resp.status}`);
      }

      const data = (await resp.json()) as Array<{
        Name: string;
        Domain: string;
        BreachDate: string;
        DataClasses: string[];
      }>;

      return data.map(entry => ({
        name:        entry.Name,
        domain:      entry.Domain,
        breachDate:  entry.BreachDate,
        dataClasses: entry.DataClasses,
      }));
    },
  };
}

/* ── Web-app ownership verifier (post-pivot 2026-05-17) ──────── */

/**
 * Web-app ownership verifier.
 *
 * In the extension variant, `chrome.identity.getProfileUserInfo` was used to
 * confirm the signed-in Chrome account matched the email being checked.
 * In the web app there's no equivalent privileged API.
 *
 * v1.0 strategy: user-confirmed proof. The caller must obtain explicit user
 * confirmation through the UI before calling the HIBP breach-account endpoint
 * (so an attacker who learns the user's HIBP key can't enumerate arbitrary
 * emails). For `chrome-profile` kind this verifier is now a no-op pass —
 * the calling UI is responsible for the confirmation gesture. For
 * `code-verified` kind the verifier still rejects until the per-email code
 * flow ships (backlog `BL-radar-email-code-verify`).
 */
export async function chromeOwnershipVerifier(
  email: string,
  proof: OwnershipProof,
): Promise<void> {
  if (proof.kind === "code-verified") {
    throw new NotYetImplementedError("code-verified ownership proof");
  }
  // `chrome-profile` kind in the web-app variant is satisfied by an
  // explicit user gesture in the calling UI. No automatic verification.
  if (!email) {
    throw new OwnershipError(email, "email is required");
  }
}
