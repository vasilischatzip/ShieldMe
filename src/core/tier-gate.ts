/**
 * TierGate — single choke-point for all capacity-gated features.
 * Today's resolver: PreviewBillingProvider → everyone is "premium-preview".
 * Flipping to real gating (M6) is a one-line resolver swap in this file.
 *
 * See: specs/001-shieldme-mvp/contracts/integration-apis.md — BillingProvider
 */

export type Tier = "free" | "premium" | "premium-preview";

/** All features that can be gated. Extend this union when adding new premium features. */
export type Feature =
  | "scan:document"
  | "scan:file-size"
  | "scan:monthly-limit"
  | "drive:audit-full"
  | "drive:fix-actions"
  | "drive:bulk-fix"
  | "custom-rules:max"
  | "whitelist:max"
  | "ocr:file-size"
  | "ocr:resolution"
  | "export:full-report"
  | "monitoring:continuous"
  | "family:profiles"
  | "radar:delete-me";

export type TierCheckResult =
  | { allowed: true }
  | { allowed: false; reason: "free-limit"; feature: Feature; limit: number | string };

export interface BillingProvider {
  getTier(): Promise<Tier>;
}

/**
 * Free-tier limits. These are the normative values.
 * Source: docs/engineering-qa.md §"Free-Tier Limits"
 */
export const FREE_LIMITS = {
  scansPerMonth: 5,
  maxFileSizeBytes: 10 * 1024 * 1024,       // 10 MB
  driveAuditMaxFiles: 100,
  customRulesMax: 3,
  whitelistMax: 10,
  ocrMaxBytes: 5 * 1024 * 1024,             // 5 MB
  ocrMaxPixels: 2048 * 2048,
} as const;

/** Ships today — everyone gets premium-preview (TierGate always returns allowed). */
export class PreviewBillingProvider implements BillingProvider {
  async getTier(): Promise<Tier> {
    return "premium-preview";
  }
}

/** Stubbed — throws until M6 when Stripe is wired. */
export class StripeBillingProvider implements BillingProvider {
  async getTier(): Promise<Tier> {
    throw new Error("StripeBillingProvider not yet active (M6)");
  }
}

export class TierGate {
  constructor(private billing: BillingProvider = new PreviewBillingProvider()) {}

  async check(
    feature: Feature,
    ctx: {
      /** Current value being checked against the limit (optional for boolean gates). */
      value?: number;
      /** Current monthly scan count (for scan:monthly-limit). */
      scansThisMonth?: number;
    } = {},
  ): Promise<TierCheckResult> {
    const tier = await this.billing.getTier();

    // Premium or preview → always allowed
    if (tier !== "free") return { allowed: true };

    // Free-tier enforcement
    switch (feature) {
      case "scan:monthly-limit": {
        const count = ctx.scansThisMonth ?? 0;
        if (count >= FREE_LIMITS.scansPerMonth) {
          return { allowed: false, reason: "free-limit", feature, limit: FREE_LIMITS.scansPerMonth };
        }
        return { allowed: true };
      }
      case "scan:file-size":
      case "ocr:file-size": {
        const limit =
          feature === "scan:file-size" ? FREE_LIMITS.maxFileSizeBytes : FREE_LIMITS.ocrMaxBytes;
        if ((ctx.value ?? 0) > limit) {
          return { allowed: false, reason: "free-limit", feature, limit };
        }
        return { allowed: true };
      }
      case "ocr:resolution": {
        if ((ctx.value ?? 0) > FREE_LIMITS.ocrMaxPixels) {
          return {
            allowed: false,
            reason: "free-limit",
            feature,
            limit: FREE_LIMITS.ocrMaxPixels,
          };
        }
        return { allowed: true };
      }
      case "drive:audit-full": {
        return { allowed: false, reason: "free-limit", feature, limit: FREE_LIMITS.driveAuditMaxFiles };
      }
      case "drive:fix-actions":
      case "drive:bulk-fix":
      case "export:full-report":
      case "monitoring:continuous":
      case "radar:delete-me":
        return { allowed: false, reason: "free-limit", feature, limit: 0 };
      case "custom-rules:max": {
        if ((ctx.value ?? 0) >= FREE_LIMITS.customRulesMax) {
          return { allowed: false, reason: "free-limit", feature, limit: FREE_LIMITS.customRulesMax };
        }
        return { allowed: true };
      }
      case "whitelist:max": {
        if ((ctx.value ?? 0) >= FREE_LIMITS.whitelistMax) {
          return { allowed: false, reason: "free-limit", feature, limit: FREE_LIMITS.whitelistMax };
        }
        return { allowed: true };
      }
      case "family:profiles":
        return { allowed: false, reason: "free-limit", feature, limit: 0 };
      case "scan:document":
        return { allowed: true }; // Gated only by monthly-limit + file-size
      default:
        return { allowed: true };
    }
  }

  /** Convenience: throw a typed error if not allowed (for imperative call sites). */
  async require(feature: Feature, ctx: Parameters<TierGate["check"]>[1] = {}): Promise<void> {
    const result = await this.check(feature, ctx);
    if (!result.allowed) {
      throw new TierGateError(result);
    }
  }
}

export class TierGateError extends Error {
  constructor(public readonly result: Extract<TierCheckResult, { allowed: false }>) {
    super(`Feature "${result.feature}" requires Premium (free limit: ${result.limit})`);
    this.name = "TierGateError";
  }
}

/** Default singleton — imported by all production callers. */
export const tierGate = new TierGate(new PreviewBillingProvider());
