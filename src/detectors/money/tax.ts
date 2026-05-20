/**
 * Tier-1 tax ID detectors — GA ship tier.
 *
 * Covers the per-country tax identifiers from the detector catalog §1.2 that
 * are NOT already surfaced by national-id.ts or tax-beta.ts:
 *
 *   • US ITIN   — Individual Taxpayer Identification Number (9XX-XX-XXXX)
 *   • UK UTR    — Unique Taxpayer Reference (10 digits, HMRC-issued)
 *   • CA SIN    — Canadian Social Insurance Number (Luhn-validated)
 *   • AU ABN    — Australian Business Number (weighted checksum)
 *   • JP MN     — Japanese My Number / 個人番号 (12-digit check digit)
 *   • NL BSN    — Dutch Burgerservicenummer (11-proof / elfproef)
 *
 * Why separate from national-id.ts:
 *   These numbers appear primarily in financial and tax documents (pay stubs,
 *   ATO returns, CRA T4s, tax filings) and are mapped to "myMoney" so users
 *   scanning financial documents see them grouped correctly. They are also
 *   geographically scoped — the detector is region:"global" but each entry
 *   uses keyword context gating to minimise false positives in non-relevant
 *   documents.
 *
 * Detectors already in other files (not re-implemented here):
 *   • UK NINO, GR AFM, ES NIF, IT Codice Fiscale, PT NIF, FR INSEE, DE TIN,
 *     AU TFN → national-id.ts (myIdentity)
 *   • AT/BE/CY/DE/FR/HU/MT/PL/SI/SE VAT, IN PAN/GST, BR CPF/CNPJ, AR CUIT
 *     → tax-beta.ts (beta tier, myMoney)
 *   • US SSN → ssn.ts (myIdentity, critical severity)
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { caSin }        from "../validators/ca-sin";
import { auAbn }        from "../validators/au-abn";
import { jpMyNumber }   from "../validators/jp-my-number";
import { contextScorer } from "~/core/context-scorer";

/* ── Shared helpers ──────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

/* ── NL BSN (Dutch Burgerservicenummer) inline validator ─────── */

/**
 * Validates a Dutch BSN using the "elfproef" (11-proof) algorithm.
 * Weights [9, 8, 7, 6, 5, 4, 3, 2, −1]; sum must be divisible by 11.
 * BSN is always 9 digits; leading zeros are preserved.
 */
function nlBsn(value: string): boolean {
  const digits = value.replace(/\s/g, "");
  if (!/^\d{9}$/.test(digits)) return false;
  const WEIGHTS = [9, 8, 7, 6, 5, 4, 3, 2, -1] as const;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (digits.charCodeAt(i) - 48) * (WEIGHTS[i] ?? 0);
  }
  return sum > 0 && sum % 11 === 0;
}

/* ── US ITIN helper ───────────────────────────────────────────── */

/**
 * US ITIN structural check.
 * Area code (first 3 digits) must start with 9.
 * Middle group (digits 4-5) must be in: 50-65, 70-88, 90-92, 94-99.
 * (IRS Publication 1915 — ranges are fixed; ITINs starting 9XX-00/78/79/XX are invalid.)
 */
function isValidItin(raw: string): boolean {
  const digits = raw.replace(/[-\s]/g, "");
  if (!/^\d{9}$/.test(digits)) return false;
  const area  = parseInt(digits.slice(0, 3), 10);
  const group = parseInt(digits.slice(3, 5), 10);
  const serial = parseInt(digits.slice(5), 10);
  if (area < 900 || area > 999) return false;
  if (group === 0 || group === 78 || group === 79) return false;
  if (serial === 0) return false;
  const validGroup =
    (group >= 50 && group <= 65) ||
    (group >= 70 && group <= 88) ||
    (group >= 90 && group <= 92) ||
    (group >= 94 && group <= 99);
  return validGroup;
}

/* ── Scorer configs ───────────────────────────────────────────── */

const ITIN_SCORER = {
  positiveKeywords: [
    "itin", "individual taxpayer", "taxpayer id", "taxpayer identification",
    "tin", "tax id", "irs", "income tax", "tax return", "form w-7",
  ],
  negativeKeywords: ["ssn", "social security", "routing", "account", "order"],
  window: 80,
} as const;

