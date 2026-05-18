/**
 * C-NET-2 — Runtime egress allowlist wrapper.
 *
 * Every network call from ShieldMe MUST go through `shieldFetch`.
 * Direct use of the global `fetch` is banned by ESLint (`no-restricted-globals`).
 *
 * Security contract:
 *   - Any host not in EGRESS_ALLOWLIST is rejected before the TCP connection.
 *   - Optional hosts (tessdata, plausible/telemetry) are gated by feature flags.
 *   - Failure mode: throws `FetchBlockedError` synchronously; never silently swallowed.
 *
 * Constitution §III (Least-privilege): the extension contacts the minimum set of
 * external services necessary.  This wrapper enforces that at runtime.
 *
 * Test: tests/unit/security/fetch.spec.ts
 */
import { EGRESS_ALLOWLIST, isAllowedHost } from "./egress-allowlist";

/* ── Optional host features ────────────────────────────────────── */

/**
 * Hosts that are in scope but require an explicit feature flag to be enabled.
 * The feature key maps to the human-readable rationale.
 */
export const FEATURE_GATED_HOSTS: Record<string, readonly string[]> = {
  /** OCR traineddata download — only when user initiates OCR scan. */
  tessdata: ["tessdata.projectnaptha.com"],
  /** Privacy-safe analytics — only when user opts in to telemetry. */
  telemetry: ["plausible.io"],
  /** Stripe checkout (M6+). */
  stripe: ["js.stripe.com", "api.stripe.com", "hooks.stripe.com"],
};

/* ── Error type ─────────────────────────────────────────────────── */

export class FetchBlockedError extends Error {
  readonly blockedHost: string;

  constructor(host: string) {
    super(
      `[C-NET-2] Egress blocked: "${host}" is not in the ShieldMe allowlist. ` +
        `Add to contracts/integration-apis.md §1 if required.`,
    );
    this.name = "FetchBlockedError";
    this.blockedHost = host;
  }
}

/* ── Host extraction ────────────────────────────────────────────── */

function extractHost(input: string | URL | Request): string | null {
  try {
    const url =
      input instanceof URL
        ? input
        : input instanceof Request
          ? new URL(input.url)
          : new URL(input);
    return url.hostname;
  } catch {
    // Non-parseable or data:/blob: URIs
    return null;
  }
}

/* ── Factory ─────────────────────────────────────────────────────── */

export interface ShieldFetchOptions {
  /** The underlying fetch implementation to delegate to when allowed. */
  inner?: typeof globalThis.fetch;
  /** Feature flags that enable optional gated hosts. */
  enabledFeatures?: ReadonlySet<string>;
}

/**
 * Creates an allowlist-checked fetch function.
 * Use `createShieldFetch` in tests to inject a mock inner fetch.
 * In production, use the pre-built `shieldFetch` singleton below.
 */
export function createShieldFetch(
  opts: ShieldFetchOptions = {},
): typeof globalThis.fetch {
  const inner = opts.inner ?? globalThis.fetch;
  const enabledFeatures: ReadonlySet<string> = opts.enabledFeatures ?? new Set();

  function isFeatureGatedHost(host: string): boolean {
    for (const [feature, hosts] of Object.entries(FEATURE_GATED_HOSTS)) {
      if (!enabledFeatures.has(feature)) continue;
      if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return true;
    }
    return false;
  }

  function isPermittedHost(host: string): boolean {
    // Layer 1: core allowlist is always enabled.
    if (isAllowedHost(host)) return true;
    // Layer 2: feature-gated optional hosts.
    return isFeatureGatedHost(host);
  }

  return async function shieldedFetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const host = extractHost(input);

    if (host === null || !isPermittedHost(host)) {
      throw new FetchBlockedError(host ?? String(input));
    }

    return inner(input as string, init);
  };
}

/* ── Singleton ───────────────────────────────────────────────────── */

/**
 * Production singleton — uses `globalThis.fetch` and no optional features.
 * Optional feature flags are injected at call sites via `createShieldFetch`
 * (e.g., background service worker enables "tessdata" when OCR is started).
 *
 * Import this in place of the global `fetch` everywhere in production code.
 */
export const shieldFetch: typeof globalThis.fetch = createShieldFetch();

// Re-export allowlist for convenience
export { EGRESS_ALLOWLIST, isAllowedHost };
