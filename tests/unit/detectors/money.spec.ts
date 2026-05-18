/**
 * T017 — Money category detector unit tests.
 *
 * Tests each detector's scan() against known-good and known-bad inputs.
 * All detectors follow the Detector contract (shape, purity, no I/O).
 */
import { describe, it, expect } from "vitest";
import type { DetectorContext } from "~/detectors/types";
import { creditCardDetector }    from "~/detectors/money/credit-card";
import { ibanDetector }          from "~/detectors/money/iban";
import { usBankDetector }        from "~/detectors/money/us-bank";
import { cryptoWalletDetector }  from "~/detectors/money/crypto-wallet";

/* ── Helpers ──────────────────────────────────────────────────── */

function ctx(text: string, locale = "en"): DetectorContext {
  return { locale, text, activeCustomRules: [], clock: Date };
}

/* ════════════════════════════════════════════════════════════ */

describe("credit-card detector", () => {
  it("has correct id, categoryId, region, shipTier", () => {
    expect(creditCardDetector.id).toBe("credit-card");
    expect(creditCardDetector.categoryId).toBe("myMoney");
    expect(creditCardDetector.region).toBe("global");
    expect(creditCardDetector.shipTier).toBe("ga");
  });

  it("detects Visa test PAN in plain text", () => {
    const findings = creditCardDetector.scan(ctx("card: 4111111111111111 expiry"));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("credit-card");
  });

  it("detects formatted PAN with spaces", () => {
    const findings = creditCardDetector.scan(ctx("4111 1111 1111 1111"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects formatted PAN with dashes", () => {
    const findings = creditCardDetector.scan(ctx("4111-1111-1111-1111"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects Amex (4-6-5 format)", () => {
    const findings = creditCardDetector.scan(ctx("378282246310005"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire on Luhn-invalid number", () => {
    const findings = creditCardDetector.scan(ctx("4111111111111112"));
    expect(findings.length).toBe(0);
  });

  it("does NOT fire on all-zeros", () => {
    const findings = creditCardDetector.scan(ctx("0000000000000000"));
    expect(findings.length).toBe(0);
  });

  it("finding has required shape", () => {
    const [f] = creditCardDetector.scan(ctx("4532015112830366 is my card"));
    expect(f).toBeDefined();
    expect(typeof f!.confidence).toBe("number");
    expect(f!.confidence).toBeGreaterThanOrEqual(0);
    expect(f!.confidence).toBeLessThanOrEqual(1);
    expect(f!.severity).toBe("critical");
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.contextSnippet).not.toContain(f!.match.value);
  });

  it("confidence is boosted by positive keywords", () => {
    const withContext = creditCardDetector.scan(
      ctx("My credit card number 4111111111111111 is above"),
    );
    const withoutContext = creditCardDetector.scan(ctx("4111111111111111"));
    expect(withContext[0]!.confidence).toBeGreaterThan(withoutContext[0]!.confidence);
  });

  it("is deterministic — same text same result", () => {
    const c = ctx("4111111111111111");
    expect(creditCardDetector.scan(c)).toEqual(creditCardDetector.scan(c));
  });

  it("does not mutate context", () => {
    const c = ctx("4111111111111111");
    const before = JSON.stringify(c);
    creditCardDetector.scan(c);
    expect(JSON.stringify(c)).toBe(before);
  });

  it("contextSnippet length ≤ 200 chars", () => {
    const [f] = creditCardDetector.scan(ctx("a".repeat(200) + "4111111111111111" + "b".repeat(200)));
    expect(f!.contextSnippet.length).toBeLessThanOrEqual(200);
  });

  it("match positions point to correct text", () => {
    const text = "card 4111111111111111 end";
    const [f] = creditCardDetector.scan(ctx(text));
    expect(f).toBeDefined();
    // match.value should appear at match.start in the original text
    expect(text.slice(f!.match.start, f!.match.end)).toBe(f!.match.value);
  });

  it("multiple PANs in text return multiple findings", () => {
    const findings = creditCardDetector.scan(
      ctx("4111111111111111 and 5500005555555559"),
    );
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("iban detector", () => {
  it("has correct id and metadata", () => {
    expect(ibanDetector.id).toBe("iban");
    expect(ibanDetector.categoryId).toBe("myMoney");
    expect(ibanDetector.shipTier).toBe("ga");
  });

  it("detects valid IBAN in text", () => {
    const findings = ibanDetector.scan(ctx("Please wire to GB82WEST12345698765432"));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("iban");
  });

  it("detects space-grouped IBAN", () => {
    const findings = ibanDetector.scan(ctx("IBAN: GB82 WEST 1234 5698 7654 32"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects German IBAN", () => {
    const findings = ibanDetector.scan(ctx("Kontonummer: DE89370400440532013000"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire on invalid mod-97 IBAN", () => {
    // off-by-one in last digit
    const findings = ibanDetector.scan(ctx("GB82WEST12345698765433"));
    expect(findings.length).toBe(0);
  });

  it("finding severity is critical", () => {
    const [f] = ibanDetector.scan(ctx("IBAN: DE89370400440532013000 thanks"));
    expect(f!.severity).toBe("critical");
  });

  it("contextSnippet is redacted", () => {
    const [f] = ibanDetector.scan(ctx("Wire to GB82WEST12345698765432 please"));
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.contextSnippet).not.toContain(f!.match.value);
  });

  it("confidence boosted by IBAN keywords", () => {
    const withKw = ibanDetector.scan(ctx("iban: GB82WEST12345698765432"));
    const noKw   = ibanDetector.scan(ctx("GB82WEST12345698765432"));
    expect(withKw[0]!.confidence).toBeGreaterThan(noKw[0]!.confidence);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("us-bank detector", () => {
  it("has correct id and metadata", () => {
    expect(usBankDetector.id).toBe("us-bank");
    expect(usBankDetector.categoryId).toBe("myMoney");
    expect(usBankDetector.shipTier).toBe("ga");
  });

  it("detects routing + account pair", () => {
    const text = "routing: 021000021 account: 123456789012";
    const findings = usBankDetector.scan(ctx(text));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("us-bank");
  });

  it("does NOT fire when routing number fails ABA checksum", () => {
    const text = "routing: 021000020 account: 123456789012";
    const findings = usBankDetector.scan(ctx(text));
    expect(findings.length).toBe(0);
  });

  it("does NOT fire with routing but no nearby account", () => {
    const text = "routing: 021000021" + " ".repeat(400) + "account: 123456789";
    const findings = usBankDetector.scan(ctx(text));
    expect(findings.length).toBe(0);
  });

  it("does NOT fire with account but no routing", () => {
    const text = "account: 123456789012";
    const findings = usBankDetector.scan(ctx(text));
    expect(findings.length).toBe(0);
  });

  it("finding severity is critical", () => {
    const [f] = usBankDetector.scan(ctx("routing: 021000021 account: 123456789012"));
    expect(f!.severity).toBe("critical");
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("crypto-wallet detector", () => {
  it("has correct id and metadata", () => {
    expect(cryptoWalletDetector.id).toBe("crypto-wallet");
    expect(cryptoWalletDetector.categoryId).toBe("myMoney");
    expect(cryptoWalletDetector.shipTier).toBe("ga");
  });

  it("detects Bitcoin P2PKH address", () => {
    const findings = cryptoWalletDetector.scan(
      ctx("Send to 1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf Na"),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("crypto-wallet");
  });

  it("detects Ethereum address", () => {
    const findings = cryptoWalletDetector.scan(
      ctx("ETH address: 0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects Bitcoin Bech32 address", () => {
    const findings = cryptoWalletDetector.scan(
      ctx("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("finding severity is warning (not critical)", () => {
    const [f] = cryptoWalletDetector.scan(
      ctx("wallet 1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf Na"),
    );
    expect(f!.severity).toBe("warning");
  });

  it("contextSnippet is redacted with •••", () => {
    const [f] = cryptoWalletDetector.scan(
      ctx("bitcoin wallet 1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf Na end"),
    );
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.contextSnippet).not.toContain(f!.match.value);
  });
});
