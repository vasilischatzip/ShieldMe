/**
 * Beta-tier tax ID / VAT detectors — T020e.
 *
 * Covers the 18 Tier-2 tax identifiers from the detector catalog §1.3.
 *
 * Ship tier: "beta" — opt-in, no recall gate.
 * Privacy: pure regex; no network, no DOM.
 * Contract: docs/detector-catalog.md §1.3
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer }  from "~/core/context-scorer";
import { brCpf }   from "../validators/br-cpf";
import { brCnpj }  from "../validators/br-cnpj";
import { arCuit }  from "../validators/ar-cuit";

/* ── Shared helpers ────────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

const SCORER_CFG = {
  positiveKeywords: [
    "tax", "vat", "steuer", "impuesto", "tva", "iva", "cpf", "cnpj", "cuit",
    "cuil", "pan", "gst", "tin", "fiscal", "income tax", "tax id",
    "tax number", "tax identification", "steuernummer",
  ],
  negativeKeywords: [
    "order", "invoice number", "tracking", "serial", "product", "reference",
  ],
  window: 100,
} as const;

/* ── Entry table ───────────────────────────────────────────────── */

type TaxEntry = {
  id: string;
  region: string;
  re: RegExp;
  group?: number;
  validate?: (raw: string) => boolean;
  minConf?: number;
};

const ENTRIES: TaxEntry[] = [
  /* ── Austria ─────────────────────────────────────────────────── */
  {
    id:     "money.tax.at-tin",
    region: "at",
    // Austrian TIN: 9 digits (ATU + 8 digits for VAT, but TIN is 9-digit personal)
    re:     /(?<!\d)(\d{9})(?!\d)/g,
    group:  1,
    minConf: 0.55,
  },
  {
    id:     "money.tax.at-vat",
    region: "at",
    // Austrian VAT: ATU followed by 8 digits
    re:     /\b(ATU\d{8})\b/gi,
    group:  1,
  },

  /* ── Belgium ─────────────────────────────────────────────────── */
  {
    id:     "money.tax.be-vat",
    region: "be",
    // Belgian VAT: BE followed by 10 digits
    re:     /\b(BE[ ]?0\d{9})\b/gi,
    group:  1,
  },

  /* ── Cyprus ──────────────────────────────────────────────────── */
  {
    id:     "money.tax.cy-tin",
    region: "cy",
    // Cypriot TIN: 8 digits + letter
    re:     /\b(\d{8}[A-Z])\b/g,
    group:  1,
    minConf: 0.5,
  },

  /* ── Germany VAT ─────────────────────────────────────────────── */
  {
    id:     "money.tax.de-vat",
    region: "de",
    // German VAT: DE followed by 9 digits
    re:     /\b(DE\d{9})\b/gi,
    group:  1,
  },

  /* ── France VAT ──────────────────────────────────────────────── */
  {
    id:     "money.tax.fr-vat",
    region: "fr",
    // French VAT: FR followed by 2 alphanumeric + 9 digits
    re:     /\b(FR[A-HJ-NP-Z0-9]{2}\d{9})\b/gi,
    group:  1,
  },

  /* ── Hungary ─────────────────────────────────────────────────── */
  {
    id:     "money.tax.hu-tin",
    region: "hu",
    // Hungarian TIN: 10 digits
    re:     /(?<!\d)(\d{10})(?!\d)/g,
    group:  1,
    minConf: 0.55,
  },
  {
    id:     "money.tax.hu-vat",
    region: "hu",
    // Hungarian VAT: HU + 8 digits
    re:     /\b(HU\d{8})\b/gi,
    group:  1,
  },

  /* ── Malta ───────────────────────────────────────────────────── */
  {
    id:     "money.tax.mt-tin",
    region: "mt",
    // Malta TIN: 7 digits + letter
    re:     /\b(\d{7}[A-Z])\b/g,
    group:  1,
    minConf: 0.5,
  },

  /* ── Poland ──────────────────────────────────────────────────── */
  {
    id:     "money.tax.pl-tin",
    region: "pl",
    // Polish NIP: 10 digits (often formatted XXX-XXX-XX-XX or XXX-XX-XX-XXX)
    re:     /\b(\d{3}[-]?\d{3}[-]?\d{2}[-]?\d{2}|\d{3}[-]?\d{2}[-]?\d{2}[-]?\d{3})\b/g,
    group:  1,
    minConf: 0.5,
  },

  /* ── Slovenia ────────────────────────────────────────────────── */
  {
    id:     "money.tax.si-tin",
    region: "si",
    // Slovenian TIN (EMŠO or TIN): 8 digits
    re:     /(?<!\d)(\d{8})(?!\d)/g,
    group:  1,
    minConf: 0.55,
  },

  /* ── Sweden ──────────────────────────────────────────────────── */
  {
    id:     "money.tax.se-tin",
    region: "se",
    // Swedish TIN (organisationsnummer): 10 digits XXXXXX-XXXX
    re:     /\b(\d{6}[-]\d{4})\b/g,
    group:  1,
  },

  /* ── India ───────────────────────────────────────────────────── */
  {
    id:     "money.tax.in-pan",
    region: "in",
    // Indian PAN: 5 uppercase letters + 4 digits + 1 letter
    re:     /(?<![A-Z])([A-Z]{5}\d{4}[A-Z])(?![A-Z])/g,
    group:  1,
    // First char must be A-Z (entity type), 4th must be P for individuals
    validate: s => /^[A-Z]{5}\d{4}[A-Z]$/.test(s),
  },
  {
    id:     "money.tax.in-gst",
    region: "in",
    // Indian GSTIN: 2-digit state + PAN + 1 digit + Z + checksum
    re:     /(?<![A-Z0-9])(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])(?![A-Z0-9])/gi,
    group:  1,
  },

  /* ── Brazil ──────────────────────────────────────────────────── */
  {
    id:     "money.tax.br-cpf",
    region: "br",
    // Brazilian CPF: DDD.DDD.DDD-DD or 11 digits
    re:     /\b(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})\b/g,
    group:  1,
    validate: brCpf,
  },
  {
    id:     "money.tax.br-cnpj",
    region: "br",
    // Brazilian CNPJ: XX.XXX.XXX/XXXX-DD or 14 digits
    re:     /\b(\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2})\b/g,
    group:  1,
    validate: brCnpj,
  },

  /* ── Argentina ───────────────────────────────────────────────── */
  {
    id:     "money.tax.ar-cuit",
    region: "ar",
    // Argentine CUIT/CUIL: 2 digits + 8 digits + 1 digit (with optional hyphens)
    re:     /\b((?:20|23|24|27|30|33|34)[-]?\d{8}[-]?\d)\b/g,
    group:  1,
    validate: arCuit,
  },
];

