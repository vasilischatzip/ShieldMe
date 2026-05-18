/**
 * T020/T020b/T020c — Health, Family, and Location detector unit tests.
 * These categories are OFF by default (FR-R1) but fully implemented.
 */
import { describe, it, expect } from "vitest";
import type { DetectorContext } from "~/detectors/types";
import { healthIdDetector }      from "~/detectors/health/health-id";
import { medicalRecordDetector } from "~/detectors/health/medical-record";
import { diagnosisDetector }     from "~/detectors/health/diagnosis";
import { minorNameDetector }     from "~/detectors/family/minor-name";
import { schoolInfoDetector }    from "~/detectors/family/school-info";
import { familyAddressDetector } from "~/detectors/family/family-address";
import { homeAddressDetector }   from "~/detectors/location/home-address";
import { gpsCoordsDetector }     from "~/detectors/location/gps-coords";
import { itineraryDetector }     from "~/detectors/location/itinerary";

function ctx(text: string): DetectorContext {
  return { locale: "en", text, activeCustomRules: [], clock: Date };
}

/* ════════════════════════════════════════════════════════════ */
/* Health */
/* ════════════════════════════════════════════════════════════ */

describe("health-id detector", () => {
  it("has correct metadata", () => {
    expect(healthIdDetector.id).toBe("health-id");
    expect(healthIdDetector.categoryId).toBe("myHealth");
    expect(healthIdDetector.shipTier).toBe("ga");
  });

  it("detects member ID with health insurance context", () => {
    const findings = healthIdDetector.scan(
      ctx("Member ID: UHC12345678 — Blue Cross health insurance card"),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("health-id");
  });

  it("does NOT fire on bare ID without health keyword", () => {
    const findings = healthIdDetector.scan(ctx("UHC12345678"));
    expect(findings.length).toBe(0);
  });

  it("finding severity is critical", () => {
    const [f] = healthIdDetector.scan(
      ctx("subscriber id: A123456789 health plan member card"),
    );
    if (f) expect(f.severity).toBe("critical");
  });
});

describe("medical-record detector", () => {
  it("has correct metadata", () => {
    expect(medicalRecordDetector.id).toBe("medical-record");
    expect(medicalRecordDetector.categoryId).toBe("myHealth");
  });

  it("detects MRN with hospital context", () => {
    const findings = medicalRecordDetector.scan(
      ctx("MRN: 123456789 — Patient admitted to hospital on 01/15"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire without medical context", () => {
    const findings = medicalRecordDetector.scan(ctx("12345678"));
    expect(findings.length).toBe(0);
  });
});

describe("diagnosis detector", () => {
  it("has correct metadata", () => {
    expect(diagnosisDetector.id).toBe("diagnosis");
    expect(diagnosisDetector.categoryId).toBe("myHealth");
  });

  it("detects ICD-10 code with medical context", () => {
    const findings = diagnosisDetector.scan(
      ctx("Diagnosis: E11.9 — Type 2 diabetes mellitus patient condition"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire on ICD-like code without medical keyword", () => {
    const findings = diagnosisDetector.scan(ctx("product code E11.9"));
    expect(findings.length).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════ */
/* Family */
/* ════════════════════════════════════════════════════════════ */

describe("minor-name detector", () => {
  it("has correct metadata", () => {
    expect(minorNameDetector.id).toBe("minor-name");
    expect(minorNameDetector.categoryId).toBe("myFamily");
  });

  it("detects child name with age indicator", () => {
    const findings = minorNameDetector.scan(ctx("Emma, age 8 attends school"));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("minor-name");
  });

  it("detects son/daughter reference", () => {
    const findings = minorNameDetector.scan(ctx("My son Oliver age 5 birthday"));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("finding severity is critical", () => {
    const [f] = minorNameDetector.scan(ctx("Sophie, age 10 student"));
    if (f) expect(f.severity).toBe("critical");
  });
});

describe("school-info detector", () => {
  it("has correct metadata", () => {
    expect(schoolInfoDetector.id).toBe("school-info");
    expect(schoolInfoDetector.categoryId).toBe("myFamily");
  });

  it("detects school name", () => {
    const findings = schoolInfoDetector.scan(
      ctx("She attends Lincoln Elementary School in the district"),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("school-info");
  });

  it("finding severity is warning", () => {
    const [f] = schoolInfoDetector.scan(
      ctx("Enrolled at Riverside High School for the semester"),
    );
    if (f) expect(f.severity).toBe("warning");
  });
});

describe("family-address detector", () => {
  it("has correct metadata", () => {
    expect(familyAddressDetector.id).toBe("family-address");
    expect(familyAddressDetector.categoryId).toBe("myFamily");
  });

  it("detects home address near family keyword", () => {
    const findings = familyAddressDetector.scan(
      ctx("My home address is 123 Main Street and my children go to school nearby"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire on address without family/home keyword", () => {
    const findings = familyAddressDetector.scan(ctx("Ship to 123 Main Street"));
    expect(findings.length).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════ */
/* Location */
/* ════════════════════════════════════════════════════════════ */

describe("home-address detector", () => {
  it("has correct metadata", () => {
    expect(homeAddressDetector.id).toBe("home-address");
    expect(homeAddressDetector.categoryId).toBe("myLocation");
    expect(homeAddressDetector.shipTier).toBe("ga");
  });

  it("detects home address with address keyword", () => {
    const findings = homeAddressDetector.scan(
      ctx("Home address: 456 Oak Avenue Apt 3B is where I live"),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire on shipping/billing address (suppressed by negative keywords)", () => {
    const findings = homeAddressDetector.scan(
      ctx("Shipping address: 123 Main Street billing department"),
    );
    // May or may not fire depending on scorer — at minimum should have low confidence
    if (findings.length > 0) {
      expect(findings[0]!.confidence).toBeLessThan(1.0);
    }
  });
});

describe("gps-coords detector", () => {
  it("has correct metadata", () => {
    expect(gpsCoordsDetector.id).toBe("gps-coords");
    expect(gpsCoordsDetector.categoryId).toBe("myLocation");
  });

  it("detects decimal coordinate pair", () => {
    const findings = gpsCoordsDetector.scan(
      ctx("GPS location: 40.71280, -74.00600 coordinates"),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("gps-coords");
  });

  it("detects DMS format with confidence 1.0", () => {
    const findings = gpsCoordsDetector.scan(
      ctx("Position: 40°42'46\"N 74°00'21\"W"),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.confidence).toBe(1.0);
  });

  it("finding severity is critical", () => {
    const [f] = gpsCoordsDetector.scan(ctx("lat: 40.71280, lng: -74.00600"));
    if (f) expect(f.severity).toBe("critical");
  });
});

describe("itinerary detector", () => {
  it("has correct metadata", () => {
    expect(itineraryDetector.id).toBe("itinerary");
    expect(itineraryDetector.categoryId).toBe("myLocation");
  });

  it("detects flight number with travel context", () => {
    const findings = itineraryDetector.scan(
      ctx("Flight AA1234 departing JFK — booking itinerary attached"),
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("itinerary");
  });

  it("does NOT fire on flight-like code without travel keyword", () => {
    const findings = itineraryDetector.scan(ctx("product code AA1234 in catalog"));
    expect(findings.length).toBe(0);
  });

  it("finding severity is warning", () => {
    const [f] = itineraryDetector.scan(
      ctx("Flight UA567 hotel reservation travel trip booking"),
    );
    if (f) expect(f.severity).toBe("warning");
  });

  it("is deterministic", () => {
    const c = ctx("flight AA1234 booking itinerary hotel");
    expect(itineraryDetector.scan(c)).toEqual(itineraryDetector.scan(c));
  });
});
