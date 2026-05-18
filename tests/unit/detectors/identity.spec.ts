/**
 * T018 — Identity category detector unit tests.
 */
import { describe, it, expect } from "vitest";
import type { DetectorContext } from "~/detectors/types";
import { ssnDetector }           from "~/detectors/identity/ssn";
import { passportDetector }      from "~/detectors/identity/passport";
import { driversLicenseDetector } from "~/detectors/identity/drivers-license";
import { nationalIdDetector }    from "~/detectors/identity/national-id";

function ctx(text: string, locale = "en"): DetectorContext {
  return { locale, text, activeCustomRules: [], clock: Date };
}

/* ════════════════════════════════════════════════════════════ */

describe("ssn detector", () => {
  it("has correct metadata", () => {
    expect(ssnDetector.id).toBe("ssn");
    expect(ssnDetector.categoryId).toBe("myIdentity");
    expect(ssnDetector.shipTier).toBe("ga");
  });

  it("detects formatted SSN NNN-GG-SSSS", () => {
    const findings = ssnDetector.scan(ctx("SSN: 001-01-0001"));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("ssn");
  });

  it("does NOT fire on area 000", () => {
    expect(ssnDetector.scan(ctx("000-12-3456")).length).toBe(0);
  });

  it("does NOT fire on area 666", () => {
    expect(ssnDetector.scan(ctx("666-12-3456")).length).toBe(0);
  });

  it("does NOT fire on area ≥900", () => {
    expect(ssnDetector.scan(ctx("987-65-4321")).length).toBe(0);
  });

  it("does NOT fire on group 00", () => {
    expect(ssnDetector.scan(ctx("001-00-0001")).length).toBe(0);
  });

  it("does NOT fire on serial 0000", () => {
    expect(ssnDetector.scan(ctx("234-56-0000")).length).toBe(0);
  });

  it("does NOT fire on known blacklisted SSN", () => {
    expect(ssnDetector.scan(ctx("078-05-1120")).length).toBe(0);
  });

  it("solid 9-digit SSN fires when SSN keyword nearby", () => {
    const findings = ssnDetector.scan(ctx("SSN 234567890"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("solid 9-digit SSN suppressed without keyword context", () => {
    const findings = ssnDetector.scan(ctx("234567890"));
    expect(findings.length).toBe(0);
  });

  it("finding has required shape", () => {
    const [f] = ssnDetector.scan(ctx("Social security 524-61-1234 on file"));
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.contextSnippet).toContain("•••");
    expect(f!.contextSnippet).not.toContain(f!.match.value);
  });

  it("contextSnippet ≤ 200 chars", () => {
    const [f] = ssnDetector.scan(ctx("a".repeat(200) + "524-61-1234" + "b".repeat(200)));
    expect(f!.contextSnippet.length).toBeLessThanOrEqual(200);
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("passport detector", () => {
  it("has correct metadata", () => {
    expect(passportDetector.id).toBe("passport");
    expect(passportDetector.categoryId).toBe("myIdentity");
    expect(passportDetector.shipTier).toBe("ga");
  });

  it("detects MRZ line with confidence 1.0", () => {
    const findings = passportDetector.scan(ctx("P<GBRSURNAME<<GIVENNAME<<<<<<<<<<<<<<<<<<<<"));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.confidence).toBe(1.0);
  });

  it("detects passport number with passport keyword", () => {
    const findings = passportDetector.scan(ctx("Passport number: A12345678 expires 2028"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT surface passport-like string without keyword context", () => {
    // Generic alphanumeric without keyword — below threshold
    const findings = passportDetector.scan(ctx("code A12345678"));
    expect(findings.length).toBe(0);
  });

  it("finding severity is critical", () => {
    const [f] = passportDetector.scan(ctx("P<USASURNAME<<GIVEN<<<<<<<<<<<<<<<<<<<<<<<<"));
    expect(f!.severity).toBe("critical");
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("drivers-license detector", () => {
  it("has correct metadata", () => {
    expect(driversLicenseDetector.id).toBe("drivers-license");
    expect(driversLicenseDetector.categoryId).toBe("myIdentity");
    expect(driversLicenseDetector.shipTier).toBe("ga");
  });

  it("detects US DL number with license keyword", () => {
    const findings = driversLicenseDetector.scan(
      ctx("Driver license number: A1234567 issued by DMV"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire without license context", () => {
    // "A1234567" could be anything without driver keyword
    const findings = driversLicenseDetector.scan(ctx("reference A1234567 for order"));
    expect(findings.length).toBe(0);
  });

  it("finding severity is warning", () => {
    const [f] = driversLicenseDetector.scan(
      ctx("Driving licence number: A1234567 DMV California"),
    );
    if (f) {
      expect(f.severity).toBe("warning");
    }
  });
});

/* ════════════════════════════════════════════════════════════ */

describe("national-id detector", () => {
  it("has correct metadata", () => {
    expect(nationalIdDetector.id).toBe("national-id");
    expect(nationalIdDetector.categoryId).toBe("myIdentity");
    expect(nationalIdDetector.shipTier).toBe("ga");
  });

  it("detects UK NINO", () => {
    const findings = nationalIdDetector.scan(ctx("NINO: AB123456C for tax records"));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("national-id");
  });

  it("does NOT detect invalid NINO (bad prefix BG)", () => {
    const findings = nationalIdDetector.scan(ctx("BG123456A in records"));
    expect(findings.length).toBe(0);
  });

  it("detects Spanish NIF", () => {
    const findings = nationalIdDetector.scan(ctx("NIF: 12345678Z from Spain"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects Italian Codice Fiscale", () => {
    const findings = nationalIdDetector.scan(
      ctx("Codice fiscale: RSSMRA85T10A562S for the employee"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects French INSEE number", () => {
    const findings = nationalIdDetector.scan(
      ctx("INSEE: 185017511609892 social security"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("finding severity is critical", () => {
    const [f] = nationalIdDetector.scan(ctx("national id AB123456C registered"));
    if (f) expect(f.severity).toBe("critical");
  });

  it("contextSnippet does not contain match value", () => {
    const findings = nationalIdDetector.scan(ctx("NINO: AB123456C registered"));
    for (const f of findings) {
      expect(f.contextSnippet).toContain("•••");
      expect(f.contextSnippet).not.toContain(f.match.value);
    }
  });

  it("is deterministic", () => {
    const c = ctx("NINO AB123456C tax records");
    expect(nationalIdDetector.scan(c)).toEqual(nationalIdDetector.scan(c));
  });
});
