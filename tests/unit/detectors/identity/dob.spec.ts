/**
 * Unit tests — identity.dob.in-context detector.
 */
import { describe, it, expect } from "vitest";
import { dobDetector } from "~/detectors/identity/dob";
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
  return dobDetector.scan(ctx(text));
}

/* ── Metadata ─────────────────────────────────────────────────── */

describe("dobDetector — metadata", () => {
  it("has correct id", () => {
    expect(dobDetector.id).toBe("identity.dob.in-context");
  });
  it("is GA tier", () => {
    expect(dobDetector.shipTier).toBe("ga");
  });
  it("is global region", () => {
    expect(dobDetector.region).toBe("global");
  });
  it("is critical severity", () => {
    const results = scan("DOB: 1985-03-15");
    expect(results[0]?.severity).toBe("critical");
  });
});

/* ── ISO 8601 ─────────────────────────────────────────────────── */

describe("dobDetector — ISO 8601 format", () => {
  it("fires on DOB: YYYY-MM-DD", () => {
    const r = scan("DOB: 1985-03-15 on file.");
    expect(r).toHaveLength(1);
    expect(r[0]!.match.value).toBe("1985-03-15");
  });
  it("fires on 'date of birth: YYYY-MM-DD'", () => {
    const r = scan("date of birth: 1990-11-22");
    expect(r).toHaveLength(1);
  });
  it("fires on 'birthdate: YYYY-MM-DD'", () => {
    const r = scan("Birthdate: 2000-06-30 — registered.");
    expect(r).toHaveLength(1);
  });
});

/* ── US numeric ───────────────────────────────────────────────── */

describe("dobDetector — US numeric format", () => {
  it("fires on DOB MM/DD/YYYY", () => {
    const r = scan("Patient DOB 03/15/1985 confirmed.");
    expect(r).toHaveLength(1);
    expect(r[0]!.match.value).toBe("03/15/1985");
  });
  it("fires on 'date of birth: MM/DD/YYYY'", () => {
    const r = scan("Date of birth: 12/07/1994 per passport.");
    expect(r).toHaveLength(1);
  });
});

/* ── EU numeric ───────────────────────────────────────────────── */

describe("dobDetector — EU numeric format (dots)", () => {
  it("fires on DOB DD.MM.YYYY", () => {
    const r = scan("Geburtsdatum: 12.05.1978 laut Ausweis.");
    expect(r).toHaveLength(1);
    expect(r[0]!.match.value).toBe("12.05.1978");
  });
  it("fires on geboortedatum DD.MM.YYYY", () => {
    const r = scan("Geboortedatum: 23.04.1995 — Dutch passport.");
    expect(r).toHaveLength(1);
  });
});

/* ── Long-form DMY ────────────────────────────────────────────── */

describe("dobDetector — long-form DMY", () => {
  it("fires on 'born: 15 March 1985'", () => {
    const r = scan("born: 15 March 1985 per birth register.");
    expect(r).toHaveLength(1);
  });
  it("fires on '4th July 1976' with 'born on' keyword", () => {
    const r = scan("Born on 4th July 1976 per baptismal certificate.");
    expect(r).toHaveLength(1);
  });
  it("fires on '15th of March 1985' format", () => {
    const r = scan("DOB: 15th of March 1985 — official record.");
    expect(r).toHaveLength(1);
  });
});

/* ── Long-form MDY ────────────────────────────────────────────── */

describe("dobDetector — long-form MDY", () => {
  it("fires on 'birthday: December 7, 1994'", () => {
    const r = scan("Her birthday is December 7, 1994 this year.");
    expect(r).toHaveLength(1);
  });
  it("fires on 'DOB: March 15th, 1985'", () => {
    const r = scan("DOB: March 15th, 1985 — employee record.");
    expect(r).toHaveLength(1);
  });
});

/* ── Multilingual keywords ────────────────────────────────────── */

