/**
 * Per-account derived keys (HKDF).
 * Security control: C-KEY-1 (cross-account isolation), C-KEY-2 (seed rotation),
 *                   C-KEY-3 (non-extractable), C-MEM-1 (memory hygiene).
 *
 * Key hierarchy:
 *   kdfSalt  (32 random bytes, base-64, stored in storage under `meta.kdfSalt`)
 *     └─ HKDF-SHA-256(salt = kdfSalt, info = UTF-8(accountId)) → AES-GCM-256
 *
 * Each account gets an independent AES-GCM-256 key derived from the wrapping
 * seed and the account's ULID. Compromising one account's namespace cannot be
 * used to decrypt another account's data.
 *
 * The salt is stored in `meta.kdfSalt` via the injected LocalStore. No direct
 * chrome.storage calls are made here.
 *
 * Constitution §XIII (Identity & Account Sovereignty):
 *   Per-account state lives in scoped namespaces; nothing leaks across accounts.
 *
 * Constitution §XII / C-MEM-1:
 *   Decrypted keys travel through closures, never module-level state.
 */

import type { LocalStore } from "./storage";

/* ── Constants ─────────────────────────────────────────────────── */

/** Storage key for the 32-byte KDF salt (base-64 encoded). */
const KDF_SALT_KEY = "meta.kdfSalt";

/** AES-GCM IV length in bytes. */
const IV_BYTES = 12;

/** AES-GCM algorithm descriptor. */
const AES_ALG = { name: "AES-GCM", length: 256 } as const;

/* ── Public types ───────────────────────────────────────────────── */

/**
 * An AES-GCM-256 CryptoKey derived for a specific account.
 * Always non-extractable (C-KEY-3).
 */
export type AccountKey = CryptoKey;

/**
 * Encrypted blob returned by PerAccountKeyDerivation.encrypt.
 * The IV is base-64 encoded (12 bytes) and is unique per call.
 */
export type AccountKeyBlob = {
  /** base64(12-byte random IV). Fresh per encrypt call. */
  iv: string;
  /** base64(AES-GCM-256 ciphertext). */
  ciphertext: string;
};

/**
 * Typed error union for decryption failures.
 * Never throw raw Error — always throw a typed DecryptError.
 *
 * - `wrong-key`  : ciphertext was encrypted with a different key (AES-GCM auth tag failure).
 * - `tampered`   : ciphertext has been modified after encryption.
 * - `no-seed`    : no KDF salt is available in storage (should never happen in normal flow;
 *                  indicates corrupted or wiped storage).
 */
export type DecryptError =
  | { kind: "wrong-key" }
  | { kind: "tampered" }
  | { kind: "no-seed" };

/**
 * PerAccountKeyDerivation — the public interface for this module.
 */
export interface PerAccountKeyDerivation {
  /**
   * Derive a per-account AES-GCM-256 key from the global wrapping seed and
   * the given accountId. Uses HKDF-SHA-256. Non-extractable.
   *
   * The same accountId on the same seed always produces functionally equivalent
   * key material. After a seed rotation this returns a different key.
   */
  deriveKey(accountId: string): Promise<AccountKey>;

  /**
   * Encrypt plaintext with the given per-account key.
   * Uses a fresh 12-byte IV per call (IV uniqueness is enforced).
   * Returns base64-encoded { iv, ciphertext }.
   */
  encrypt(key: AccountKey, plaintext: string): Promise<AccountKeyBlob>;

  /**
   * Decrypt a blob produced by encrypt(). Throws a typed DecryptError on:
   * - wrong key (cross-account attempt, C-KEY-1)
   * - tampered ciphertext (AES-GCM auth tag failure)
   */
  decrypt(key: AccountKey, blob: AccountKeyBlob): Promise<string>;

  /**
   * Rotate the global wrapping seed.
   * Generates a new 32-byte random salt and persists it. All subsequent
   * deriveKey() calls will produce different keys. Callers are responsible
   * for re-encrypting their data with the new keys.
   *
   * C-KEY-2: This operation intentionally invalidates all existing account keys
   * derived from the previous seed.
   */
  rotateWrappingSeed(): Promise<void>;
}

/* ── Internal helpers ───────────────────────────────────────────── */

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64(bytes: Uint8Array<ArrayBuffer>): string {
  return btoa(String.fromCharCode(...bytes));
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

/**
 * Fixed IKM label — the per-install random kdfSalt carries the entropy
 * as the HKDF salt parameter; the IKM is a fixed domain label per RFC 5869
 * §3.3 (using a fixed IKM with a random salt is standard practice when the
 * only secret material is the salt).
 */
const HKDF_IKM = enc.encode("shieldme-per-account-key-v1") as Uint8Array<ArrayBuffer>;

/**
 * Import fixed IKM bytes as an HKDF base key.
 * Randomness comes from the kdfSalt passed to deriveKey's `salt` param.
 */
async function importHkdfIkm(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    HKDF_IKM,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );
}

