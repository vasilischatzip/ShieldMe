/**
 * C-MEM-3 — Secret-branded types.
 *
 * Types `ApiKey`, `DecryptedKey`, `EncryptedBlob`, `RefreshToken`, and
 * `IdToken` carry a phantom `__secret` brand so they are nominally distinct
 * from plain strings. This makes accidental logging type-detectable.
 *
 * Usage:
 *   const key: ApiKey = asApiKey(rawString);
 *   // to use legitimately in a crypto call:
 *   const raw = extractSecret(key);
 *
 * ESLint rule `no-secret-logging` (configured in eslint.config.js) rejects
 * any `console.*` call receiving a value typed as one of these branded types.
 *
 * Constitution §V (Privacy First):
 * Secrets must never appear in logs or error messages. The phantom brand
 * ensures TypeScript catches accidental leaks at compile time.
 */

/* ── Brand infrastructure ──────────────────────────────────────── */

declare const __secretBrand: unique symbol;

/**
 * Phantom brand marker.  The `__secret` property doesn't exist at runtime —
 * it's erased by TypeScript.  Carry it on a type to make that type nominally
 * distinct from `string`.
 */
type SecretBrand<Tag extends string> = {
  readonly [__secretBrand]: Tag;
};

/** A plain string carrying the secret brand for a specific tag. */
export type Secret<Tag extends string> = string & SecretBrand<Tag>;

/* ── Concrete secret types ─────────────────────────────────────── */

/** A user's API key for an external service (HIBP, OpenAI, etc.). */
export type ApiKey = Secret<"ApiKey">;

/** A key that has been decrypted from the key vault (in-memory only). */
export type DecryptedKey = Secret<"DecryptedKey">;

/** An AES-GCM ciphertext blob (base-64 encoded). */
export type EncryptedBlob = Secret<"EncryptedBlob">;

/** An OAuth refresh token. */
export type RefreshToken = Secret<"RefreshToken">;

/** An OAuth ID token / OIDC JWT. */
export type IdToken = Secret<"IdToken">;

/* ── Cast helpers ──────────────────────────────────────────────── */

/**
 * Unsafe cast — wraps a raw string as the given secret brand.
 * Call sites are explicit; TypeScript won't coerce `string → ApiKey`.
 *
 * These helpers are intentionally verbose (`asApiKey(raw)` not a generic
 * `asSecret<ApiKey>(raw)`) so call sites are grepped easily.
 */

export function asApiKey(raw: string): ApiKey {
  return raw as ApiKey;
}

export function asDecryptedKey(raw: string): DecryptedKey {
  return raw as DecryptedKey;
}

export function asEncryptedBlob(raw: string): EncryptedBlob {
  return raw as EncryptedBlob;
}

export function asRefreshToken(raw: string): RefreshToken {
  return raw as RefreshToken;
}

export function asIdToken(raw: string): IdToken {
  return raw as IdToken;
}

/* ── Extractor ─────────────────────────────────────────────────── */

/**
 * Explicitly unwrap a branded secret to its underlying string.
 * Only call this at a legitimate use site (e.g., passing to a crypto
 * function or building an Authorization header).
 *
 * Naming it `extractSecret` rather than a cast makes the intent visible
 * at the call site and is easy to grep in security reviews.
 */
export function extractSecret<Tag extends string>(
  secret: Secret<Tag>,
): string {
  return secret as unknown as string;
}

/* ── Zeroing ───────────────────────────────────────────────────── */

/**
 * Returns a string of the same length filled with null characters (`\0`).
 *
 * JavaScript strings are immutable, so we can't zero-fill in-place.
 * Use this to create a "cleared" representation.  The pattern is:
 *
 *   const key = asApiKey(rawFromStorage);
 *   try {
 *     await useKey(key);
 *   } finally {
 *     // Signal that the caller is done with this secret.
 *     // The zeroed string won't be logged accidentally.
 *     void zeroSecret(key);
 *   }
 *
 * For true in-memory zeroing of binary key material, prefer
 * `crypto.subtle` with non-extractable keys or typed array zeroing:
 *   `new Uint8Array(buffer).fill(0)`
 */
export function zeroSecret<Tag extends string>(secret: Secret<Tag>): string {
  return "\0".repeat((secret as unknown as string).length);
}
