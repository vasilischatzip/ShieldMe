/**
 * T020e — Beta national-ID detector smoke tests.
 *
 * Verifies that key beta detectors fire on canonical examples and are
 * silent on unrelated text.  Not exhaustive — the validator unit tests
 * cover checksum correctness; here we verify wiring end-to-end.
 */
import { describe, it, expect } from "vitest";
import "~/detectors/identity";   // triggers self-registration
import "~/detectors/money";
import { registry } from "~/detectors/registry";
import type { Rules } from "~/detectors/types";

/* ── Minimal rules fixture (all on, beta on) ─────────────────────── */

function allRules(): Rules {
  return {
    categories: {
      myMoney:       true,
      myIdentity:    true,
      myHealth:      false,
      myFamily:      false,
      myDigitalLife: false,
      myLocation:    false,
    },
    detectors:            {},
    includeBetaDetectors: true,
  };
}

/* ── Registry sanity ─────────────────────────────────────────────── */

describe("beta detector registration", () => {
  it("registers more than 50 beta detectors", () => {
    const all = registry.active(allRules(), "en");
    const beta = all.filter(d => d.shipTier === "beta");
    expect(beta.length).toBeGreaterThan(50);
  });

  it("registers natIdBeta detectors across expected country codes", () => {
    const all = registry.active(allRules(), "en");
    const betaIds = all.map(d => d.id);
    expect(betaIds).toContain("identity.nat.pl-pesel");
    expect(betaIds).toContain("identity.nat.no-nin");
    expect(betaIds).toContain("identity.nat.se-nin");
    expect(betaIds).toContain("identity.nat.fi-hetu");
    expect(betaIds).toContain("identity.nat.tr-tckn");
    expect(betaIds).toContain("identity.nat.mx-curp");
    expect(betaIds).toContain("identity.nat.sg-nric");
    expect(betaIds).toContain("identity.nat.in-aadhaar");
    expect(betaIds).toContain("identity.nat.br-rg");
    expect(betaIds).toContain("identity.nat.cn-rid");
  });

  it("registers beta tax detectors", () => {
    const all = registry.active(allRules(), "en");
    const betaIds = all.map(d => d.id);
    expect(betaIds).toContain("money.tax.br-cpf");
    expect(betaIds).toContain("money.tax.br-cnpj");
    expect(betaIds).toContain("money.tax.ar-cuit");
    expect(betaIds).toContain("money.tax.in-pan");
    expect(betaIds).toContain("money.tax.at-vat");
    expect(betaIds).toContain("money.tax.de-vat");
    expect(betaIds).toContain("money.tax.fr-vat");
  });

  it("registers beta bank detectors", () => {
    const all = registry.active(allRules(), "en");
    const betaIds = all.map(d => d.id);
    expect(betaIds).toContain("money.bank.il-account");
    expect(betaIds).toContain("money.bank.nz-account");
  });
});

/* ── Direct-scan helpers ─────────────────────────────────────────── */

/** Call a specific detector's scan() directly, bypassing the scan engine. */
function directScan(detectorId: string, text: string, locale = "en") {
  const all = registry.active(allRules(), locale);
  const det = all.find(d => d.id === detectorId);
  if (!det) return [];
  return det.scan({ locale, text, activeCustomRules: [], clock: Date });
}

/* ── Per-detector scan smoke tests ──────────────────────────────── */

describe("beta detector scan — PESEL", () => {
  it("fires on valid PESEL in identity context", () => {
    // Use PESEL starting with 7x — avoids clash with ee-pic (1-6 only)
    // "70010101231": YY=70 MM=01 DD=01 seq=012 gender=3 check=1
    const findings = directScan("identity.nat.pl-pesel",
      "personal id pesel: 70010101231", "pl");
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does not fire on invalid PESEL checksum", () => {
    const findings = directScan("identity.nat.pl-pesel",
      "pesel: 70010101230", "pl");  // bad check digit (should be 1)
    expect(findings.length).toBe(0);
  });
});

describe("beta detector scan — Finnish HETU", () => {
  it("fires on valid HETU", () => {
    const findings = directScan("identity.nat.fi-hetu",
      "henkilötunnus: 131052-308T", "fi");
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("beta detector scan — Turkish TCKN", () => {
  it("fires on valid TCKN in context", () => {
    // Use TCKN starting with 7 — avoids ee-pic clash (1-6 only)
    // "70000000096": d10=9, d11=6 (verified)
    const findings = directScan("identity.nat.tr-tckn",
      "TC kimlik no: 70000000096", "tr");
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("beta detector scan — Singapore NRIC", () => {
  it("fires on NRIC-format string", () => {
    const findings = directScan("identity.nat.sg-nric",
      "NRIC number: S1234567D identification", "sg");
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("beta detector scan — Mexican CURP", () => {
  it("fires on CURP format", () => {
    const findings = directScan("identity.nat.mx-curp",
      "CURP: BADD110313HCMLNS09 identification national", "mx");
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("beta detector scan — Brazilian CPF (tax)", () => {
  it("fires on valid CPF with checksum", () => {
    const findings = directScan("money.tax.br-cpf",
      "CPF: 529.982.247-25 tax identification", "br");
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does not fire on invalid CPF checksum", () => {
    const findings = directScan("money.tax.br-cpf",
      "CPF: 529.982.247-20 tax", "br");
    expect(findings.length).toBe(0);
  });
});

describe("beta detector scan — Indian PAN", () => {
  it("fires on PAN format string", () => {
    const findings = directScan("money.tax.in-pan",
      "PAN card number: ABCDE1234F tax identification", "in");
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("beta detector scan — German VAT", () => {
  it("fires on DE VAT number format", () => {
    const findings = directScan("money.tax.de-vat",
      "Umsatzsteuer-ID (VAT): DE123456789", "de");
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("beta detector scan — NZ bank account", () => {
  it("fires on NZ bank format", () => {
    const findings = directScan("money.bank.nz-account",
      "bank account number: 12-3456-1234567-00", "nz");
    expect(findings.length).toBeGreaterThan(0);
  });
});