/* ── Detector factory ──────────────────────────────────────────── */

function makeTaxBetaDetector(entry: TaxEntry): Detector {
  return {
    id:         entry.id,
    categoryId: "myMoney" as CategoryId,
    region:     entry.region,
    shipTier:   "beta",
    hintPattern: new RegExp(entry.re.source, entry.re.flags.replace("g", "") + "g"),

    scan(ctx: DetectorContext): Finding[] {
      const { text } = ctx;
      const findings: Finding[] = [];
      const emitted  = new Set<string>();
      const minConf  = entry.minConf ?? 0;

      const re = new RegExp(entry.re.source, entry.re.flags.replace("g", "") + "g");
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const groupIdx = entry.group ?? 0;
        const raw   = (groupIdx > 0 ? m[groupIdx] : m[0]) ?? m[0]!;
        const start = m.index + (m[0]!.length - raw.length);
        const end   = start + raw.length;

        if (entry.validate && !entry.validate(raw)) {
          if (m[0]!.length === 0) re.lastIndex++;
          continue;
        }

        const conf = contextScorer.score(ctx, { start, end }, SCORER_CFG);
        if (conf < minConf) {
          if (m[0]!.length === 0) re.lastIndex++;
          continue;
        }

        const key = `${start}-${end}`;
        if (!emitted.has(key)) {
          emitted.add(key);
          findings.push({
            detectorId:     entry.id,
            categoryId:     "myMoney" as CategoryId,
            severity:       "warning",
            confidence:     conf,
            match:          { value: raw, start, end },
            contextSnippet: buildSnippet(text, start, end),
            locale:         ctx.locale,
          });
        }

        if (m[0]!.length === 0) re.lastIndex++;
      }
      return findings;
    },
  };
}

export const taxBetaDetectors: Detector[] = ENTRIES.map(makeTaxBetaDetector);
