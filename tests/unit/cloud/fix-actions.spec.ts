/**
 * T104 — Failing tests for fix-action buttons + write-scope upgrade flow.
 *
 * Covers:
 *   FR-A3   — Premium-only fix actions (remove public link, remove collaborator,
 *              downgrade to view)
 *   C-OAUTH-4 — Write-scope upgrade is a SEPARATE consent step, not bundled
 *               with the read-only OAuth flow.  Free-tier users never see the
 *               scope prompt.
 *
 * Design:
 *   applyFix(fileId, change, provider, tierGate) → FixResult
 *
 *   FixResult = { status: "applied" }
 *             | { status: "scope-declined" }
 *             | { status: "gate-blocked"; limit: number | string }
 *
 * Gate order (critical for UX + cost):
 *   1. TierGate.check("drive:fix-actions")  — free → gate-blocked immediately
 *   2. provider.upgradeToWriteScope()        — premium → separate consent prompt
 *   3. provider.applyPermissionChange(...)   — executes if scope granted
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyFix } from "~/cloud/fix-actions";
import { TierGate, type BillingProvider, type Tier } from "~/core/tier-gate";
import {
  FakeCloudStorageProvider,
  makePublicFile,
  makeFileMeta,
} from "../../fakes/cloud/fake-storage-provider";

/* ── Minimal billing providers for test isolation ─────────────────── */

class FreeBillingProvider implements BillingProvider {
  async getTier(): Promise<Tier> { return "free"; }
}

class PremiumBillingProvider implements BillingProvider {
  async getTier(): Promise<Tier> { return "premium"; }
}

/* ── Shared setup ─────────────────────────────────────────────────── */

let provider: FakeCloudStorageProvider;

beforeEach(() => {
  provider = new FakeCloudStorageProvider();
  provider._addFile(makePublicFile("f1", "report.pdf"));
});

/* ── Free-tier gating ─────────────────────────────────────────────── */

describe("applyFix — free tier", () => {
  it("returns gate-blocked for remove-public-link on free tier", async () => {
    const gate   = new TierGate(new FreeBillingProvider());
    const result = await applyFix("f1", { kind: "remove-public-link" }, provider, gate);

    expect(result.status).toBe("gate-blocked");
  });

  it("gate-blocked result carries a numeric limit (drive:fix-actions → 0)", async () => {
    const gate   = new TierGate(new FreeBillingProvider());
    const result = await applyFix("f1", { kind: "remove-public-link" }, provider, gate);

    expect(result.status).toBe("gate-blocked");
    if (result.status === "gate-blocked") {
      expect(typeof result.limit).toBe("number");
    }
  });

  it("does NOT call upgradeToWriteScope on free tier (C-OAUTH-4)", async () => {
    const gate        = new TierGate(new FreeBillingProvider());
    const upgradeSpy  = vi.spyOn(provider, "upgradeToWriteScope");

    await applyFix("f1", { kind: "remove-public-link" }, provider, gate);

    expect(upgradeSpy).not.toHaveBeenCalled();
  });

  it("does NOT call applyPermissionChange on free tier", async () => {
    const gate  = new TierGate(new FreeBillingProvider());
    const spy   = vi.spyOn(provider, "applyPermissionChange");

    await applyFix("f1", { kind: "remove-public-link" }, provider, gate);

    expect(spy).not.toHaveBeenCalled();
  });
});

/* ── Scope declined (premium, user cancels consent) ─────────────── */

describe("applyFix — premium, scope declined", () => {
  it("returns scope-declined when user cancels the write-scope prompt", async () => {
    const gate = new TierGate(new PremiumBillingProvider());
    provider._setUpgradeResult(false);   // user cancels

    const result = await applyFix("f1", { kind: "remove-public-link" }, provider, gate);

    expect(result.status).toBe("scope-declined");
  });

  it("does NOT call applyPermissionChange when scope is declined", async () => {
    const gate = new TierGate(new PremiumBillingProvider());
    provider._setUpgradeResult(false);
    const spy = vi.spyOn(provider, "applyPermissionChange");

    await applyFix("f1", { kind: "remove-public-link" }, provider, gate);

    expect(spy).not.toHaveBeenCalled();
  });
});

