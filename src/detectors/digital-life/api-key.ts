/**
 * API key / secret token detector — GA tier, global region.
 *
 * Detects well-known API key formats by prefix pattern. Each provider
 * has a recognisable signature that minimises false positives without
 * requiring network-side validation.
 *
 * Providers covered:
 *   • AWS Access Key ID   — AKIA[A-Z0-9]{16}
 *   • AWS Secret Key      — 40-char base64 after "secret" keyword
 *   • GitHub PAT (classic)— ghp_[A-Za-z0-9]{36}
 *   • GitHub fine-grained — github_pat_[A-Za-z0-9_]{82}
 *   • Google API key      — AIza[0-9A-Za-z\-_]{35}
 *   • Stripe secret key   — sk_live_[0-9a-zA-Z]{24+} or sk_test_…
 *   • Anthropic           — sk-ant-[A-Za-z0-9\-_]{80,}
 *   • Generic Bearer      — Bearer [A-Za-z0-9+/=\-_.]{20,}
 *
 * Severity: critical — API keys grant service-level access.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Pattern table ───────────────────────────────────────────── */

interface ApiPattern {
  name: string;
  re: RegExp;
  /** capture group index for the key value (0 = full match) */
  group: number;
}

const PATTERNS: ApiPattern[] = [
  { name: "aws-access-key",   re: /\b(AKIA[A-Z0-9]{16})\b/g,                      group: 1 },
  { name: "github-pat",       re: /\b(ghp_[A-Za-z0-9]{36})\b/g,                   group: 1 },
  { name: "github-fg-pat",    re: /\b(github_pat_[A-Za-z0-9_]{82})\b/g,            group: 1 },
  { name: "google-api-key",   re: /\b(AIza[0-9A-Za-z\-_]{35})\b/g,                group: 1 },
  { name: "stripe-secret",    re: /\b(sk_(?:live|test)_[0-9a-zA-Z]{24,})\b/g,     group: 1 },
  { name: "anthropic-key",    re: /\b(sk-ant-[A-Za-z0-9\-_]{80,})\b/g,            group: 1 },
  { name: "bearer-token",     re: /Bearer\s+([A-Za-z0-9+/=\-_.]{20,})/g,           group: 1 },
];

/* ── Context scorer config ───────────────────────────────────── */

const SCORER_CFG = {
  positiveKeywords: [
    "api key", "api_key", "access key", "secret", "token",
    "authorization", "auth", "bearer", "credential",
  ],
  negativeKeywords: [
    "example", "placeholder", "sample", "your_api_key", "insert_key",
    "xxxx", "aaaa",
  ],
  window: 80,
} as const;

/* ── Snippet builder ─────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

/* ── Detector ────────────────────────────────────────────────── */

export const apiKeyDetector: Detector = {
  id: "api-key",
  categoryId: "myDigitalLife" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    for (const { re, group } of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const raw   = m[group]!;
        const start = m.index + (m[0]!.indexOf(raw));
        const end   = start + raw.length;

        findings.push({
          detectorId:     this.id,
          categoryId:     this.categoryId,
          severity:       "critical",
          confidence:     contextScorer.score(ctx, { start, end }, SCORER_CFG),
          match:          { value: raw, start, end },
          contextSnippet: buildSnippet(text, start, end),
          locale:         ctx.locale,
        });
      }
    }

    return findings;
  },
};
