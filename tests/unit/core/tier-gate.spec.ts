import { describe, it, expect } from "vitest";
import {
  TierGate,
  PreviewBillingProvider,
  StripeBillingProvider,
  FREE_LIMITS,
  TierGateError,
  type BillingProvider,
  type Tier,
} from "~/core/tier-gate";

class FreeBillingProvider implements BillingProvider {
  async getTier(): Promise<Tier> {
    return "free";
  }
}

class PremiumBillingProvider implements BillingProvider {
  async getTier(): Promise<Tier> {
    return "premium";
  }
}

describe("TierGate — preview provider (default)", () => {
  const gate = new TierGate(new PreviewBillingProvider());

  it("every Feature returns allowed:true in preview", async () => {
    const features = [
      "scan:document",
      "scan:file-size",
      "scan:monthly-limit",
      "drive:audit-full",
      "drive:fix-actions",
      "drive:bulk-fix",
      "custom-rules:max",
      "whitelist:max",
      "ocr:file-size",
      "ocr:resolution",
      "export:full-report",
      "monitoring:continuous",
      "family:profiles",
      "radar:delete-me",
    ] as const;

    for (const feature of features) {
      const result = await gate.check(feature, { value: 999_999_999, scansThisMonth: 999 });
      expect(result.allowed, `feature "${feature}" should be allowed in preview`).toBe(true);
    }
  });
});

describe("TierGate — premium provider", () => {
  const gate = new TierGate(new PremiumBillingProvider());

  it("fix actions allowed for premium", async () => {
    expect((await gate.check("drive:fix-actions")).allowed).toBe(true);
  });

  it("delete-me allowed for premium", async () => {
    expect((await gate.check("radar:delete-me")).allowed).toBe(true);
  });
});

describe("TierGate — free provider (enforced limits)", () => {
  const gate = new TierGate(new FreeBillingProvider());

  it("scan:monthly-limit blocks when at limit", async () => {
    const result = await gate.check("scan:monthly-limit", {
      scansThisMonth: FREE_LIMITS.scansPerMonth,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.feature).toBe("scan:monthly-limit");
      expect(result.limit).toBe(FREE_LIMITS.scansPerMonth);
    }
  });

  it("scan:monthly-limit allows when under limit", async () => {
    const result = await gate.check("scan:monthly-limit", {
      scansThisMonth: FREE_LIMITS.scansPerMonth - 1,
    });
    expect(result.allowed).toBe(true);
  });

  it("scan:file-size blocks oversized file", async () => {
    const result = await gate.check("scan:file-size", {
      value: FREE_LIMITS.maxFileSizeBytes + 1,
    });
    expect(result.allowed).toBe(false);
  });

  it("scan:file-size allows exactly at limit", async () => {
    const result = await gate.check("scan:file-size", {
      value: FREE_LIMITS.maxFileSizeBytes,
    });
    expect(result.allowed).toBe(true);
  });

  it("drive:fix-actions always blocked on free", async () => {
    expect((await gate.check("drive:fix-actions")).allowed).toBe(false);
  });

  it("drive:bulk-fix always blocked on free", async () => {
    expect((await gate.check("drive:bulk-fix")).allowed).toBe(false);
  });

  it("export:full-report always blocked on free", async () => {
    expect((await gate.check("export:full-report")).allowed).toBe(false);
  });

  it("monitoring:continuous always blocked on free", async () => {
    expect((await gate.check("monitoring:continuous")).allowed).toBe(false);
  });

  it("radar:delete-me always blocked on free", async () => {
    expect((await gate.check("radar:delete-me")).allowed).toBe(false);
  });

  it("custom-rules:max blocks when at limit", async () => {
    const result = await gate.check("custom-rules:max", {
      value: FREE_LIMITS.customRulesMax,
    });
    expect(result.allowed).toBe(false);
  });

  it("custom-rules:max allows under limit", async () => {
    const result = await gate.check("custom-rules:max", {
      value: FREE_LIMITS.customRulesMax - 1,
    });
    expect(result.allowed).toBe(true);
  });

  it("whitelist:max blocks when at limit", async () => {
    expect(
      (await gate.check("whitelist:max", { value: FREE_LIMITS.whitelistMax })).allowed,
    ).toBe(false);
  });

  it("ocr:file-size blocks oversized image", async () => {
    expect(
      (await gate.check("ocr:file-size", { value: FREE_LIMITS.ocrMaxBytes + 1 })).allowed,
    ).toBe(false);
  });

  it("ocr:resolution blocks over-pixel image", async () => {
    expect(
      (await gate.check("ocr:resolution", { value: FREE_LIMITS.ocrMaxPixels + 1 })).allowed,
    ).toBe(false);
  });

  it("family:profiles always blocked on free", async () => {
    expect((await gate.check("family:profiles")).allowed).toBe(false);
  });
});

describe("TierGate.require()", () => {
  const gate = new TierGate(new FreeBillingProvider());

  it("throws TierGateError when not allowed", async () => {
    await expect(gate.require("drive:fix-actions")).rejects.toBeInstanceOf(TierGateError);
  });

  it("TierGateError carries the result", async () => {
    try {
      await gate.require("export:full-report");
    } catch (e) {
      expect(e).toBeInstanceOf(TierGateError);
      const err = e as TierGateError;
      expect(err.result.allowed).toBe(false);
      expect(err.result.feature).toBe("export:full-report");
    }
  });

  it("resolves without error when allowed (preview)", async () => {
    const previewGate = new TierGate(new PreviewBillingProvider());
    await expect(previewGate.require("drive:fix-actions")).resolves.toBeUndefined();
  });
});

describe("StripeBillingProvider", () => {
  it("throws NotYetAvailableError (M6 stub)", async () => {
    const provider = new StripeBillingProvider();
    await expect(provider.getTier()).rejects.toThrow("M6");
  });
});
