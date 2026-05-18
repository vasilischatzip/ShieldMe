/**
 * T068 — C-MEM-3 secret-branded type tests.
 *
 * Write-first (TDD): tests for src/core/types/secret.ts
 *
 * Secret-branded types carry a phantom `__secret` brand so they are
 * nominally distinct from plain strings and can be detected by an ESLint
 * rule (no-secret-logging) at the call site.
 *
 * These tests verify:
 *   1. Brand casts work (the runtime value is still a plain string)
 *   2. Each type can be created via its cast helper
 *   3. extractSecret() recovers the underlying value for legitimate use
 *   4. Types don't accidentally accept each other (TypeScript-only assertion)
 *   5. The zero helper returns a cleared brand (all-zero string of correct length)
 */
import { describe, it, expect } from "vitest";
import {
  asApiKey,
  asDecryptedKey,
  asEncryptedBlob,
  asRefreshToken,
  asIdToken,
  extractSecret,
  zeroSecret,
} from "~/core/types/secret";
import type {
  ApiKey,
  DecryptedKey,
  EncryptedBlob,
  RefreshToken,
  IdToken,
} from "~/core/types/secret";

/* ════════════════════════════════════════════════════════════════
   1. Cast helpers — runtime value is still a plain string
   ════════════════════════════════════════════════════════════════ */

describe("secret brand helpers — cast and extract", () => {
  it("asApiKey returns the same string value at runtime", () => {
    const raw = "sk-test-AAAAAABBBBBBCCCCCC";
    const key: ApiKey = asApiKey(raw);
    // The brand is a compile-time phantom; at runtime it's still a string
    expect(typeof key).toBe("string");
    expect(key as unknown as string).toBe(raw);
  });

  it("asDecryptedKey returns same string value", () => {
    const raw = "decrypted-secret-payload";
    const key: DecryptedKey = asDecryptedKey(raw);
    expect(key as unknown as string).toBe(raw);
  });

  it("asEncryptedBlob returns same string value", () => {
    const raw = "aes-gcm-ciphertext-b64";
    const blob: EncryptedBlob = asEncryptedBlob(raw);
    expect(blob as unknown as string).toBe(raw);
  });

  it("asRefreshToken returns same string value", () => {
    const raw = "1//refresh-token-base64";
    const token: RefreshToken = asRefreshToken(raw);
    expect(token as unknown as string).toBe(raw);
  });

  it("asIdToken returns same string value", () => {
    const raw = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig";
    const token: IdToken = asIdToken(raw);
    expect(token as unknown as string).toBe(raw);
  });
});

/* ════════════════════════════════════════════════════════════════
   2. extractSecret — unwraps branded value for legitimate callers
   ════════════════════════════════════════════════════════════════ */

describe("extractSecret", () => {
  it("returns the plain string from an ApiKey", () => {
    const raw = "sk-prod-XXXXXXXXXXX";
    const key = asApiKey(raw);
    expect(extractSecret(key)).toBe(raw);
  });

  it("returns the plain string from a DecryptedKey", () => {
    const raw = "binary-key-as-base64";
    const key = asDecryptedKey(raw);
    expect(extractSecret(key)).toBe(raw);
  });

  it("returns the plain string from a RefreshToken", () => {
    const raw = "1//token";
    const token = asRefreshToken(raw);
    expect(extractSecret(token)).toBe(raw);
  });

  it("returns the same value as casting to string", () => {
    const raw = "arbitrary-secret";
    const key = asApiKey(raw);
    // extractSecret should equal a direct unsafe cast
    expect(extractSecret(key)).toBe(key as unknown as string);
  });
});

/* ════════════════════════════════════════════════════════════════
   3. zeroSecret — returns a zero-filled string of the same length
   ════════════════════════════════════════════════════════════════ */

describe("zeroSecret", () => {
  it("returns a string of null characters with the same length", () => {
    const raw = "sk-test-12345";
    const key = asApiKey(raw);
    const zeroed = zeroSecret(key);
    expect(typeof zeroed).toBe("string");
    expect(zeroed.length).toBe(raw.length);
  });

  it("zeroed string contains only \\0 characters", () => {
    const key = asApiKey("ABCDEF");
    const zeroed = zeroSecret(key);
    expect([...zeroed].every((c) => c === "\0")).toBe(true);
  });

  it("zero-length secret produces empty zeroed string", () => {
    const key = asApiKey("");
    const zeroed = zeroSecret(key);
    expect(zeroed).toBe("");
  });

  it("does not modify the original branded value", () => {
    const raw = "keep-me-intact";
    const key = asApiKey(raw);
    zeroSecret(key);
    // The original is immutable — still the same
    expect(extractSecret(key)).toBe(raw);
  });
});

/* ════════════════════════════════════════════════════════════════
   4. Type shape — compiled assertions (type-level, not runtime)
      These are just smoke-tests that the module exports the right names.
   ════════════════════════════════════════════════════════════════ */

describe("type exports are present", () => {
  it("asApiKey is a function", () => {
    expect(typeof asApiKey).toBe("function");
  });

  it("asDecryptedKey is a function", () => {
    expect(typeof asDecryptedKey).toBe("function");
  });

  it("asEncryptedBlob is a function", () => {
    expect(typeof asEncryptedBlob).toBe("function");
  });

  it("asRefreshToken is a function", () => {
    expect(typeof asRefreshToken).toBe("function");
  });

  it("asIdToken is a function", () => {
    expect(typeof asIdToken).toBe("function");
  });

  it("extractSecret is a function", () => {
    expect(typeof extractSecret).toBe("function");
  });

  it("zeroSecret is a function", () => {
    expect(typeof zeroSecret).toBe("function");
  });
});