const UTR_SCORER = {
  positiveKeywords: [
    "utr", "unique taxpayer", "taxpayer reference", "hmrc",
    "self assessment", "corporation tax", "tax return", "sa302",
  ],
  negativeKeywords: ["order", "invoice", "tracking", "serial", "reference number"],
  window: 80,
} as const;

const SIN_SCORER = {
  positiveKeywords: [
    "sin", "social insurance", "canada revenue", "cra", "t4", "t1",
    "employment insurance", "ei number", "revenue canada",
  ],
  negativeKeywords: ["routing", "account", "order", "serial", "credit card"],
  window: 80,
} as const;

const ABN_SCORER = {
  positiveKeywords: [
    "abn", "australian business", "business number", "ato",
    "gst", "bas", "tax invoice", "a.b.n",
  ],
  negativeKeywords: ["tfn", "account", "order", "invoice number", "tracking"],
  window: 80,
} as const;

const JP_MN_SCORER = {
  positiveKeywords: [
    "my number", "マイナンバー", "個人番号", "番号", "mynumber",
    "japan", "japanese", "tax id", "national id",
  ],
  negativeKeywords: ["order", "phone", "postal", "tracking", "account"],
  window: 80,
} as const;

const BSN_SCORER = {
  positiveKeywords: [
    "bsn", "burgerservicenummer", "sofinummer", "sofi",
    "dutch", "netherlands", "nederland", "belastingdienst",
    "tax id", "identification number",
  ],
  negativeKeywords: ["order", "iban", "phone", "postal", "tracking"],
  window: 80,
} as const;

/* ── US ITIN detector ────────────────────────────────────────── */

const ITIN_RE = /(?<!\d)(9\d{2}[-\s]\d{2}[-\s]\d{4})(?!\d)/g;
const ITIN_SOLID_RE = /(?<!\d)(9\d{8})(?!\d)/g;

export const itinDetector: Detector = {
  id:          "us-itin",
  categoryId:  "myMoney" as CategoryId,
  region:      "global",
  shipTier:    "ga",
  hintPattern: /\b9\d{2}[-\s]?\d{2}[-\s]?\d{4}\b/g,

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    const emitted = new Set<string>();

    function emit(raw: string, start: number, end: number): void {
      const key = `${start}-${end}`;
      if (emitted.has(key)) return;
      emitted.add(key);
      const conf = contextScorer.score(ctx, { start, end }, ITIN_SCORER);
      findings.push({
        detectorId:     "us-itin",
        categoryId:     "myMoney" as CategoryId,
        severity:       "critical",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    /* formatted: 9XX-XX-XXXX */
    ITIN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ITIN_RE.exec(text)) !== null) {
      const raw = m[1]!;
      if (!isValidItin(raw)) {
        if (m[0]!.length === 0) ITIN_RE.lastIndex++;
        continue;
      }
      const start = m.index + (m[0]!.length - raw.length);
      emit(raw, start, start + raw.length);
    }

    /* solid 9-digit: only surface with keyword context */
    ITIN_SOLID_RE.lastIndex = 0;
    while ((m = ITIN_SOLID_RE.exec(text)) !== null) {
      const raw = m[1]!;
      if (!isValidItin(raw)) {
        if (m[0]!.length === 0) ITIN_SOLID_RE.lastIndex++;
        continue;
      }
      const start = m.index + (m[0]!.length - raw.length);
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, ITIN_SCORER);
      if (conf <= 0.5) {
        if (m[0]!.length === 0) ITIN_SOLID_RE.lastIndex++;
        continue;
      }
      emit(raw, start, end);
    }

    return findings;
  },
};

/* ── UK UTR detector ─────────────────────────────────────────── */

/** UTR: 10 bare digits — no checksum; needs strong keyword gate. */
const UTR_RE = /(?<!\d)(\d{10})(?!\d)/g;
/** UTR sometimes prefixed: K1234567890 */
const UTR_K_RE = /(?<![A-Z])K(\d{10})(?!\d)/g;

