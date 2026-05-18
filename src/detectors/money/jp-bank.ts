/**
 * Japan bank account detector — GA tier, JP region.
 *
 * Detects Japanese bank account identifiers in English-language documents:
 *   - Bank code: 4 digits (金融機関コード, e.g., 0001 = Bank of Japan)
 *   - Branch code: 3 digits (店番/支店コード)
 *   - Account type: 普通=ordinary(1), 当座=checking(2)
 *   - Account number: 7 digits
 *
 * In English documents these appear with explicit labels.
 * Severity: critical.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Regexes ─────────────────────────────────────────────────── */

/** Bank code: 4 digits, labeled */
const BANK_CODE_RE =
  /\b(?:bank[\s-]?code|kinyu[\s-]?kikan|金融機関コード)[:\s#]*(\d{4})\b/gi;

/** Branch code: 3 digits, labeled */
const BRANCH_CODE_RE =
  /\b(?:branch[\s-]?code|tenban|支店番号|店番)[:\s#]*(\d{3})\b/gi;

/** Account number: 7 digits, labeled */
const ACCOUNT_RE =
  /\b(?:account|kouza|口座番号)[\s#:.]*(?:no\.?|number|num\.?|番号)?[\s#:.]*(\d{7})\b/gi;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "bank code", "branch code", "japan", "japanese bank", "account number",
    "futsuu", "ordinary account", "tooza", "checking account",
    "wire", "transfer", "remittance", "zengin",
  ],
  negativeKeywords: [
    "tracking", "order", "reference", "zip",
  ],
  window: 150,
} as const;

/* ── Snippet builder ─────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

/* ── Detector ────────────────────────────────────────────────── */

export const jpBankDetector: Detector = {
  id: "jp-bank",
  categoryId: "myMoney" as CategoryId,
  region: "jp",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    // Collect bank or branch code positions
    const anchors: Array<{ start: number; end: number }> = [];

    BANK_CODE_RE.lastIndex = 0;
    let bm: RegExpExecArray | null;
    while ((bm = BANK_CODE_RE.exec(text)) !== null) {
      anchors.push({ start: bm.index, end: bm.index + bm[0].length });
    }

    BRANCH_CODE_RE.lastIndex = 0;
    let brm: RegExpExecArray | null;
    while ((brm = BRANCH_CODE_RE.exec(text)) !== null) {
      anchors.push({ start: brm.index, end: brm.index + brm[0].length });
    }

    if (anchors.length === 0) return [];

    // Find 7-digit account numbers near any anchor
    ACCOUNT_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = ACCOUNT_RE.exec(text)) !== null) {
      const acctStart = am.index;
      const acctEnd   = acctStart + am[0].length;

      const nearby = anchors.find(
        (a) => Math.abs(a.start - acctStart) <= 300,
      );
      if (!nearby) continue;

      const start = Math.min(nearby.start, acctStart);
      const end   = Math.max(nearby.end, acctEnd);

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "critical",
        confidence:     contextScorer.score(ctx, { start, end }, SCORER_CFG),
        match:          { value: am[1]!, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         "ja-JP",
      });
    }

    return findings;
  },
};
