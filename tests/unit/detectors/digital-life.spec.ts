/**
 * T019 / T019b — Digital Life category detector unit tests.
 */
import { describe, it, expect } from "vitest";
import type { DetectorContext } from "~/detectors/types";
import { apiKeyDetector }      from "~/detectors/digital-life/api-key";
import { privateKeyDetector }  from "~/detectors/digital-life/private-key";
import { passwordDetector }    from "~/detectors/digital-life/password";
import { emailDetector }       from "~/detectors/digital-life/email";
import { phoneIntlDetector }   from "~/detectors/digital-life/phone-intl";

function ctx(text: string): DetectorContext {
  return { locale: "en", text, activeCustomRules: [], clock: Date };
}

/* ════════════════════════════════════════════════════════════ */

describe("api-key detector", () => {
  it("has correct metadata", () => {
    expect(apiKeyDetector.id).toBe("api-key");
    expect(apiKeyDetector.categoryId).toBe("myDigitalLife");
    expect(apiKeyDetector.shipTier).toBe("ga");
  });

  it("detects AWS access key ID (AKIA prefix)", () => {
    const findings = apiKeyDetector.scan(ctx("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("api-key");
  });

  it("detects GitHub PAT (ghp_ prefix)", () => {
    const findings = apiKeyDetector.scan(
      ctx("token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"),  // ghp_ + 36 chars (A-Z=26 + 10 digits)
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects Google API key (AIza prefix)", () => {
    const findings = apiKeyDetector.scan(
      ctx("api_key = AIzaSyC4EXAMPLE_KEY_1234567890123456789"),  // AIza + 35 chars
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects Stripe secret key (sk_live_ prefix)", () => {
    const findings = apiKeyDetector.scan(
      ctx("secret key: sk_live_AbCdEfGhIjKlMnOpQrStUvWx12345"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects Bearer token", () => {
    const findings = apiKeyDetector.scan(
      ctx("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("finding severity is critical", () => {
    const [f] = apiKeyDetector.scan(ctx("key=AKIAIOSFODNN7EXAMPLE here"));
    expect(f!.severity).toBe("critical");
  });

  it("contextSnippet is redacted", () => {
    const [f] = apiKeyDetector.scan(ctx("api_key=AKIAIOSFODNN7EXAMPLE here"));
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.contextSnippet).not.toContain(f!.match.value);
  });

  it("is deterministic", () => {
    const c = ctx("AWS_KEY=AKIAIOSFODNN7EXAMPLE");
    expect(apiKeyDetector.scan(c)).toEqual(apiKeyDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("private-key detector", () => {
  const RSA_KEY = [
    "-----BEGIN RSA PRIVATE KEY-----",
    "MIIEpAIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtcNagFjmQxQ==",
    "-----END RSA PRIVATE KEY-----",
  ].join("\n");

  const EC_KEY = [
    "-----BEGIN EC PRIVATE KEY-----",
    "MHQCAQEEIOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=",
    "-----END EC PRIVATE KEY-----",
  ].join("\n");

  it("has correct metadata", () => {
    expect(privateKeyDetector.id).toBe("private-key");
    expect(privateKeyDetector.categoryId).toBe("myDigitalLife");
    expect(privateKeyDetector.shipTier).toBe("ga");
  });

  it("detects RSA private key PEM block", () => {
    const findings = privateKeyDetector.scan(ctx(`Key file:\n${RSA_KEY}\n`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("private-key");
  });

  it("detects EC private key PEM block", () => {
    const findings = privateKeyDetector.scan(ctx(`${EC_KEY}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects OPENSSH private key", () => {
    const key = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXkt\n-----END OPENSSH PRIVATE KEY-----";
    const findings = privateKeyDetector.scan(ctx(key));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire on certificate (public)", () => {
    const cert = "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----";
    const findings = privateKeyDetector.scan(ctx(cert));
    expect(findings.length).toBe(0);
  });

  it("does NOT fire on public key", () => {
    const pub = "-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----";
    const findings = privateKeyDetector.scan(ctx(pub));
    expect(findings.length).toBe(0);
  });

  it("finding confidence is 1.0 (unambiguous)", () => {
    const [f] = privateKeyDetector.scan(ctx(RSA_KEY));
    expect(f!.confidence).toBe(1.0);
  });

  it("finding severity is critical", () => {
    const [f] = privateKeyDetector.scan(ctx(RSA_KEY));
    expect(f!.severity).toBe("critical");
  });

  it("contextSnippet does not contain full key", () => {
    const [f] = privateKeyDetector.scan(ctx(RSA_KEY));
    expect(f!.contextSnippet).toContain("•••");
    // The full PEM block should not appear verbatim in snippet
    expect(f!.contextSnippet).not.toContain(f!.match.value);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("password detector", () => {
  it("has correct metadata", () => {
    expect(passwordDetector.id).toBe("password");
    expect(passwordDetector.categoryId).toBe("myDigitalLife");
    expect(passwordDetector.shipTier).toBe("ga");
  });

  it("detects password=value assignment", () => {
    const findings = passwordDetector.scan(ctx("password=MyS3cr3tPass!"));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("password");
  });

  it("detects password: value in config", () => {
    const findings = passwordDetector.scan(ctx('password: "SuperSecretPassword123"'));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects passwd=value", () => {
    const findings = passwordDetector.scan(ctx("passwd=AnotherSecret1"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire on obvious placeholder", () => {
    expect(passwordDetector.scan(ctx('password=your_password')).length).toBe(0);
    expect(passwordDetector.scan(ctx('password=<YOUR_PASSWORD>')).length).toBe(0);
    expect(passwordDetector.scan(ctx('password=changeme')).length).toBe(0);
  });

  it("does NOT fire when value is too short (< 6 chars)", () => {
    const findings = passwordDetector.scan(ctx("password=abc"));
    expect(findings.length).toBe(0);
  });

  it("finding severity is critical", () => {
    const [f] = passwordDetector.scan(ctx("password=MyLongSecretPass1!"));
    expect(f!.severity).toBe("critical");
  });

  it("contextSnippet is redacted", () => {
    const [f] = passwordDetector.scan(ctx("password=MyLongSecretPass1!"));
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.contextSnippet).not.toContain(f!.match.value);
  });

  it("is deterministic", () => {
    const c = ctx('secret: "SuperLongPassword123"');
    expect(passwordDetector.scan(c)).toEqual(passwordDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("email detector", () => {
  it("has correct metadata", () => {
    expect(emailDetector.id).toBe("email");
    expect(emailDetector.categoryId).toBe("myDigitalLife");
    expect(emailDetector.shipTier).toBe("ga");
    expect(emailDetector.region).toBe("global");
  });

  it("detects a plain email address", () => {
    const findings = emailDetector.scan(ctx("Send invoice to billing@acme-inc.com please."));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("email");
  });

  it("detects a gmail address", () => {
    const findings = emailDetector.scan(ctx("The owner is alice.jones@gmail.com"));
    expect(findings.length).toBe(1);
    expect(findings[0]!.match.value).toBe("alice.jones@gmail.com");
  });

  it("detects email with + tag", () => {
    const findings = emailDetector.scan(ctx("Filter tag: j.smith+filter@provider.net"));
    expect(findings.length).toBe(1);
    expect(findings[0]!.match.value).toBe("j.smith+filter@provider.net");
  });

  it("detects multiple emails in one text", () => {
    const findings = emailDetector.scan(
      ctx("From: alice@company.com, To: bob@company.com, CC: carol@company.com"),
    );
    expect(findings.length).toBe(3);
  });

  it("does NOT detect bare @mention (no domain TLD)", () => {
    expect(emailDetector.scan(ctx("Follow @shieldme for updates"))).toHaveLength(0);
  });

  it("does NOT detect user@localhost (no TLD)", () => {
    expect(emailDetector.scan(ctx("Connect to user@localhost on port 5432"))).toHaveLength(0);
  });

  it("does NOT detect email-free text", () => {
    expect(emailDetector.scan(ctx("Schedule the meeting for Tuesday at 3pm"))).toHaveLength(0);
  });

  it("finding severity is warning", () => {
    const [f] = emailDetector.scan(ctx("Contact hr@corp.com for onboarding."));
    expect(f!.severity).toBe("warning");
  });

  it("finding confidence is 0.95", () => {
    const [f] = emailDetector.scan(ctx("Primary: admin@portal.gov"));
    expect(f!.confidence).toBe(0.95);
  });

  it("contextSnippet is redacted — does not contain raw email", () => {
    const [f] = emailDetector.scan(ctx("Reply to secret.address@sensitive.org now."));
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.contextSnippet).not.toContain(f!.match.value);
  });

  it("match positions span exactly the email address", () => {
    const text = "Forward to admin@example.org and log it.";
    const [f] = emailDetector.scan(ctx(text));
    expect(text.slice(f!.match.start, f!.match.end)).toBe("admin@example.org");
  });

  it("is deterministic", () => {
    const c = ctx("Owner: firstname.lastname@organization.org");
    expect(JSON.stringify(emailDetector.scan(c))).toBe(JSON.stringify(emailDetector.scan(c)));
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("phone-intl detector", () => {
  it("has correct metadata", () => {
    expect(phoneIntlDetector.id).toBe("phone-intl");
    expect(phoneIntlDetector.categoryId).toBe("myDigitalLife");
    expect(phoneIntlDetector.shipTier).toBe("ga");
    expect(phoneIntlDetector.region).toBe("global");
  });

  it("detects E.164 international number", () => {
    const findings = phoneIntlDetector.scan(ctx("Call us at +44 7911 123456 for support."));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("phone-intl");
  });

  it("detects US number with country code", () => {
    const findings = phoneIntlDetector.scan(ctx("Toll free: +1-800-867-5309"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects NANP number without country code", () => {
    const findings = phoneIntlDetector.scan(ctx("Office: (212) 555-0100"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects NANP with hyphen separators", () => {
    const findings = phoneIntlDetector.scan(ctx("Cell: 415-867-5309"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects European 8-digit number", () => {
    const findings = phoneIntlDetector.scan(ctx("Paris: +33 1 23 45 67 89"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("deduplicates when both patterns match same number", () => {
    // +1 (555) 867-5309 — INTL matches the full string, NANP the local part
    const findings = phoneIntlDetector.scan(ctx("+1 (555) 867-5309"));
    expect(findings).toHaveLength(1);
  });

  it("detects two distinct numbers in one text", () => {
    const findings = phoneIntlDetector.scan(
      ctx("Call +44 7911 123456 or (212) 555-0100 for help."),
    );
    expect(findings.length).toBe(2);
  });

  it("does NOT fire on plain numeric string (no separators)", () => {
    expect(phoneIntlDetector.scan(ctx("Order: 12345678901234"))).toHaveLength(0);
  });

  it("does NOT fire on IP address", () => {
    expect(phoneIntlDetector.scan(ctx("IP: 192.168.100.200"))).toHaveLength(0);
  });

  it("does NOT fire on software version number", () => {
    expect(phoneIntlDetector.scan(ctx("Version: 10.14.6 released today"))).toHaveLength(0);
  });

  it("finding severity is warning", () => {
    const [f] = phoneIntlDetector.scan(ctx("Mobile: +49 30 12345678"));
    expect(f!.severity).toBe("warning");
  });

  it("finding confidence is 0.85", () => {
    const [f] = phoneIntlDetector.scan(ctx("Direct: (310) 555-0101"));
    expect(f!.confidence).toBe(0.85);
  });

  it("contextSnippet is redacted — does not contain raw phone value", () => {
    const [f] = phoneIntlDetector.scan(ctx("Emergency: +1 (604) 555-9876 on file."));
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.contextSnippet).not.toContain(f!.match.value);
  });

  it("is deterministic", () => {
    const c = ctx("Lisbon: +351 21 123 45 67");
    expect(JSON.stringify(phoneIntlDetector.scan(c))).toBe(
      JSON.stringify(phoneIntlDetector.scan(c)),
    );
  });
});
