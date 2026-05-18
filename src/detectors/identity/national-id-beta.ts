/**
 * Beta-tier national ID detectors — T020e.
 *
 * Covers 47 Tier-2 countries from the detector catalog (§2.1 Beta).
 * Ships as a single file for compactness; each entry is minimal:
 *   • regex pattern for extraction
 *   • optional checksum validator
 *   • country code region tag
 *
 * Ship tier: "beta" — opt-in, no recall gate.
 * Privacy: pure regex on text; no network, no DOM.
 * Contract: docs/detector-catalog.md §2.1
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId }  from "~/core/rules";
import { contextScorer }   from "~/core/context-scorer";
import { plPesel }  from "../validators/pl-pesel";
import { noNin }    from "../validators/no-nin";
import { seNin }    from "../validators/se-nin";
import { fiHetu }   from "../validators/fi-hetu";
import { trTckn }   from "../validators/tr-tckn";
import { ilId }     from "../validators/il-id";

/* ── Shared helpers ────────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

const SCORER_CFG = {
  positiveKeywords: [
    "national id", "identity", "id card", "id number", "personal id",
    "social security", "insurance number", "passport", "resident",
    "personal number", "citizen", "identification", "pesel", "ssn",
    "cnp", "oib", "aadhaar", "nric", "mykad", "hkid", "curp",
    "registration", "fiscal", "national number",
  ],
  negativeKeywords: [
    "order", "invoice", "tracking", "serial", "reference",
    "product", "part number", "transaction",
  ],
  window: 100,
} as const;

/* ── Entry table ───────────────────────────────────────────────── */

type Entry = {
  id: string;
  region: string;
  re: RegExp;
  group?: number;
  validate?: (raw: string) => boolean;
  minConf?: number; // suppress findings below this confidence (default 0)
};