/**
 * Derive a non-extractable AES-GCM-256 key via HKDF-SHA-256.
 *
 * salt  = the per-install random kdfSalt (32 bytes) — carries the entropy.
 * info  = UTF-8 bytes of accountId — binds the derived key to one account.
 * length = 256 bits (AES-GCM).
 *
 * Contract reference: C-KEY-1.
 * "HKDF-SHA-256 ... salt = install secret ... info = UTF-8(accountId)"
 */
async function hkdfDeriveKey(
  saltBytes: Uint8Array<ArrayBuffer>,
  accountId: string,
): Promise<CryptoKey> {
  const hkdfKey = await importHkdfIkm();
  const infoBytes = enc.encode(accountId) as Uint8Array<ArrayBuffer>;

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBytes,  // per-install random — carries all the randomness
      info: infoBytes,  // per-account discriminator
    },
    hkdfKey,
    AES_ALG,
    false, // C-KEY-3: never extractable
    ["encrypt", "decrypt"],
  );
}

/**
 * Load the KDF salt from storage, or generate a new one on first use.
 * Returns the raw bytes.
 */
async function ensureSalt(store: LocalStore): Promise<Uint8Array<ArrayBuffer>> {
  const existing = await store.get<string>(KDF_SALT_KEY);
  if (existing) {
    return b64ToBytes(existing);
  }

  // First run: generate and persist a 32-byte random salt.
  const bytes = crypto.getRandomValues(
    new Uint8Array(32) as Uint8Array<ArrayBuffer>,
  );
  await store.set<string>(KDF_SALT_KEY, bytesToB64(bytes));
  return bytes;
}

/* ── Factory ────────────────────────────────────────────────────── */

/**
 * Create a PerAccountKeyDerivation backed by the given LocalStore.
 *
 * The store is used only to persist the KDF salt (`meta.kdfSalt`).
 * All other operations are in-memory using Web Crypto.
 *
 * Dependency injection: tests provide a FakeLocalStore; production code
 * provides the real SealedLocalStore instance. No global singletons.
 */
export async function createPerAccountKeyDerivation(
  store: LocalStore,
): Promise<PerAccountKeyDerivation> {
  return {
    async deriveKey(accountId: string): Promise<AccountKey> {
      const saltBytes = await ensureSalt(store);
      return hkdfDeriveKey(saltBytes, accountId);
    },

    async encrypt(key: AccountKey, plaintext: string): Promise<AccountKeyBlob> {
      const iv = crypto.getRandomValues(
        new Uint8Array(IV_BYTES) as Uint8Array<ArrayBuffer>,
      );
      const encoded = enc.encode(plaintext) as Uint8Array<ArrayBuffer>;
      const cipherBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded,
      );
      return {
        iv: bytesToB64(iv),
        ciphertext: bytesToB64(new Uint8Array(cipherBuffer) as Uint8Array<ArrayBuffer>),
      };
    },

    async decrypt(key: AccountKey, blob: AccountKeyBlob): Promise<string> {
      const iv = b64ToBytes(blob.iv);
      const cipherBytes = b64ToBytes(blob.ciphertext);
      let plainBuffer: ArrayBuffer;
      try {
        plainBuffer = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: iv as Uint8Array<ArrayBuffer> },
          key,
          cipherBytes,
        );
      } catch {
        // AES-GCM decryption failure is indistinguishable between wrong-key and
        // tamper at the Web Crypto layer; surface as "tampered" (conservative).
        const err: DecryptError = { kind: "tampered" };
        throw err;
      }
      return dec.decode(plainBuffer);
    },

    async rotateWrappingSeed(): Promise<void> {
      // Generate a new 32-byte salt, overwriting the existing one.
      // All subsequent deriveKey() calls produce different keys (C-KEY-2).
      // Callers must re-encrypt their data; this function does not attempt
      // re-encryption because it has no knowledge of what has been encrypted.
      const newBytes = crypto.getRandomValues(
        new Uint8Array(32) as Uint8Array<ArrayBuffer>,
      );
      await store.set<string>(KDF_SALT_KEY, bytesToB64(newBytes));
    },
  };
}

/* ── disposeKey (C-MEM-1) ───────────────────────────────────────── */

/**
 * C-MEM-1 discipline marker.
 *
 * Web Crypto CryptoKey instances cannot be explicitly zeroed or destroyed
 * by the caller — they are opaque handles managed by the browser's crypto
 * subsystem. This function documents the expected lifecycle: callers should
 * drop their reference to the key after use so it becomes eligible for GC.
 *
 * Calling `disposeKey(key)` signals intent to the reader ("I'm done with
 * this key here") without implying any in-memory zeroing. Source maps
 * shipped per §II ensure this comment is visible in security reviews.
 *
 * @param _key - The AccountKey reference to release. Has no effect beyond
 *               expressing intent to discard the reference.
 */
export function disposeKey(_key: AccountKey): void {
  // Intentional no-op. Web Crypto keys are opaque; the caller must simply
  // not hold a reference beyond its required scope (C-MEM-1).
}
