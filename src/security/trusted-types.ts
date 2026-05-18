/**
 * Trusted Types policy — C-CS-1.
 *
 * Registers the single `shieldme` Trusted Types policy. All three policy
 * creators (createHTML, createScript, createScriptURL) unconditionally throw
 * because this codebase has no legitimate need for DOM injection, script
 * evaluation, or dynamic script URLs.
 *
 * Motivation (security-controls.md C-CS-1):
 *   Every DOM mutation goes through the `shieldme` policy. Raw innerHTML
 *   assignment fails at runtime. The policy is intentionally restrictive:
 *   if any code path somehow reaches a Trusted Types creator, it is a bug.
 *
 * The extension CSP declares:
 *   trusted-types shieldme; require-trusted-types-for 'script';
 *
 * This function is idempotent: repeated calls return the same policy object
 * (the browser deduplicates policy registration under the same name).
 *
 * Constitution §VIII (Zero Runtime External Dependencies):
 *   No eval, no new Function. This policy enforces that invariant at the
 *   DOM level.
 */

/* ── Policy name ────────────────────────────────────────────────── */

const POLICY_NAME = "shieldme";

/* ── Singleton holder (module-private) ─────────────────────────── */

let _policy: TrustedTypePolicy | null = null;

/* ── Public API ─────────────────────────────────────────────────── */

/**
 * Install (or return) the `shieldme` Trusted Types policy.
 *
 * All creators throw `TypeError` — this codebase never injects raw HTML,
 * never evaluates scripts dynamically, and never constructs remote script
 * URLs.
 *
 * @returns The registered TrustedTypePolicy, or `null` if the browser does
 *          not support Trusted Types (pre-Chromium-83, non-Chromium browsers,
 *          or test environments without a TT shim).
 */
export function installTrustedTypesPolicy(): TrustedTypePolicy | null {
  // Return cached policy if already registered.
  if (_policy !== null) return _policy;

  // Guard: Trusted Types is Chrome/Edge-only; not present in all environments.
  if (
    typeof window === "undefined" ||
    typeof (window as Window & { trustedTypes?: TrustedTypePolicyFactory }).trustedTypes ===
      "undefined"
  ) {
    return null;
  }

  const tt = (window as Window & { trustedTypes: TrustedTypePolicyFactory }).trustedTypes;

  _policy = tt.createPolicy(POLICY_NAME, {
    // All creators unconditionally throw — this codebase has no legitimate
    // use case for trusted HTML, script, or script-URL injection.
    // The `never` return type is inferred by TypeScript because every branch throws.
    createHTML: (_input) => {
      throw new TypeError(
        `Trusted Types policy '${POLICY_NAME}' refuses all DOM injection. ` +
          `Raw HTML is never safe in this extension.`,
      );
    },
    createScript: (_input) => {
      throw new TypeError(
        `Trusted Types policy '${POLICY_NAME}' refuses all DOM injection. ` +
          `Dynamic script evaluation is forbidden (Constitution §VIII).`,
      );
    },
    createScriptURL: (_input) => {
      throw new TypeError(
        `Trusted Types policy '${POLICY_NAME}' refuses all DOM injection. ` +
          `Remote script URLs are forbidden (Constitution §VIII).`,
      );
    },
  });

  return _policy;
}

/**
 * Reset the cached policy reference.
 *
 * @internal Used in tests only to allow idempotency verification across
 * isolated test cases. Not part of the production API.
 */
export function _resetPolicyForTests(): void {
  _policy = null;
}