const ENTRIES: Entry[] = [
  /* ── Austria ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.at-ssn",
    region: "at",
    // Austrian SSN: 4-digit sequence + DDMMYY = 10 chars
    re:     /\b(\d{4}[ -]?\d{6})\b/g,
    validate: s => /^\d{10}$/.test(s.replace(/[\s-]/g, "")),
    minConf: 0.45,
  },
  {
    id:     "identity.nat.at-id",
    region: "at",
    // Austrian identity card: letter + 6 digits
    re:     /(?<![A-Z0-9])([A-Z]\d{6})(?![A-Z0-9])/gi,
    group:  1,
    minConf: 0.5,
  },

  /* ── Belgium ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.be-nn",
    region: "be",
    // Belgian national number: YY.MM.DD-SSS.CC
    re:     /\b(\d{2}[.]\d{2}[.]\d{2}[-]\d{3}[.]\d{2})\b/g,
    group:  1,
  },

  /* ── Bulgaria ────────────────────────────────────────────────── */
  {
    id:     "identity.nat.bg-ucn",
    region: "bg",
    // Bulgarian UCN: 10 digits (YYMMDDSSSC)
    re:     /(?<!\d)(\d{10})(?!\d)/g,
    group:  1,
    minConf: 0.5,
  },

  /* ── Croatia ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.hr-oib",
    region: "hr",
    // Croatian OIB: exactly 11 digits
    re:     /(?<!\d)(\d{11})(?!\d)/g,
    group:  1,
    minConf: 0.5,
  },
  {
    id:     "identity.nat.hr-id",
    region: "hr",
    // Croatian ID card: 9 alphanumeric characters
    re:     /(?<![A-Z0-9])([A-Z]{2}\d{7})(?![A-Z0-9])/gi,
    group:  1,
    minConf: 0.5,
  },

  /* ── Cyprus ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.cy-id",
    region: "cy",
    // Cyprus identity card: K followed by 6+ digits
    re:     /\b(K[ -]?\d{6,7})\b/gi,
    group:  1,
  },

  /* ── Czech Republic ──────────────────────────────────────────── */
  {
    id:     "identity.nat.cz-pid",
    region: "cz",
    // Czech personal ID (rodné číslo): YYMMDD/SSSC or YYMMDDSSC
    re:     /\b(\d{6}\/\d{3,4})\b/g,
    group:  1,
  },

  /* ── Denmark ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.dk-cpr",
    region: "dk",
    // Danish CPR: DDMMYY-SSSS
    re:     /\b(\d{6}[-]\d{4})\b/g,
    group:  1,
  },

  /* ── Estonia ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.ee-pic",
    region: "ee",
    // Estonian personal ID: 11 digits, first digit 1-6
    re:     /(?<!\d)([1-6]\d{10})(?!\d)/g,
    group:  1,
    minConf: 0.45,
  },

  /* ── Finland ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.fi-hetu",
    region: "fi",
    // Finnish HETU: DDMMYY[+-A]SSSCC
    re:     /\b(\d{6}[+\-A]\d{3}[0-9A-Y])\b/gi,
    group:  1,
    validate: fiHetu,
  },

  /* ── Hungary ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.hu-pid",
    region: "hu",
    // Hungarian personal ID: 2 digits + 6 digits + 1 check (format varies)
    re:     /\b(\d{2}[-]\d{6}[-]\d)\b/g,
    group:  1,
  },
  {
    id:     "identity.nat.hu-taj",
    region: "hu",
    // Hungarian TAJ (social security): 9 digits, groups of 3
    re:     /\b(\d{3}[ -]\d{3}[ -]\d{3})\b/g,
    group:  1,
  },

  /* ── Ireland ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.ie-pps",
    region: "ie",
    // Irish PPS: 7 digits + 1-2 uppercase letters
    re:     /\b(\d{7}[A-W]{1,2})\b/g,
    group:  1,
  },

  /* ── Israel ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.il-id",
    region: "il",
    // Israeli national ID: up to 9 digits
    re:     /(?<!\d)(\d{5,9})(?!\d)/g,
    group:  1,
    validate: ilId,
    minConf: 0.45,
  },

  /* ── Latvia ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.lv-pc",
    region: "lv",
    // Latvian personal code: DDMMYY-SSSCC or new 32XXXXXXXXXX
    re:     /\b(\d{6}[-]\d{5}|32\d{9})\b/g,
    group:  1,
  },

  /* ── Lithuania ───────────────────────────────────────────────── */
  {
    id:     "identity.nat.lt-pc",
    region: "lt",
    // Lithuanian personal code: 11 digits starting with 1-6
    re:     /(?<!\d)([1-6]\d{10})(?!\d)/g,
    group:  1,
    minConf: 0.45,
  },

  /* ── Luxembourg ──────────────────────────────────────────────── */
  {
    id:     "identity.nat.lu-idnat",
    region: "lu",
    // Luxembourg national ID: 13 digits
    re:     /(?<!\d)(\d{13})(?!\d)/g,
    group:  1,
    minConf: 0.55,
  },

  /* ── Malta ───────────────────────────────────────────────────── */
  {
    id:     "identity.nat.mt-id",
    region: "mt",
    // Malta identity card: 7 digits + letter
    re:     /\b(\d{7}[A-Z])\b/g,
    group:  1,
  },

  /* ── Norway ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.no-nin",
    region: "no",
    // Norwegian fødselsnummer: 11 digits
    re:     /(?<!\d)(\d{11})(?!\d)/g,
    group:  1,
    validate: noNin,
    minConf: 0.4,
  },

  /* ── Poland ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.pl-pesel",
    region: "pl",
    // Polish PESEL: 11 digits
    re:     /(?<!\d)(\d{11})(?!\d)/g,
    group:  1,
    validate: plPesel,
    minConf: 0.4,
  },
  {
    id:     "identity.nat.pl-id",
    region: "pl",
    // Polish identity card: 3 letters + 6 digits
    re:     /(?<![A-Z0-9])([A-Z]{3}\d{6})(?![A-Z0-9])/g,
    group:  1,
  },

  /* ── Romania ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.ro-cnp",
    region: "ro",
    // Romanian CNP: 13 digits, first digit 1-9
    re:     /(?<!\d)([1-9]\d{12})(?!\d)/g,
    group:  1,
    minConf: 0.45,
  },

  /* ── Slovakia ────────────────────────────────────────────────── */
  {
    id:     "identity.nat.sk-pn",
    region: "sk",
    // Slovak personal number: YYMMDD/SSSC (same format as Czech)
    re:     /\b(\d{6}\/\d{3,4})\b/g,
    group:  1,
  },

  /* ── Slovenia ────────────────────────────────────────────────── */
  {
    id:     "identity.nat.si-umcn",
    region: "si",
    // Slovenian EMŠO: 13 digits (DDMMYYY RR SSS C)
    re:     /(?<!\d)(\d{13})(?!\d)/g,
    group:  1,
    minConf: 0.55,
  },

  /* ── Spain SSN ───────────────────────────────────────────────── */
  {
    id:     "identity.nat.es-ssn",
    region: "es",
    // Spanish social security: starts with province code 01-52
    re:     /\b((?:0[1-9]|[1-4]\d|5[0-2])\s?\d{8}\s?\d{2})\b/g,
    group:  1,
  },

  /* ── Sweden ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.se-nin",
    region: "se",
    // Swedish personnummer: YYYYMMDD-SSSC or YYMMDD-SSSC
    re:     /\b(\d{6,8}[-+]\d{4})\b/g,
    group:  1,
    validate: seNin,
  },

  /* ── Switzerland ─────────────────────────────────────────────── */
  {
    id:     "identity.nat.ch-ahv",
    region: "ch",
    // Swiss AHV: 756.DDDD.DDDD.DC
    re:     /\b(756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2})\b/g,
    group:  1,
  },

  /* ── Turkey ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.tr-tckn",
    region: "tr",
    // Turkish TCKN: 11 digits, first ≠ 0
    re:     /(?<!\d)([1-9]\d{10})(?!\d)/g,
    group:  1,
    validate: trTckn,
    minConf: 0.4,
  },

  /* ── Ukraine ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.ua-dp",
    region: "ua",
    // Ukrainian domestic passport: 2 letters + 6 digits
    re:     /(?<![A-Z])([А-ЯЁІЇЄ]{2}\d{6})(?!\d)/gu,
    group:  1,
    minConf: 0.45,
  },

  /* ── India ───────────────────────────────────────────────────── */
  {
    id:     "identity.nat.in-aadhaar",
    region: "in",
    // Indian Aadhaar: 12 digits in groups of 4 (XXXX XXXX XXXX)
    re:     /\b(\d{4}[ -]\d{4}[ -]\d{4})\b/g,
    group:  1,
    // First digit can't be 0 or 1 per UIDAI spec
    validate: s => !/^[01]/.test(s.replace(/[\s-]/g, "")),
  },
  {
    id:     "identity.nat.in-voter",
    region: "in",
    // Indian Voter ID (EPIC): 3 uppercase letters + 7 digits
    re:     /(?<![A-Z])([A-Z]{3}\d{7})(?!\d)/g,
    group:  1,
    minConf: 0.5,
  },

  /* ── Indonesia ───────────────────────────────────────────────── */
  {
    id:     "identity.nat.id-ktp",
    region: "id",
    // Indonesian KTP: 16 digits
    re:     /(?<!\d)(\d{16})(?!\d)/g,
    group:  1,
    minConf: 0.5,
  },

  /* ── China ───────────────────────────────────────────────────── */
  {
    id:     "identity.nat.cn-rid",
    region: "cn",
    // Chinese Resident ID: 18 characters (digits + possible X at end)
    re:     /(?<!\d)(\d{17}[\dX])(?!\d)/gi,
    group:  1,
    minConf: 0.4,
  },

  /* ── Hong Kong ───────────────────────────────────────────────── */
  {
    id:     "identity.nat.hk-id",
    region: "hk",
    // HKID: 1-2 letters + 6 digits + 1 check (may be in parens)
    re:     /(?<![A-Z])([A-Z]{1,2}\d{6}[(]?[\dA]?[)]?)(?![A-Z0-9])/gi,
    group:  1,
  },

  /* ── Taiwan ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.tw-id",
    region: "tw",
    // Taiwanese national ID: 1 uppercase letter + 9 digits
    re:     /(?<![A-Z])([A-Z]\d{9})(?!\d)/g,
    group:  1,
  },
  {
    id:     "identity.nat.tw-arc",
    region: "tw",
    // Taiwan ARC/TARC: 2 uppercase letters + 8 digits
    re:     /(?<![A-Z])([A-Z]{2}\d{8})(?!\d)/g,
    group:  1,
  },

  /* ── South Korea ─────────────────────────────────────────────── */
  {
    id:     "identity.nat.kr-rrn",
    region: "kr",
    // Korean RRN: YYMMDD-SSSSSSC  (13 digits with optional hyphen)
    re:     /\b(\d{6}[-]?\d{7})\b/g,
    group:  1,
    minConf: 0.45,
  },

  /* ── Thailand ────────────────────────────────────────────────── */
  {
    id:     "identity.nat.th-pid",
    region: "th",
    // Thai population ID: 13 digits
    re:     /(?<!\d)(\d{13})(?!\d)/g,
    group:  1,
    minConf: 0.55,
  },

  /* ── Malaysia ────────────────────────────────────────────────── */
  {
    id:     "identity.nat.my-mykad",
    region: "my",
    // MyKad: 12 digits, often formatted YYMMDD-SS-XXXX
    re:     /\b(\d{6}[-]\d{2}[-]\d{4}|\d{12})\b/g,
    group:  1,
    minConf: 0.45,
  },

  /* ── Singapore ───────────────────────────────────────────────── */
  {
    id:     "identity.nat.sg-nric",
    region: "sg",
    // Singapore NRIC/FIN: [STFG] + 7 digits + letter
    re:     /(?<![A-Z])([STFG]\d{7}[A-Z])(?![A-Z])/gi,
    group:  1,
  },

  /* ── Philippines ─────────────────────────────────────────────── */
  {
    id:     "identity.nat.ph-id",
    region: "ph",
    // Philippine national ID: 16 alphanumeric chars
    re:     /(?<![A-Z0-9])([A-Z]{3}-\d{4}-\d{7}-\d)(?![A-Z0-9])/gi,
    group:  1,
  },
  {
    id:     "identity.nat.ph-umid",
    region: "ph",
    // Philippine UMID: 12 digits
    re:     /(?<!\d)(\d{12})(?!\d)/g,
    group:  1,
    minConf: 0.55,
  },

  /* ── U.A.E. ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.ae-id",
    region: "ae",
    // UAE identity card: 15 digits (784-YYYY-SSSSSSS-C)
    re:     /\b(784[-]?\d{4}[-]?\d{7}[-]?\d)\b/g,
    group:  1,
  },

  /* ── Qatar ───────────────────────────────────────────────────── */
  {
    id:     "identity.nat.qa-id",
    region: "qa",
    // Qatar ID: 11 digits starting with 2 or 3
    re:     /(?<!\d)([23]\d{10})(?!\d)/g,
    group:  1,
    minConf: 0.5,
  },

  /* ── Saudi Arabia ────────────────────────────────────────────── */
  {
    id:     "identity.nat.sa-id",
    region: "sa",
    // Saudi national ID: 10 digits starting with 1 (citizen) or 2 (resident)
    re:     /(?<!\d)([12]\d{9})(?!\d)/g,
    group:  1,
    minConf: 0.5,
  },

  /* ── South Africa ────────────────────────────────────────────── */
  {
    id:     "identity.nat.za-id",
    region: "za",
    // South African ID: 13 digits (YYMMDD SSSS C A Z)
    re:     /(?<!\d)(\d{13})(?!\d)/g,
    group:  1,
    minConf: 0.55,
  },

  /* ── Brazil ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.br-rg",
    region: "br",
    // Brazilian RG: 7-9 digits with optional X at end
    re:     /\b(\d{1,2}[.\s]?\d{3}[.\s]?\d{3}[-]?[\dX])\b/gi,
    group:  1,
    minConf: 0.45,
  },

  /* ── Japan (extra) ───────────────────────────────────────────── */
  {
    id:     "identity.nat.jp-rrn",
    region: "jp",
    // Japan resident registration card: 12 digits
    re:     /(?<!\d)(\d{12})(?!\d)/g,
    group:  1,
    minConf: 0.55,
  },
  {
    id:     "identity.nat.jp-rc",
    region: "jp",
    // Japan residence card: 2 letters + 8 digits + 2 letters
    re:     /(?<![A-Z])([A-Z]{2}\d{8}[A-Z]{2})(?![A-Z])/gi,
    group:  1,
  },

  /* ── Mexico ──────────────────────────────────────────────────── */
  {
    id:     "identity.nat.mx-curp",
    region: "mx",
    // Mexican CURP: 4 letters + 6 digits + 6 alphanumeric
    re:     /(?<![A-Z0-9])([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)(?![A-Z0-9])/gi,
    group:  1,
  },

  /* ── Chile ───────────────────────────────────────────────────── */
  {
    id:     "identity.nat.cl-id",
    region: "cl",
    // Chilean RUT: digits with dot separators + hyphen + digit/K
    re:     /\b(\d{1,2}[.\s]?\d{3}[.\s]?\d{3}[-]?[\dK])\b/gi,
    group:  1,
  },

  /* ── Argentina ───────────────────────────────────────────────── */
  {
    id:     "identity.nat.ar-dni",
    region: "ar",
    // Argentine DNI: 7-8 digits
    re:     /(?<!\d)(\d{2}[.\s]?\d{3}[.\s]?\d{3})\b/g,
    group:  1,
    minConf: 0.45,
  },

  /* ── Ecuador ─────────────────────────────────────────────────── */
  {
    id:     "identity.nat.ec-id",
    region: "ec",
    // Ecuador cédula: 10 digits, first 2 = province (01-24)
    re:     /(?<!\d)((?:0[1-9]|1\d|2[0-4])\d{8})(?!\d)/g,
    group:  1,
    minConf: 0.5,
  },
];

