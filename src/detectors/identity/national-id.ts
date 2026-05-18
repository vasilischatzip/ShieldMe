/**
 * National ID detector — GA tier, global region.
 *
 * Detects national identification numbers from multiple countries using
 * the country-specific validators from T015. Each candidate is validated
 * with the appropriate checksum before being surfaced.
 *
 * Country coverage (all with checksum validation):
 *   • UK  — NINO (National Insurance Number)
 *   • GR  — AFM (Greek Tax ID / ΑΦΜ)
 *   • ES  — NIF (Spanish DNI/NIE)
 *   • IT  — Codice Fiscale
 *   • PT  — NIF (Portuguese)
 *   • FR  — INSEE (French Social Security)
 *   • DE  — Steueridentifikationsnummer (11-digit TIN)
 *   • AU  — TFN (Tax File Number)
 *
 * Severity: critical — national IDs are a primary identity theft vector.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { ukNino }        from "../validators/uk-nino";
import { afmChecksum }   from "../validators/afm";
import { nifSpain }      from "../validators/nif-spain";
import { codiceFiscale } from "../validators/codice-fiscale";
import { nifPortugal }   from "../validators/nif-portugal";
import { inseeChecksum } from "../validators/insee";
import { deTin }         from "../validators/de-tin";
import { auTfn }         from "../validators/au-tfn";
import { contextScorer } from "~/core/context-scorer";

/* ── Snippet builder ─────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

/* ── Shared scorer config ─────────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "national id", "tax number", "id number", "identification",
    "fiscal code", "social security", "insurance number",
    "afm", "nif", "codice fiscale", "nino", "insee", "steuer",
    "tax file", "tfn",
  ],
  negativeKeywords: [
    "order", "invoice", "tracking", "serial", "reference",
    "product", "part number",
  ],
  window: 80,
} as const;

/* ── Per-country candidate extractors ────────────────────────── */

type Candidate = { raw: string; start: number; end: number };

function scanRe(re: RegExp, text: string, groupIndex: number): Candidate[] {
  re.lastIndex = 0;
  const results: Candidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[groupIndex] ?? m[0]!;
    const start = m.index + (m[0]!.length - raw.length);
    results.push({ raw, start, end: start + raw.length });
  }
  return results;
}

/* ── Regex patterns ──────────────────────────────────────────── */

const NINO_RE         = /(?<![A-Z])([A-Z]{2}\d{6}[A-D])(?![A-Z])/g;
// 9-digit pattern shared by Greek AFM / Portuguese NIF / Australian TFN —
// the loop in scan() runs each validator in turn against this regex.
const AFM_RE          = /(?<!\d)(\d{9})(?!\d)/g;
const NIF_ES_RE       = /(?<![A-Z0-9])([0-9XYZ][0-9]{7}[A-Z])(?![A-Z0-9])/gi;
const CF_RE           = /(?<![A-Z0-9])([A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z])(?![A-Z0-9])/g;
const INSEE_RE        = /(?<!\d)(\d{15})(?!\d)/g;
const DE_TIN_RE       = /(?<!\d)(\d{11})(?!\d)/g;

/* ── Detector ────────────────────────────────────────────────── */

export const nationalIdDetector: Detector = {
  id: "national-id",
  categoryId: "myIdentity" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    // Track match positions to avoid duplicate findings for the same span
    const emitted = new Set<string>();

    function emit(candidate: Candidate, conf: number): void {
      const key = `${candidate.start}-${candidate.end}`;
      if (emitted.has(key)) return;
      emitted.add(key);

      findings.push({
        detectorId:     "national-id",
        categoryId:     "myIdentity" as CategoryId,
        severity:       "critical",
        confidence:     conf,
        match:          { value: candidate.raw, start: candidate.start, end: candidate.end },
        contextSnippet: buildSnippet(text, candidate.start, candidate.end),
        locale:         ctx.locale,
      });
    }

    // UK NINO — strong structural pattern, lower context bar
    for (const c of scanRe(NINO_RE, text, 1)) {
      if (!ukNino(c.raw)) continue;
      const conf = contextScorer.score(ctx, c, SCORER_CFG);
      emit(c, conf);
    }

    // Italian Codice Fiscale — strong 16-char structure
    for (const c of scanRe(CF_RE, text, 1)) {
      if (!codiceFiscale(c.raw)) continue;
      const conf = contextScorer.score(ctx, c, SCORER_CFG);
      emit(c, conf);
    }

    // French INSEE — 15-digit with strict mod-97
    for (const c of scanRe(INSEE_RE, text, 1)) {
      if (!inseeChecksum(c.raw)) continue;
      const conf = contextScorer.score(ctx, c, SCORER_CFG);
      emit(c, conf);
    }

    // German TIN — 11-digit ISO 7064 MOD 11,10
    for (const c of scanRe(DE_TIN_RE, text, 1)) {
      if (!deTin(c.raw)) continue;
      const conf = contextScorer.score(ctx, c, SCORER_CFG);
      // Suppress without keyword context (11 digits is common in other contexts)
      if (conf <= 0.5) continue;
      emit(c, conf);
    }

    // Spanish NIF (including NIE)
    for (const c of scanRe(NIF_ES_RE, text, 1)) {
      if (!nifSpain(c.raw.toUpperCase())) continue;
      const conf = contextScorer.score(ctx, c, SCORER_CFG);
      emit(c, conf);
    }

    // Greek AFM / Portuguese NIF / AU TFN — all 9-digit; validator differentiates
    for (const c of scanRe(AFM_RE, text, 1)) {
      const conf = contextScorer.score(ctx, c, SCORER_CFG);
      if (afmChecksum(c.raw)) { emit(c, conf); continue; }
      if (nifPortugal(c.raw)) { emit(c, conf); continue; }
      if (auTfn(c.raw))       { emit(c, conf); }
    }

    return findings;
  },
};