export const ukUtrDetector: Detector = {
  id:          "uk-utr",
  categoryId:  "myMoney" as CategoryId,
  region:      "global",
  shipTier:    "ga",
  hintPattern: /(?:K|\b)\d{10}\b/g,

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    const emitted = new Set<string>();

    function emit(raw: string, start: number, end: number): void {
      const key = `${start}-${end}`;
      if (emitted.has(key)) return;
      const conf = contextScorer.score(ctx, { start, end }, UTR_SCORER);
      if (conf <= 0.5) return; // UTR has no checksum — demand at least one keyword (baseline=0.5)
      emitted.add(key);
      findings.push({
        detectorId:     "uk-utr",
        categoryId:     "myMoney" as CategoryId,
        severity:       "warning",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    UTR_K_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = UTR_K_RE.exec(text)) !== null) {
      const raw = m[1]!;
      const start = m.index + (m[0]!.length - raw.length);
      emit(raw, start, start + raw.length);
      if (m[0]!.length === 0) UTR_K_RE.lastIndex++;
    }

    UTR_RE.lastIndex = 0;
    while ((m = UTR_RE.exec(text)) !== null) {
      const raw = m[1]!;
      const start = m.index;
      emit(raw, start, start + raw.length);
      if (m[0]!.length === 0) UTR_RE.lastIndex++;
    }

    return findings;
  },
};

/* ── CA SIN detector ─────────────────────────────────────────── */

/** SIN: NNN-NNN-NNN or 9 bare digits */
const SIN_RE = /(?<!\d)(\d{3}[-\s]\d{3}[-\s]\d{3})(?!\d)/g;
const SIN_SOLID_RE = /(?<!\d)(\d{9})(?!\d)/g;

export const caSinDetector: Detector = {
  id:          "ca-sin",
  categoryId:  "myMoney" as CategoryId,
  region:      "global",
  shipTier:    "ga",
  hintPattern: /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g,

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    const emitted = new Set<string>();

    function emit(raw: string, start: number, end: number, minConf = 0): void {
      const key = `${start}-${end}`;
      if (emitted.has(key)) return;
      if (!caSin(raw)) return;
      const conf = contextScorer.score(ctx, { start, end }, SIN_SCORER);
      if (conf < minConf) return;
      emitted.add(key);
      findings.push({
        detectorId:     "ca-sin",
        categoryId:     "myMoney" as CategoryId,
        severity:       "critical",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    SIN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SIN_RE.exec(text)) !== null) {
      const raw = m[1]!;
      const start = m.index + (m[0]!.length - raw.length);
      emit(raw, start, start + raw.length);
      if (m[0]!.length === 0) SIN_RE.lastIndex++;
    }

    /* solid 9-digit SIN — need keyword support given overlap with other 9-digit IDs */
    SIN_SOLID_RE.lastIndex = 0;
    while ((m = SIN_SOLID_RE.exec(text)) !== null) {
      const raw = m[1]!;
      const start = m.index;
      // 0.51 = require at least one keyword (baseline = 0.5)
      emit(raw, start, start + raw.length, 0.51);
      if (m[0]!.length === 0) SIN_SOLID_RE.lastIndex++;
    }

    return findings;
  },
};

/* ── AU ABN detector ─────────────────────────────────────────── */

/** ABN: 11 digits, commonly formatted XX NNN NNN NNN */
const ABN_RE = /(?<!\d)(\d{2}[\s]?\d{3}[\s]?\d{3}[\s]?\d{3})(?!\d)/g;

export const auAbnDetector: Detector = {
  id:          "au-abn",
  categoryId:  "myMoney" as CategoryId,
  region:      "global",
  shipTier:    "ga",
  hintPattern: /\b\d{2}[\s]?\d{3}[\s]?\d{3}[\s]?\d{3}\b/g,

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    const emitted = new Set<string>();

    ABN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ABN_RE.exec(text)) !== null) {
      const raw = m[1]!;
      if (!auAbn(raw)) {
        if (m[0]!.length === 0) ABN_RE.lastIndex++;
        continue;
      }
      const start = m.index + (m[0]!.length - raw.length);
      const end   = start + raw.length;
      const key   = `${start}-${end}`;
      if (emitted.has(key)) {
        if (m[0]!.length === 0) ABN_RE.lastIndex++;
        continue;
      }
      emitted.add(key);
      const conf = contextScorer.score(ctx, { start, end }, ABN_SCORER);
      findings.push({
        detectorId:     "au-abn",
        categoryId:     "myMoney" as CategoryId,
        severity:       "warning",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
      if (m[0]!.length === 0) ABN_RE.lastIndex++;
    }

    return findings;
  },
};