/* ── Scan helper ───────────────────────────────────────────────── */

function scanEntry(entry: Entry, text: string): Array<{ raw: string; start: number; end: number }> {
  const re = new RegExp(entry.re.source, entry.re.flags.replace("g", "") + "g");
  re.lastIndex = 0;
  const hits: Array<{ raw: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const groupIdx = entry.group ?? 0;
    const raw   = (groupIdx > 0 ? m[groupIdx] : m[0]) ?? m[0]!;
    const start = m.index + (m[0]!.length - raw.length);
    hits.push({ raw, start, end: start + raw.length });
    if (m[0]!.length === 0) re.lastIndex++;
  }
  return hits;
}

/* ── Detector factory ──────────────────────────────────────────── */

function makeNatIdBetaDetector(entry: Entry): Detector {
  return {
    id:       entry.id,
    categoryId: "myIdentity" as CategoryId,
    region:   entry.region,
    shipTier: "beta",
    hintPattern: new RegExp(entry.re.source, entry.re.flags.replace("g", "") + "g"),

    scan(ctx: DetectorContext): Finding[] {
      const { text } = ctx;
      const findings: Finding[] = [];
      const emitted  = new Set<string>();
      const minConf  = entry.minConf ?? 0;

      for (const hit of scanEntry(entry, text)) {
        if (entry.validate && !entry.validate(hit.raw)) continue;
        const conf = contextScorer.score(ctx, hit, SCORER_CFG);
        if (conf < minConf) continue;
        const key = `${hit.start}-${hit.end}`;
        if (emitted.has(key)) continue;
        emitted.add(key);

        findings.push({
          detectorId:     entry.id,
          categoryId:     "myIdentity" as CategoryId,
          severity:       "critical",
          confidence:     conf,
          match:          { value: hit.raw, start: hit.start, end: hit.end },
          contextSnippet: buildSnippet(text, hit.start, hit.end),
          locale:         ctx.locale,
        });
      }
      return findings;
    },
  };
}

export const natIdBetaDetectors: Detector[] = ENTRIES.map(makeNatIdBetaDetector);
