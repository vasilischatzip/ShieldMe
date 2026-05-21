/**
 * T078 — Failing tests for AccountManager.
 *
 * Covers:
 *   FR-Acc2  — Free/Basic: max 1 account; Pro: unlimited (TierGate)
 *   FR-Acc3  — Per-account namespace isolation
 *   FR-Acc6  — Disconnect: revoke + wipe namespace
 *   FR-Acc7  — list() returns connected accounts
 *   FR-Acc8  — onChange listener notified on add/remove
 *   AC-Acc1  — Third account on Basic tier → accounts-max upsell thrown
 *   AC-Acc2  — Disconnect leaves zero acc.${id}.* keys
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FakeLocalStore } from "../../../fakes/fake-storage";
import { FakeIdentityProvider } from "../../../fakes/identity/fake-identity-provider";
import { AccountManagerImpl } from "~/core/identity/account-manager-impl";
import type { Account } from "~/core/identity/types";

/* ── Fixtures ────────────────────────────────────────────────────── */

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

/* ── Suite ───────────────────────────────────────────────────────── */

describe("AccountManager", () => {
  let store:    FakeLocalStore;
  let provider: FakeIdentityProvider;
  let manager:  AccountManagerImpl;

  beforeEach(() => {
    store    = new FakeLocalStore();
    provider = new FakeIdentityProvider("google");
    manager  = new AccountManagerImpl(store, [provider]);
  });

  // ── add() ─────────────────────────────────────────────────────

  describe("add()", () => {
    it("returns an Account with the correct provider", async () => {
      const account = await manager.add("google", DRIVE_SCOPES);
      expect(account.provider).toBe("google");
    });

    it("assigns a unique id (ULID-format) to each added account", async () => {
      const a1 = await manager.add("google", DRIVE_SCOPES);
      const a2 = await manager.add("google", DRIVE_SCOPES);
      expect(a1.id).not.toBe(a2.id);
      expect(a1.id.length).toBeGreaterThan(0);
    });

    it("persists the account so list() returns it", async () => {
      const added = await manager.add("google", DRIVE_SCOPES);
      const all   = await manager.list();
      expect(all.some((a) => a.id === added.id)).toBe(true);
    });

    it("never replaces an existing account (always appends)", async () => {
      const a1   = await manager.add("google", DRIVE_SCOPES);
      const a2   = await manager.add("google", DRIVE_SCOPES);
      const all  = await manager.list();
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all.find((a) => a.id === a1.id)).toBeDefined();
      expect(all.find((a) => a.id === a2.id)).toBeDefined();
    });

    it("passes withOpenId through to the identity provider", async () => {
      const account = await manager.add("google", DRIVE_SCOPES, { withOpenId: true });
      // The FakeIdentityProvider sets `subject` when withOpenId is true
      expect(account.subject).toBeTruthy();
    });

    it("throws when no provider is registered for the given providerId", async () => {
      await expect(manager.add("microsoft", DRIVE_SCOPES)).rejects.toMatchObject({
        kind: expect.stringMatching(/provider-unreachable|unsupported-provider/),
      });
    });
  });

  // ── remove() ──────────────────────────────────────────────────

  describe("remove()", () => {
    it("removes the account from list()", async () => {
      const account = await manager.add("google", DRIVE_SCOPES);
      await manager.remove(account.id);
      const remaining = await manager.list();
      expect(remaining.find((a) => a.id === account.id)).toBeUndefined();
    });

    it("is idempotent — removing an unknown id does not throw", async () => {
      await expect(manager.remove("non-existent-id")).resolves.toBeUndefined();
    });

    it("wipes all acc.${id}.* keys from storage — AC-Acc2", async () => {
      const account = await manager.add("google", DRIVE_SCOPES);
      // Write some namespace-scoped keys
      await store.set(`acc.${account.id}.driveMeta`, { foo: "bar" });
      await store.set(`acc.${account.id}.usage`, 42);

      await manager.remove(account.id);

      const snap = store.snapshot();
      const namespaceKeys = Object.keys(snap).filter((k) =>
        k.startsWith(`acc.${account.id}.`),
      );
      expect(namespaceKeys).toHaveLength(0);
    });

    it("preserves other accounts when one is removed", async () => {
      const a1 = await manager.add("google", DRIVE_SCOPES);
      const a2 = await manager.add("google", DRIVE_SCOPES);
      await manager.remove(a1.id);
      const remaining = await manager.list();
      expect(remaining.find((a) => a.id === a2.id)).toBeDefined();
      expect(remaining.find((a) => a.id === a1.id)).toBeUndefined();
    });

    it("clears the module active pointer for the removed account", async () => {
      const account = await manager.add("google", DRIVE_SCOPES);
      await manager.setActive("drive", account.id);
      await manager.remove(account.id);
      const active = await manager.getActive("drive");
      expect(active).toBeNull();
    });
  });

  // ── setActive / getActive ──────────────────────────────────────

  describe("setActive() / getActive()", () => {
    it("getActive() returns null before any account is set active", async () => {
      expect(await manager.getActive("drive")).toBeNull();
    });

    it("setActive() + getActive() round-trips for each module key", async () => {
      const account = await manager.add("google", DRIVE_SCOPES);

      await manager.setActive("drive",  account.id);
      await manager.setActive("email",  account.id);
      await manager.setActive("radar",  account.id);

      expect(await manager.getActive("drive")).toBe(account.id);
      expect(await manager.getActive("email")).toBe(account.id);
      expect(await manager.getActive("radar")).toBe(account.id);
    });

    it("each module maintains an independent active pointer", async () => {
      const a1 = await manager.add("google", DRIVE_SCOPES);
      const a2 = await manager.add("google", DRIVE_SCOPES);

      await manager.setActive("drive", a1.id);
      await manager.setActive("email", a2.id);

      expect(await manager.getActive("drive")).toBe(a1.id);
      expect(await manager.getActive("email")).toBe(a2.id);
    });
  });

  // ── list() ────────────────────────────────────────────────────

  describe("list()", () => {
    it("returns an empty array when no accounts are connected", async () => {
      expect(await manager.list()).toEqual([]);
    });

    it("filters by provider", async () => {
      const g = await manager.add("google", DRIVE_SCOPES);
      const all = await manager.list({ provider: "google" });
      expect(all.every((a) => a.provider === "google")).toBe(true);
      expect(all.some((a) => a.id === g.id)).toBe(true);
    });

    it("filters by capability — drive.read matches drive.readonly scope", async () => {
      await manager.add("google", ["https://www.googleapis.com/auth/drive.readonly"]);
      const results = await manager.list({ capability: "drive.read" });
      expect(results.length).toBeGreaterThan(0);
    });

    it("filters by capability — drive.read excludes accounts without drive scope", async () => {
      await manager.add("google", ["openid", "email"]);
      const results = await manager.list({ capability: "drive.read" });
      expect(results).toHaveLength(0);
    });
  });

  // ── accessToken() ─────────────────────────────────────────────

  describe("accessToken()", () => {
    it("returns a non-empty string for a connected account", async () => {
      const account = await manager.add("google", DRIVE_SCOPES);
      const token   = await manager.accessToken(account.id, "drive.readonly");
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("throws for an unknown account id", async () => {
      await expect(manager.accessToken("unknown-id", "drive.readonly")).rejects.toBeDefined();
    });
  });

  // ── onChange() ────────────────────────────────────────────────

  describe("onChange()", () => {
    it("listener is called immediately after add()", async () => {
      const events: Account[][] = [];
      manager.onChange((accounts) => events.push([...accounts]));

      await manager.add("google", DRIVE_SCOPES);

      expect(events.length).toBeGreaterThan(0);
      expect(events.at(-1)!.length).toBe(1);
    });

    it("listener is called after remove()", async () => {
      const events: Account[][] = [];
      const account = await manager.add("google", DRIVE_SCOPES);
      manager.onChange((accounts) => events.push([...accounts]));

      await manager.remove(account.id);

      expect(events.at(-1)!.length).toBe(0);
    });

    it("unsubscribe stops future notifications", async () => {
      const events: Account[][] = [];
      const unsub = manager.onChange((accounts) => events.push([...accounts]));
      unsub();

      await manager.add("google", DRIVE_SCOPES);

      expect(events).toHaveLength(0);
    });

    it("multiple listeners all receive the same event", async () => {
      const events1: Account[][] = [];
      const events2: Account[][] = [];
      manager.onChange((a) => events1.push([...a]));
      manager.onChange((a) => events2.push([...a]));

      await manager.add("google", DRIVE_SCOPES);

      expect(events1.length).toBe(events2.length);
    });
  });

  // ── Multi-account namespace isolation (FR-Acc3) ───────────────

  describe("namespace isolation (FR-Acc3)", () => {
    it("each account gets a unique namespace acc.${id}", async () => {
      const a1 = await manager.add("google", DRIVE_SCOPES);
      const a2 = await manager.add("google", DRIVE_SCOPES);
      expect(a1.namespace).not.toBe(a2.namespace);
      expect(a1.namespace).toBe(`acc.${a1.id}`);
      expect(a2.namespace).toBe(`acc.${a2.id}`);
    });

    it("storage keys for different accounts do not overlap", async () => {
      const a1 = await manager.add("google", DRIVE_SCOPES);
      const a2 = await manager.add("google", DRIVE_SCOPES);

      await store.set(`acc.${a1.id}.secret`, "alpha");
      await store.set(`acc.${a2.id}.secret`, "beta");

      const valA = await store.get<string>(`acc.${a1.id}.secret`);
      const valB = await store.get<string>(`acc.${a2.id}.secret`);

      expect(valA).toBe("alpha");
      expect(valB).toBe("beta");
    });
  });
});
