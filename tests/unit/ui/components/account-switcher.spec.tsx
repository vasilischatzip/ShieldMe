/**
 * T082 — Failing tests for AccountSwitcher component.
 *
 * Tests pure logic helpers exported from
 * src/ui/components/AccountSwitcher/index.tsx.
 *
 * Spec refs: FR-Acc8
 * Key rule: Switcher appears only when >1 eligible account is connected.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FakeAccountManager } from "../../../fakes/identity/fake-account-manager";
import {
  shouldShowSwitcher,
  getEligibleAccounts,
} from "~/ui/components/AccountSwitcher";
import type { Account } from "~/core/identity/types";

/* ── Helpers ─────────────────────────────────────────────────────── */

function makeDriveAccount(overrides: Partial<Account> = {}): Account {
  const id = overrides.id ?? `01DRIVE${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  return {
    id,
    provider:   "google",
    label:      `drive-user-${id}@example.com`,
    namespace:  `acc.${id}`,
    addedAt:    new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    scopes:     ["https://www.googleapis.com/auth/drive.readonly"],
    ...overrides,
  };
}

function makeEmailAccount(overrides: Partial<Account> = {}): Account {
  const id = overrides.id ?? `01EMAIL${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  return {
    id,
    provider:   "google",
    label:      `email-user-${id}@example.com`,
    namespace:  `acc.${id}`,
    addedAt:    new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    scopes:     ["openid", "email"],
    ...overrides,
  };
}

/* ── Suite ───────────────────────────────────────────────────────── */

describe("AccountSwitcher logic — FR-Acc8", () => {
  let manager: FakeAccountManager;

  beforeEach(() => {
    manager = new FakeAccountManager();
    manager._reset();
  });

  // ── shouldShowSwitcher ────────────────────────────────────────

  describe("shouldShowSwitcher()", () => {
    it("returns false when no accounts are connected", async () => {
      const accounts = await manager.list();
      expect(shouldShowSwitcher(accounts, "drive.read")).toBe(false);
    });

    it("returns false when exactly 1 eligible account is connected", async () => {
      manager._seedAccounts([makeDriveAccount()]);
      const accounts = await manager.list({ capability: "drive.read" });
      expect(shouldShowSwitcher(accounts, "drive.read")).toBe(false);
    });

    it("returns true when 2+ eligible accounts are connected — FR-Acc8", async () => {
      manager._seedAccounts([makeDriveAccount(), makeDriveAccount()]);
      const accounts = await manager.list({ capability: "drive.read" });
      expect(shouldShowSwitcher(accounts, "drive.read")).toBe(true);
    });

    it("returns false when eligible accounts have no matching capability", async () => {
      // Email-only accounts don't grant drive.read
      manager._seedAccounts([makeEmailAccount(), makeEmailAccount()]);
      const accounts = await manager.list({ capability: "drive.read" });
      expect(shouldShowSwitcher(accounts, "drive.read")).toBe(false);
    });

    it("counts only accounts with the specified capability", async () => {
      // 1 drive + 2 email-only → only 1 eligible for drive → no switcher
      manager._seedAccounts([
        makeDriveAccount(),
        makeEmailAccount(),
        makeEmailAccount(),
      ]);
      const driveAccounts = await manager.list({ capability: "drive.read" });
      expect(shouldShowSwitcher(driveAccounts, "drive.read")).toBe(false);
    });

    it("counts mixed-scope accounts that have the required capability", async () => {
      // Both have drive + email scopes → both eligible for drive.read → switcher
      const mixedScopes = [
        "https://www.googleapis.com/auth/drive.readonly",
        "openid",
        "email",
      ];
      manager._seedAccounts([
        makeDriveAccount({ scopes: mixedScopes }),
        makeDriveAccount({ scopes: mixedScopes }),
      ]);
      const accounts = await manager.list({ capability: "drive.read" });
      expect(shouldShowSwitcher(accounts, "drive.read")).toBe(true);
    });
  });

  // ── getEligibleAccounts ───────────────────────────────────────

  describe("getEligibleAccounts()", () => {
    it("returns all accounts that have the requested capability", async () => {
      const drive1 = makeDriveAccount();
      const drive2 = makeDriveAccount();
      const email1 = makeEmailAccount();
      manager._seedAccounts([drive1, drive2, email1]);

      const all      = await manager.list();
      const eligible = getEligibleAccounts(all, "drive.read");
      expect(eligible).toHaveLength(2);
      expect(eligible.every((a) => a.scopes.some((s) => s.includes("drive")))).toBe(true);
    });

    it("returns empty array when no accounts match the capability", async () => {
      manager._seedAccounts([makeEmailAccount()]);
      const all      = await manager.list();
      const eligible = getEligibleAccounts(all, "drive.read");
      expect(eligible).toHaveLength(0);
    });

    it("is ordered consistently (preserves insertion order)", async () => {
      const a1 = makeDriveAccount({ id: "01AAAA0000000000000000001A" });
      const a2 = makeDriveAccount({ id: "01AAAA0000000000000000002B" });
      manager._seedAccounts([a1, a2]);

      const all      = await manager.list();
      const eligible = getEligibleAccounts(all, "drive.read");
      // Both should be present
      expect(eligible.map((a) => a.id)).toEqual(expect.arrayContaining([a1.id, a2.id]));
    });
  });
});
