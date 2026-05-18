/**
 * Tests for Trusted Types policy — C-CS-1.
 *
 * Covers: policy registration, all three creators throw TypeError,
 * idempotency, returns null when trustedTypes is absent.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  installTrustedTypesPolicy,
  _resetPolicyForTests,
} from "~/security/trusted-types";

/* ── TrustedTypes shim for jsdom ─────────────────────────────────
 * jsdom does not implement Trusted Types. We provide a minimal shim that
 * matches the shape expected by installTrustedTypesPolicy():
 *   trustedTypes.createPolicy(name, options) → policy object
 */

type PolicyOptions = {
  createHTML?: (input: string) => string;
  createScript?: (input: string) => string;
  createScriptURL?: (input: string) => string;
};

type FakePolicy = {
  createHTML: (input: string) => string;
  createScript: (input: string) => string;
  createScriptURL: (input: string) => string;
};

function makeFakeTrustedTypes() {
  const registeredPolicies = new Map<string, FakePolicy>();

  return {
    createPolicy(name: string, options: PolicyOptions): FakePolicy {
      const policy: FakePolicy = {
        createHTML: options.createHTML ?? ((s) => s),
        createScript: options.createScript ?? ((s) => s),
        createScriptURL: options.createScriptURL ?? ((s) => s),
      };
      registeredPolicies.set(name, policy);
      return policy;
    },
    _getPolicy(name: string): FakePolicy | undefined {
      return registeredPolicies.get(name);
    },
  };
}

/* ── Suite ──────────────────────────────────────────────────────── */

describe("installTrustedTypesPolicy (C-CS-1)", () => {
  type WindowWithTT = { trustedTypes?: unknown };

  let originalTT: unknown;

  beforeEach(() => {
    _resetPolicyForTests();
    originalTT = (window as unknown as WindowWithTT).trustedTypes;
  });

  afterEach(() => {
    if (originalTT === undefined) {
      delete (window as unknown as WindowWithTT).trustedTypes;
    } else {
      (window as unknown as WindowWithTT).trustedTypes =
        originalTT as ReturnType<typeof makeFakeTrustedTypes>;
    }
    _resetPolicyForTests();
  });

  // ── Returns null when Trusted Types not supported ──────────────

  it("returns null when window.trustedTypes is undefined", () => {
    delete (window as unknown as WindowWithTT).trustedTypes;
    const result = installTrustedTypesPolicy();
    expect(result).toBeNull();
  });

  // ── Policy registration ────────────────────────────────────────

  it("registers a policy named 'shieldme' when trustedTypes is available", () => {
    const fakeTT = makeFakeTrustedTypes();
    (window as unknown as WindowWithTT).trustedTypes = fakeTT;

    const policy = installTrustedTypesPolicy();

    expect(policy).not.toBeNull();
    expect(fakeTT._getPolicy("shieldme")).toBeDefined();
  });

  it("returns the policy object on success", () => {
    const fakeTT = makeFakeTrustedTypes();
    (window as unknown as WindowWithTT).trustedTypes = fakeTT;

    const policy = installTrustedTypesPolicy();

    expect(policy).not.toBeNull();
    expect(typeof policy).toBe("object");
  });

  // ── createHTML throws ──────────────────────────────────────────

  it("createHTML throws TypeError", () => {
    const fakeTT = makeFakeTrustedTypes();
    (window as unknown as WindowWithTT).trustedTypes = fakeTT;

    const policy = installTrustedTypesPolicy() as unknown as FakePolicy;

    expect(() => policy.createHTML("<script>bad</script>")).toThrow(TypeError);
    expect(() => policy.createHTML("<b>any html</b>")).toThrow(
      /refuses all DOM injection/,
    );
  });

  // ── createScript throws ────────────────────────────────────────

  it("createScript throws TypeError", () => {
    const fakeTT = makeFakeTrustedTypes();
    (window as unknown as WindowWithTT).trustedTypes = fakeTT;

    const policy = installTrustedTypesPolicy() as unknown as FakePolicy;

    expect(() => policy.createScript("alert(1)")).toThrow(TypeError);
    expect(() => policy.createScript("console.log('x')")).toThrow(
      /refuses all DOM injection/,
    );
  });

  // ── createScriptURL throws ─────────────────────────────────────

  it("createScriptURL throws TypeError", () => {
    const fakeTT = makeFakeTrustedTypes();
    (window as unknown as WindowWithTT).trustedTypes = fakeTT;

    const policy = installTrustedTypesPolicy() as unknown as FakePolicy;

    expect(() => policy.createScriptURL("https://evil.example/bad.js")).toThrow(TypeError);
  });

  // ── Idempotency ────────────────────────────────────────────────

  it("is idempotent: calling twice returns the same policy without error", () => {
    const fakeTT = makeFakeTrustedTypes();
    (window as unknown as WindowWithTT).trustedTypes = fakeTT;

    const policy1 = installTrustedTypesPolicy();
    const policy2 = installTrustedTypesPolicy();

    expect(policy1).not.toBeNull();
    expect(policy2).not.toBeNull();
    // Same object reference (cached singleton)
    expect(policy1).toBe(policy2);
  });

  it("second call does not throw even without trustedTypes.createPolicy being called twice", () => {
    const fakeTT = makeFakeTrustedTypes();
    (window as unknown as WindowWithTT).trustedTypes = fakeTT;

    expect(() => {
      installTrustedTypesPolicy();
      installTrustedTypesPolicy();
      installTrustedTypesPolicy();
    }).not.toThrow();
  });
});