/* ── Happy path (premium, scope granted) ─────────────────────────── */

describe("applyFix — premium, scope granted", () => {
  it("returns applied for remove-public-link", async () => {
    const gate = new TierGate(new PremiumBillingProvider());
    provider._setUpgradeResult(true);

    const result = await applyFix("f1", { kind: "remove-public-link" }, provider, gate);

    expect(result.status).toBe("applied");
  });

  it("calls applyPermissionChange with the correct fileId and change", async () => {
    const gate = new TierGate(new PremiumBillingProvider());
    provider._setUpgradeResult(true);

    await applyFix("f1", { kind: "remove-public-link" }, provider, gate);

    const applied = provider._getAppliedChanges();
    expect(applied).toHaveLength(1);
    expect(applied[0]!.fileId).toBe("f1");
    expect(applied[0]!.change).toEqual({ kind: "remove-public-link" });
  });

  it("handles remove-collaborator with email", async () => {
    const gate = new TierGate(new PremiumBillingProvider());
    provider._addFile(makeFileMeta({
      id:          "f2",
      name:        "collab.pdf",
      permissions: {
        isPublicLink:          false,
        externalCollaborators: ["alice@other.com"],
        externalEditors:       [],
      },
    }));
    provider._setUpgradeResult(true);

    const result = await applyFix(
      "f2",
      { kind: "remove-collaborator", email: "alice@other.com" },
      provider,
      gate,
    );

    expect(result.status).toBe("applied");
    const applied = provider._getAppliedChanges();
    expect(applied[0]!.change).toEqual({
      kind:  "remove-collaborator",
      email: "alice@other.com",
    });
  });

  it("handles downgrade-to-view with email", async () => {
    const gate = new TierGate(new PremiumBillingProvider());
    provider._addFile(makeFileMeta({
      id:          "f3",
      name:        "editor.pdf",
      permissions: {
        isPublicLink:          false,
        externalCollaborators: [],
        externalEditors:       ["bob@other.com"],
      },
    }));
    provider._setUpgradeResult(true);

    const result = await applyFix(
      "f3",
      { kind: "downgrade-to-view", email: "bob@other.com" },
      provider,
      gate,
    );

    expect(result.status).toBe("applied");
    const applied = provider._getAppliedChanges();
    expect(applied[0]!.change).toEqual({
      kind:  "downgrade-to-view",
      email: "bob@other.com",
    });
  });

  // ── C-OAUTH-4 verification ─────────────────────────────────────

  it("calls upgradeToWriteScope BEFORE applyPermissionChange (C-OAUTH-4)", async () => {
    const gate  = new TierGate(new PremiumBillingProvider());
    provider._setUpgradeResult(true);

    const callOrder: string[] = [];
    vi.spyOn(provider, "upgradeToWriteScope").mockImplementation(async () => {
      callOrder.push("upgradeToWriteScope");
      return true;
    });
    vi.spyOn(provider, "applyPermissionChange").mockImplementation(async () => {
      callOrder.push("applyPermissionChange");
    });

    await applyFix("f1", { kind: "remove-public-link" }, provider, gate);

    expect(callOrder).toEqual(["upgradeToWriteScope", "applyPermissionChange"]);
  });

  it("calls upgradeToWriteScope exactly once per applyFix call", async () => {
    const gate      = new TierGate(new PremiumBillingProvider());
    provider._setUpgradeResult(true);
    const upgradeSpy = vi.spyOn(provider, "upgradeToWriteScope");

    await applyFix("f1", { kind: "remove-public-link" }, provider, gate);

    expect(upgradeSpy).toHaveBeenCalledTimes(1);
  });
});
