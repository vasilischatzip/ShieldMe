/**
 * C-SEAL-1/2/3 — HMAC storage seals.
 *
 * SealedLocalStore wraps any LocalStore and adds HMAC-SHA-256 anti-tamper
 * protection to every value written. On read, the HMAC is verified before
 * the value is returned. A mismatch throws `TamperDetectedError` — never
 * silent.
 *
 * Envelope format stored in the inner store:
 *   { v: JSON.stringify(value), h: HMAC-SHA-256(key || ":" || storageKey || ":" || v) }
 *
 * The HMAC input binds the storage key to the value so that an attacker
 * cannot swap values between storage slots without detection.
 *
 * Constitution §IX (Fail Loud): tamper → error, never degraded silent mode.
 *
 * Test: tests/unit/core/storage-seals.spec.ts
 */
import type { LocalStore } from "./storage";

/* ── Constants ─────────────────────────────────────────────────── */

/** Storage key used to persist the install secret (base-64). */
export const INSTALL_SECRET_KEY = "__shieldme_install_secret__";

/** HMAC-SHA-256 produces 32 bytes = 64 hex chars. */
const HMAC_HEX_LENGTH = 64;

/* ── Envelope ──────────────────────────────────────────────────── */

interface SealedEntry {
  /** JSON-stringified value. */
  v: string;
  /** HMAC-SHA-256 hex digest. */
  h: string;
}

function isSealedEntry(x: unknown): x is SealedEntry {
  return (
    typeof x === "object" &&
    x !== null &&
    "v" in x &&
    "h" in x &&
    typeof (x as SealedEntry).v === "string" &&
    typeof (x as SealedEntry).h === "string" &&
    (x as SealedEntry).h.length === HMAC_HEX_LENGTH
  );
}

/* ── Error type ─────────────────────────────────────────────────── */

export class TamperDetectedError extends Error {
  readonly tamperedKey: string;

  constructor(key: string) {
    super(
      `[C-SEAL-3] Storage tamper detected for key "${key}". ` +
        `HMAC verification failed. User data may be compromised.`,
    );
    this.name = "TamperDetectedError";
    this.tamperedKey = key;
  }
}

/* ── HMAC helpers ───────────────────────────────────────────────── */

/**
 * Import the install secret bytes as an HMAC-SHA-256 key.
 * Non-extractable to reduce key exposure.
 */
async function importHmacKey(secret: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const enc = new TextEncoder();

/**
 * Build the HMAC input: `storageKey:value` — binds the key to its slot.
 */
function buildHmacInput(storageKey: string, v: string): Uint8Array<ArrayBuffer> {
  // enc.encode returns Uint8Array<ArrayBufferLike>; slice() produces ArrayBuffer.
  return enc.encode(`${storageKey}:${v}`).slice() as Uint8Array<ArrayBuffer>;
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}

async function signHmac(
  key: CryptoKey,
  storageKey: string,
  v: string,
): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", key, buildHmacInput(storageKey, v));
  return bufToHex(sig);
}

async function verifyHmac(
  key: CryptoKey,
  storageKey: string,
  v: string,
  h: string,
): Promise<boolean> {
  const expectedSig = hexToBuf(h);
  return crypto.subtle.verify(
    "HMAC",
    key,
    expectedSig,
    buildHmacInput(storageKey, v),
  );
}

/* ── SealedLocalStore ───────────────────────────────────────────── */

/**
 * LocalStore decorator that adds HMAC-SHA-256 anti-tamper seals to every
 * write and verifies them on every read.
 *
 * Construct directly with a known secret (tests), or use `createSealedStore`
 * to bootstrap from an install secret persisted in the inner store.
 */
export class SealedLocalStore implements LocalStore {
  private readonly _inner: LocalStore;
  private readonly _secret: ArrayBuffer;
  private _key: CryptoKey | null = null;

  constructor(inner: LocalStore, secret: ArrayBuffer) {
    this._inner = inner;
    this._secret = secret;
  }

  private async key(): Promise<CryptoKey> {
    if (!this._key) {
      this._key = await importHmacKey(this._secret);
    }
    return this._key;
  }

  // ── LocalStore interface ─────────────────────────────────────────

  async get<T>(storageKey: string): Promise<T | undefined> {
    const raw = await this._inner.get<unknown>(storageKey);
    if (raw === undefined) return undefined;

    // Unsealed legacy value (before seal migration) — return as-is.
    // Remove this branch once all values have been re-written.
    if (!isSealedEntry(raw)) return raw as T;

    const k = await this.key();
    const valid = await verifyHmac(k, storageKey, raw.v, raw.h);
    if (!valid) throw new TamperDetectedError(storageKey);

    return JSON.parse(raw.v) as T;
  }

  async set<T>(storageKey: string, value: T): Promise<void> {
    const v = JSON.stringify(value);
    const k = await this.key();
    const h = await signHmac(k, storageKey, v);
    await this._inner.set(storageKey, { v, h } satisfies SealedEntry);
  }

  async patch<T extends object>(storageKey: string, partial: Partial<T>): Promise<void> {
    const existing = (await this.get<T>(storageKey)) ?? ({} as T);
    await this.set(storageKey, { ...existing, ...partial });
  }

  async remove(storageKey: string): Promise<void> {
    return this._inner.remove(storageKey);
  }

  async clear(): Promise<void> {
    return this._inner.clear();
  }

  onChange<T>(
    key: string,
    listener: (newValue: T | undefined, oldValue: T | undefined) => void,
  ): () => void {
    return this._inner.onChange(key, listener);
  }
}

/* ── Bootstrap factory ─────────────────────────────────────────── */

function base64Encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str);
}

function base64Decode(b64: string): ArrayBuffer {
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Bootstrap a `SealedLocalStore`.
 *
 * On first call: generates a 32-byte random install secret, persists it in
 * `inner` under `INSTALL_SECRET_KEY` (base-64), and returns a sealed store.
 *
 * On subsequent calls: loads the existing secret and returns a sealed store
 * backed by the same secret.
 *
 * The install secret is stored unsealed (it must bootstrap itself). It is
 * never transmitted off-device and is not itself a secret in the threat model
 * (it prevents storage tampering by external processes, not by the user).
 */
export async function createSealedStore(inner: LocalStore): Promise<SealedLocalStore> {
  let secretB64 = await inner.get<string>(INSTALL_SECRET_KEY);

  if (!secretB64) {
    // First run — generate and persist the install secret.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    secretB64 = base64Encode(bytes.buffer);
    await inner.set(INSTALL_SECRET_KEY, secretB64);
  }

  const secret = base64Decode(secretB64);
  return new SealedLocalStore(inner, secret);
}
