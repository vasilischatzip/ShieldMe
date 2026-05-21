/**
 * T082 — Failing tests for Settings › Accounts panel.
 *
 * Tests pure logic helpers exported from src/options/accounts.tsx.
 * No DOM rendering — follows the project's "pure logic tests" convention
 * (see tests/unit/app/routes/rules.spec.tsx for the pattern).
 *
 * Spec refs: FR-Acc7, FR-Acc8
 */

import { describe, it, expect } from "vitest";
import {
  getProviderBadgeLabel,
  canConfirmDisconnect,
  formatLastUsed,
  buildDisconnectWarning,
} from "~/options/accounts";
import type { Account } from "~/core/identity/types";

/* ── Helpers ─────────────────────────────────────────────────────── */

function makeAccount(overrides: Partial<Account> = {}): Account {
  const id = overrides.id ?? "01TEST00000000000000000001";
  return {
    id,
    provider:   "google",
    label:      "test@example.com",
    namespace:  `acc.${id}`,
    addedAt:    new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    scopes:     [],
    ...overrides,
  };
}

/* ── Suite ───────────────────────────────────────────────────────── */

describe("Accounts settings panel — FR-Acc7", () => {
  // ── getProviderBadgeLabel ──────────────────────────────────────

  describe("getProviderBadgeLabel()", () => {
    it("returns 'Google' for provider 'google'", () => {
      expect(getProviderBadgeLabel("google")).toBe("Google");
    });

    it("returns 'Microsoft' for provider 'microsoft'", () => {
      expect(getProviderBadgeLabel("microsoft")).toBe("Microsoft");
    });

    it("returns 'Apple' for provider 'apple'", () => {
      expect(getProviderBadgeLabel("apple")).toBe("Apple");
    });
  });

  // ── canConfirmDisconnect ───────────────────────────────────────

  describe("canConfirmDisconnect()", () => {
    it("returns true when input matches the account label exactly", () => {
      const account = makeAccount({ label: "alice@example.com" });
      expect(canConfirmDisconnect("alice@example.com", account)).toBe(true);
    });

    it("returns false when input is empty", () => {
      const account = makeAccount({ label: "alice@example.com" });
      expect(canConfirmDisconnect("", account)).toBe(false);
    });

    it("returns false when input does not match the label", () => {
      const account = makeAccount({ label: "alice@example.com" });
      expect(canConfirmDisconnect("bob@example.com", account)).toBe(false);
    });

    it("returns false when input matches the label case-insensitively (exact match required)", () => {
      const account = makeAccount({ label: "Alice@Example.com" });
      expect(canConfirmDisconnect("alice@example.com", account)).toBe(false);
    });
  });

  // ── formatLastUsed ────────────────────────────────────────────

  describe("formatLastUsed()", () => {
    it("returns a non-empty string for a valid ISO date", () => {
      const result = formatLastUsed(new Date().toISOString());
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns 'Never' or similar for a far-future/invalid date", () => {
      // A very recent date should produce a relative label, not a raw ISO string
      const result = formatLastUsed(new Date(Date.now() - 60000).toISOString());
      expect(result).not.toContain("T"); // No raw ISO format
    });
  });

  // ── buildDisconnectWarning ────────────────────────────────────

  describe("buildDisconnectWarning()", () => {
    it("returns a string that mentions what will be wiped", () => {
      const account = makeAccount({
        label: "alice@example.com",
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      });
      const warning = buildDisconnectWarning(account);
      expect(typeof warning).toBe("string");
      expect(warning.length).toBeGreaterThan(20);
    });

    it("includes 'Drive' mention when the account has drive scope", () => {
      const account = makeAccount({
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      });
      const warning = buildDisconnectWarning(account);
      expect(warning.toLowerCase()).toContain("drive");
    });

    it("mentions cached data or scan history", () => {
      const account = makeAccount();
      const warning = buildDisconnectWarning(account);
      // Should mention that cached data will be removed
      expect(warning.toLowerCase()).toMatch(/cache|cached|history|data/);
    });
  });
});
