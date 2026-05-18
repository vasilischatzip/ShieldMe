/**
 * Cryptocurrency wallet address detector — GA tier, global region.
 *
 * Detects:
 *   • Bitcoin P2PKH   (starts with 1, Base58, 25–34 chars)
 *   • Bitcoin P2SH    (starts with 3, Base58, 25–34 chars)
 *   • Bitcoin Bech32  (bc1 prefix, lowercase, 14–74 chars)
 *   • Ethereum / EVM  (0x + 40 hex chars)
 *
 * No on-chain checksum is verified at scan time (requires runtime I/O).
 * Confidence is lower (0.5 baseline) and context keywords drive it up.
 *
 * Severity: warning — wallet address alone enables fund targeting but not access.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Base58 character set (Bitcoin) ──────────────────────────── */

const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_RE_FRAG = `[${BASE58_CHARS}]`;

/* ── Regex patterns ──────────────────────────────────────────── */

/** Bitcoin P2PKH: starts with 1, Base58, 25–34 chars */
const BTC_P2PKH_RE = new RegExp(
  `(?<![${BASE58_CHARS}])(1${BASE58_RE_FRAG}{24,33})(?![${BASE58_CHARS}])`,
  "g",
);

/** Bitcoin P2SH: starts with 3, Base58, 25–34 chars */
const BTC_P2SH_RE = new RegExp(
  `(?<![${BASE58_CHARS}])(3${BASE58_RE_FRAG}{24,33})(?![${BASE58_CHARS}])`,
  "g",
);

/** Bitcoin Bech32: bc1 prefix, 14–74 chars (witness v0–v1 addresses) */
const BTC_BECH32_RE = /\b(bc1[a-z0-9]{8,87})\b/g;

/** Ethereum / EVM: 0x + exactly 40 hex chars */
const ETH_RE = /\b(0x[a-fA-F0-9]{40})\b/g;

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "bitcoin", "btc", "ethereum", "eth", "wallet", "address",
    "crypto", "send to", "deposit", "receive",
  ],
  negativeKeywords: [
    "color", "colour", "hex code", "#", "rgb", "css",
  ],
  window: 80,
} as const;

/* ── Snippet builder ─────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

/* ── Generic scan helper ─────────────────────────────────────── */

function scanWithRe(
  re: RegExp,
  ctx: DetectorContext,
  detectorId: string,
  categoryId: CategoryId,
  findings: Finding[],
): void {
  const { text } = ctx;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw   = m[1]!;
    const start = m.index + (m[0].length - raw.length);
    const end   = start + raw.length;

    findings.push({
      detectorId,
      categoryId,
      severity:       "warning",   // wallet address ≠ private key
      confidence:     contextScorer.score(ctx, { start, end }, SCORER_CFG),
      match:          { value: raw, start, end },
      contextSnippet: buildSnippet(text, start, end),
      locale:         ctx.locale,
    });
  }
}

/* ── Detector ────────────────────────────────────────────────── */

export const cryptoWalletDetector: Detector = {
  id: "crypto-wallet",
  categoryId: "myMoney" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const findings: Finding[] = [];
    scanWithRe(BTC_P2PKH_RE,  ctx, this.id, this.categoryId, findings);
    scanWithRe(BTC_P2SH_RE,   ctx, this.id, this.categoryId, findings);
    scanWithRe(BTC_BECH32_RE, ctx, this.id, this.categoryId, findings);
    scanWithRe(ETH_RE,         ctx, this.id, this.categoryId, findings);
    return findings;
  },
};
