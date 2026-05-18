/**
 * Unit tests — identity.name-address.combo detector.
 */
import { describe, it, expect } from "vitest";
import { nameAddressDetector } from "~/detectors/identity/name-address";
import type { DetectorContext } from "~/detectors/types";

function ctx(text: string): DetectorContext {
  return {
    locale: "en",
    text,
    activeCustomRules: [],
    clock: Date,
  };
}

function scan(text: string) {
  return nameAddressDetector.scan(ctx(text));
}

/* ── Metadata ─────────────────────────────────────────────────── */

describe("nameAddressDetector — metadata", () => {
  it("has correct id", () => {
    expect(nameAddressDetector.id).toBe("identity.name-address.combo");
  });
  it("is GA tier", () => {
    expect(nameAddressDetector.shipTier).toBe("ga");
  });
  it("is global region", () => {
    expect(nameAddressDetector.region).toBe("global");
  });
  it("is critical severity", () => {
    const r = scan("Mr. John Smith, 123 Oak Street, London SW1A 1AA");
    expect(r[0]?.severity).toBe("critical");
  });
});

/* ── Honorific + US street ────────────────────────────────────── */

describe("nameAddressDetector — honorific + US street", () => {
  it("fires on Mr. Name + US street", () => {
    const r = scan("Mr. John Smith lives at 123 Oak Street, Chicago, IL 60601.");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]!.confidence).toBe(0.95);
  });
  it("fires on Dr. Name + US avenue", () => {
    const r = scan("Dr. Jane Doe, 456 Maple Avenue, New York, NY 10001.");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
  it("fires on Mrs. Name + US boulevard", () => {
    const r = scan("Mrs. Emily Carter, 789 Pine Boulevard, Los Angeles, CA.");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
  it("fires on Prof. Name + US drive", () => {
    const r = scan("Prof. Robert Johnson, 22 Elm Drive, Austin, TX 78701.");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
  it("fires on Ms. Name + US way", () => {
    const r = scan("Ms. Sarah Brown, 8 Victoria Way, Boston, MA 02101.");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

/* ── Honorific + UK postcode ─────────────────────────────────── */

describe("nameAddressDetector — honorific + UK postcode", () => {
  it("fires on Mr. Name + UK postcode", () => {
    const r = scan("Mr. James Wilson, 15 High Street, Glasgow G1 1AA.");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
  it("fires on Mrs. Name + UK postcode in same sentence", () => {
    const r = scan("Next of kin: Mrs. Anne Davies, 77 King Road, Leeds LS1 1AA.");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
  it("fires on Miss. Name + UK postcode", () => {
    const r = scan("Miss. Elizabeth Clark, 33 River Lane, Sheffield S1 1AA.");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
  it("fires when name and postcode are within 500 chars", () => {
    const padding = " ".repeat(400);
    const r = scan(`Mr. Tom Harris${padding}EC1A 1BB`);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

/* ── Three-word name ─────────────────────────────────────────── */

describe("nameAddressDetector — three-word with initial", () => {
  it("fires on First M. Last + address", () => {
    const r = scan("James R. Henderson, 77 Birch Lane, Austin, TX 78701.");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]!.confidence).toBe(0.85);
  });
  it("fires on First I. Last + UK postcode", () => {
    const r = scan("Mary E. Johnson, 42 Willow Court, Portsmouth PO1 1AA.");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

/* ── Bare two-word name ──────────────────────────────────────── */

describe("nameAddressDetector — bare two-word name", () => {
  it("fires on bare name + US street", () => {
    const r = scan("Laura Martinez, 3200 N Lake Shore Drive, Chicago, IL 60657.");
    expect(r.length).toBeGreaterThanOrEqual(1);
    // confidence could be 0.75 (bare) or 0.95 (if caught by honorific — depends on name)
  });
  it("fires on bare name + UK postcode", () => {
    const r = scan("Michael Taylor, 100 Blossom Court, Brighton BN1 1AA.");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

/* ── No address → no finding ─────────────────────────────────── */

describe("nameAddressDetector — suppressed without address", () => {
  it("does NOT fire on honorific name alone", () => {
    const r = scan("Mr. John Smith called the office to reschedule the meeting.");
    expect(r).toHaveLength(0);
  });
  it("does NOT fire on UK postcode alone", () => {
    const r = scan("The package was sent to SW1A 1AA for next-day delivery.");
    expect(r).toHaveLength(0);
  });
  it("does NOT fire on US street alone without name", () => {
    const r = scan("The office is at 100 Main Street, Suite 200, Boston.");
    expect(r).toHaveLength(0);
  });
});

/* ── Outside window → no finding ─────────────────────────────── */

describe("nameAddressDetector — proximity window", () => {
  it("does NOT fire when name and address are more than 500 chars apart", () => {
    const padding = " ".repeat(600);
    const r = scan(`Mr. Tom Harris${padding}123 Oak Street, Boston, MA`);
    expect(r).toHaveLength(0);
  });
});

/* ── Noise filter ────────────────────────────────────────────── */

describe("nameAddressDetector — noise word filter", () => {
  it("does NOT fire on 'New York' near an address", () => {
    const r = scan("New York is home to 123 Wall Street, Manhattan, NY 10005.");
    // "New York" should be filtered — no finding for it
    const hasNewYork = r.some(f => f.match.value === "New York");
    expect(hasNewYork).toBe(false);
  });
  it("does NOT fire on 'Los Angeles' near an address", () => {
    const r = scan("Los Angeles office: 500 Oak Boulevard, LA, CA 90001.");
    const hasLA = r.some(f => f.match.value === "Los Angeles");
    expect(hasLA).toBe(false);
  });
});

/* ── contextSnippet ──────────────────────────────────────────── */

describe("nameAddressDetector — contextSnippet", () => {
  it("contextSnippet contains •••", () => {
    const r = scan("Mr. John Smith, 123 Oak Street, London SW1A 1AA.");
    expect(r[0]!.contextSnippet).toContain("•••");
  });
});

/* ── Deduplication ────────────────────────────────────────────── */

describe("nameAddressDetector — deduplication", () => {
  it("does not emit duplicate findings for the same name position", () => {
    // Dr. Jane Doe matches both HONORIFIC_RE and potentially THREE_WORD_RE
    const r = scan("Dr. Jane Doe at 456 Maple Avenue, New York, NY 10001.");
    const positions = r.map(f => f.match.start);
    expect(new Set(positions).size).toBe(positions.length);
  });
});
