/**
 * Beta-tier bank account detectors — T020e.
 *
 * Covers Israel (IL) and New Zealand (NZ) bank accounts from
 * detector catalog §1.2.
 *
 * Ship tier: "beta" — opt-in, no recall gate.
 * Privacy: pure regex; no network, no DOM.
 * Contract: docs/detector-catalog.md §1.2
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Shared helpers ────────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

const SCORER_CFG = {
  positiveKeywords: [
    "bank", "account", "account number", "bank account", "checking", "savings",
    "חשבון", "bank account number", "deposit",
  ],
  negativeKeywords: ["order", "invoice", "reference", "product"],
  window: 100,
} as const;

/* ── Israel ────────────────────────────────────────────────────── */

// Israeli bank account: branch code (3 digits) + account (4-9 digits)
// Often formatted as: BBB-AAAAAAA or BBB/AAAAAAA
const IL_BANK_RE = /\b(\d{2,3}[-/]\d{4,9})\b/g;

export const ilBankDetector: Detector = {
  id:         "money.bank.il-account",
  categoryId: "myMoney" as CategoryId,
  region:     "il",
  shipTier:   "beta",
  hintPattern: /\b\d{2,3}[-/]\d{4,9}\b/g,

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    const re = new RegExp(IL_BANK_RE.source, "g");
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw   = m[1] ?? m[0]!;
      const start = m.index + (m[0]!.length - raw.length);
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);
      if (conf < 0.5) continue;
      findings.push({
        detectorId:     "money.bank.il-account",
        categoryId:     "myMoney" as CategoryId,
        severity:       "warning",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }
    return findings;
  },
};

/* ── New Zealand ───────────────────────────────────────────────── */

// NZ bank account: BB-bbbb-AAAAAAA-SS (2 + 4 + 7 + 2-3 digits)
const NZ_BANK_RE = /\b(\d{2}[-]\d{4}[-]\d{7}[-]\d{2,3})\b/g;

export const nzBankDetector: Detector = {
  id:         "money.bank.nz-account",
  categoryId: "myMoney" as CategoryId,
  region:     "nz",
  shipTier:   "beta",
  hintPattern: /\b\d{2}-\d{4}-\d{7}-\d{2,3}\b/g,

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];
    const re = new RegExp(NZ_BANK_RE.source, "g");
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw   = m[1] ?? m[0]!;
      const start = m.index + (m[0]!.length - raw.length);
      const end   = start + raw.length;
      const conf  = contextScorer.score(ctx, { start, end }, SCORER_CFG);
      if (conf < 0.4) continue;
      findings.push({
        detectorId:     "money.bank.nz-account",
        categoryId:     "myMoney" as CategoryId,
        severity:       "warning",
        confidence:     conf,
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }
    return findings;
  },
};