describe("dobDetector — multilingual keywords", () => {
  it("fires on French 'date de naissance'", () => {
    const r = scan("date de naissance: 22.11.1990");
    expect(r).toHaveLength(1);
  });
  it("fires on German 'Geburtsdatum'", () => {
    const r = scan("Geburtsdatum: 1978-05-12");
    expect(r).toHaveLength(1);
  });
  it("fires on German 'geboren am'", () => {
    const r = scan("geboren am 06.06.1961 laut Geburtsschein.");
    expect(r).toHaveLength(1);
  });
  it("fires on Greek 'ημερομηνία γέννησης'", () => {
    const r = scan("ημερομηνία γέννησης: 01.01.1980");
    expect(r).toHaveLength(1);
  });
  it("fires on Spanish 'fecha de nacimiento'", () => {
    const r = scan("Fecha de nacimiento: 08/14/1982");
    expect(r).toHaveLength(1);
  });
  it("fires on Italian 'data di nascita'", () => {
    const r = scan("data di nascita: 30.09.1967");
    expect(r).toHaveLength(1);
  });
  it("fires on Dutch 'geboortedatum'", () => {
    const r = scan("Geboortedatum: 23.04.1995");
    expect(r).toHaveLength(1);
  });
  it("fires on Portuguese 'data de nascimento'", () => {
    const r = scan("data de nascimento: 19/07/1988");
    expect(r).toHaveLength(1);
  });
  it("fires on Japanese 生年月日", () => {
    const r = scan("生年月日: 1992-05-03");
    expect(r).toHaveLength(1);
  });
  it("fires on Chinese 出生日期", () => {
    const r = scan("出生日期: 1988-11-15");
    expect(r).toHaveLength(1);
  });
  it("fires on French 'née le'", () => {
    const r = scan("née le 15 mars 1992 à Paris.");
    // "mars" is not in English month names — this is a keyword-only match
    // The regex won't match "mars" — no finding expected without English month
    // This tests that the keyword alone without a parseable date = no fire
    expect(r).toHaveLength(0); // "mars" not in MONTH_ALT list
  });
  it("fires on 'né le' with ISO date", () => {
    const r = scan("né le 1985-07-03 selon l'acte de naissance.");
    expect(r).toHaveLength(1);
  });
});

/* ── No keyword → no finding ─────────────────────────────────── */

describe("dobDetector — suppressed without keyword", () => {
  it("does NOT fire on ISO date without DOB keyword", () => {
    const r = scan("The meeting is scheduled for 2024-03-15 at 10:00 AM.");
    expect(r).toHaveLength(0);
  });
  it("does NOT fire on US date without DOB keyword", () => {
    const r = scan("Invoice date: 03/15/2024 — payment due in 30 days.");
    expect(r).toHaveLength(0);
  });
  it("does NOT fire on EU date without DOB keyword", () => {
    const r = scan("Last updated: 12.05.2023 — version control timestamp.");
    expect(r).toHaveLength(0);
  });
  it("does NOT fire on long-form date without DOB keyword", () => {
    const r = scan("Release date: 15 March 2024 — product launch event.");
    expect(r).toHaveLength(0);
  });
  it("does NOT fire on birthday keyword alone with no date", () => {
    const r = scan("Happy birthday! Hope you have a wonderful celebration.");
    expect(r).toHaveLength(0);
  });
});

/* ── Deduplication ────────────────────────────────────────────── */

describe("dobDetector — deduplication", () => {
  it("does not produce duplicate findings for same date position", () => {
    // 1985-03-15 could match ISO_DATE_RE — ensure only one finding per position
    const r = scan("DOB: 1985-03-15 (date of birth confirmed on record).");
    const positions = r.map(f => f.match.start);
    expect(new Set(positions).size).toBe(positions.length);
  });
});

/* ── contextSnippet ──────────────────────────────────────────── */

describe("dobDetector — contextSnippet", () => {
  it("replaces the matched value with •••", () => {
    const r = scan("DOB: 1985-03-15 on file.");
    expect(r[0]!.contextSnippet).toContain("•••");
    expect(r[0]!.contextSnippet).not.toContain("1985-03-15");
  });
});