/* ── JP My Number detector ───────────────────────────────────── */

/** My Number: formatted XXXX-XXXX-XXXX (separator required) or 12 bare digits */
const JP_MN_RE      = /(?<!\d)(\d{4}[-\s]\d{4}[-\s]\d{4})(?!\d)/g;
const JP_MN_SOLID_RE = /(?<!\d)(\d{12})(?!\d)/g;

export const jpMyNumberDetector: Detector = {
  id:          "jp-my-number",
  categoryId:  "myMoney" as CategoryId,
  region:      "global",
  shipTier:    "ga",
  hintPattern: /(?:\b\d{4}[-\s]\d{4}[-\s]\d{4}\b|\b\d{12}\b)/g,

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    const emitted = new Set<string>();

    function emit(raw: string, start: number, end: number, minConf = 0): void {
      const key = `${start}-${end}`;
      if (emitted.has(key)) return;
      if (!jpMyNumber(raw)) return;
      const conf = contextScorer.score(ctx, { start, end }, JP_MN_SCORER);
      if (conf < minConf) return;
      emitted.add(key);
      findings.push({
        detectorId:     "jp-my-number",
        categoryId:     "myMoney" as CategoryId,
        severity:       "warning",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    JP_MN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = JP_MN_RE.exec(text)) !== null) {
      const raw = m[1]!;
      const start = m.index + (m[0]!.length - raw.length);
      emit(raw, start, start + raw.length);
      if (m[0]!.length === 0) JP_MN_RE.lastIndex++;
    }

    JP_MN_SOLID_RE.lastIndex = 0;
    while ((m = JP_MN_SOLID_RE.exec(text)) !== null) {
      const raw = m[1]!;
      const start = m.index;
      // 0.51 = require at least one keyword (baseline = 0.5)
      emit(raw, start, start + raw.length, 0.51);
      if (m[0]!.length === 0) JP_MN_SOLID_RE.lastIndex++;
    }

    return findings;
  },
};

/* ── NL BSN detector ─────────────────────────────────────────── */

/** BSN: 9 digits (elfproef / 11-proof validated) */
const BSN_RE = /(?<!\d)(\d{9})(?!\d)/g;

export const nlBsnDetector: Detector = {
  id:          "nl-bsn",
  categoryId:  "myMoney" as CategoryId,
  region:      "global",
  shipTier:    "ga",
  hintPattern: /\b\d{9}\b/g,

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    const emitted = new Set<string>();

    BSN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BSN_RE.exec(text)) !== null) {
      const raw = m[1]!;
      if (!nlBsn(raw)) {
        if (m[0]!.length === 0) BSN_RE.lastIndex++;
        continue;
      }
      const start = m.index;
      const end   = start + raw.length;
      const key   = `${start}-${end}`;
      if (emitted.has(key)) {
        if (m[0]!.length === 0) BSN_RE.lastIndex++;
        continue;
      }
      const conf = contextScorer.score(ctx, { start, end }, BSN_SCORER);
      // BSN is 9-digit — same pattern as AFM, SIN, TFN. Require at least one keyword.
      if (conf <= 0.5) {
        if (m[0]!.length === 0) BSN_RE.lastIndex++;
        continue;
      }
      emitted.add(key);
      findings.push({
        detectorId:     "nl-bsn",
        categoryId:     "myMoney" as CategoryId,
        severity:       "warning",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
      if (m[0]!.length === 0) BSN_RE.lastIndex++;
    }

    return findings;
  },
};

/* ── All tax detectors (export for index) ────────────────────── */

export const taxDetectors: Detector[] = [
  itinDetector,
  ukUtrDetector,
  caSinDetector,
  auAbnDetector,
  jpMyNumberDetector,
  nlBsnDetector,
];
