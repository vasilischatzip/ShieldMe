/**
 * Per-vendor cloud API key / secret detectors — GA ship tier.
 *
 * Detector catalog §3.2 — these provide per-vendor toggles so users can
 * selectively enable/disable detection for specific services.
 *
 * Vendors covered here (all with deterministic prefix patterns):
 *   • slack-token         — xoxb-/xoxp-/xapp-/xoxa- workspace tokens
 *   • openai-key          — sk-[48+] (OpenAI project/user/service keys)
 *   • huggingface-token   — hf_[34+] Hub tokens
 *   • replicate-token     — r8_[37+] API tokens
 *   • stripe-pub          — pk_live_ / pk_test_ publishable keys
 *   • stripe-webhook      — whsec_ endpoint signing secrets
 *   • twilio-account-sid  — AC[a-f0-9]{32} Account SIDs
 *   • sendgrid-key        — SG.[20+].[43+] API keys
 *   • npm-token           — npm_[A-Za-z0-9]{36} access tokens
 *   • azure-conn-string   — Azure Storage connection strings (AccountKey=)
 *   • discord-token       — Bot token three-part B64.B64.B64 format
 *
 * Vendors already in api-key.ts (single aggregate detector, not split):
 *   • aws-access-key (AKIA[A-Z0-9]{16})
 *   • github-pat / github-fg-pat
 *   • google-api-key (AIza...)
 *   • stripe-secret (sk_live_/sk_test_)  ← note: different from sk-ant- (Anthropic)
 *   • anthropic-key (sk-ant-...)
 *
 * All detectors ship as categoryId "myDigitalLife", severity "critical",
 * region "global", shipTier "ga".
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";
import { contextScorer } from "~/core/context-scorer";

/* ── Shared helpers ──────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 60), start);
  const suffix = text.slice(end, Math.min(text.length, end + 60));
  return prefix + "•••" + suffix;
}

const CAT: CategoryId = "myDigitalLife" as CategoryId;

const SHARED_SCORER = {
  positiveKeywords: [
    "api key", "api_key", "token", "secret", "credential",
    "authorization", "auth", "key", "access",
  ],
  negativeKeywords: [
    "example", "placeholder", "sample", "your_api_key",
    "xxxx", "aaaa", "test_key",
  ],
  window: 80,
} as const;

/* ── Factory ─────────────────────────────────────────────────── */

type CloudKeyEntry = {
  id:          string;
  re:          RegExp;
  group?:      number;
  /** minimum confidence required; defaults to 0 (always emit when matched) */
  minConf?:    number;
  scorer?:     typeof SHARED_SCORER;
};

function makeCloudKeyDetector(entry: CloudKeyEntry): Detector {
  const { id, re, group = 1, minConf = 0, scorer = SHARED_SCORER } = entry;

  return {
    id,
    categoryId:  CAT,
    region:      "global",
    shipTier:    "ga",
    hintPattern: new RegExp(re.source, re.flags.replace(/g/g, "").concat("g")),

    scan(ctx: DetectorContext): Finding[] {
      const { text } = ctx;
      const findings: Finding[] = [];
      const emitted = new Set<string>();

      const localRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      localRe.lastIndex = 0;
      let m: RegExpExecArray | null;

      while ((m = localRe.exec(text)) !== null) {
        const raw   = (group > 0 ? m[group] : m[0]) ?? m[0]!;
        const start = m.index + (m[0]!.length - raw.length);
        const end   = start + raw.length;
        const key   = `${start}-${end}`;

        if (!emitted.has(key)) {
          const conf = contextScorer.score(ctx, { start, end }, scorer);
          if (conf > minConf) {
            emitted.add(key);
            findings.push({
              detectorId:     id,
              categoryId:     CAT,
              severity:       "critical",
              confidence:     conf,
              match:          { value: raw, start, end },
              contextSnippet: buildSnippet(text, start, end),
              locale:         ctx.locale,
            });
          }
        }

        if (m[0]!.length === 0) localRe.lastIndex++;
      }

      return findings;
    },
  };
}

/* ── Entries ─────────────────────────────────────────────────── */

const ENTRIES: CloudKeyEntry[] = [
  /* ── Slack ────────────────────────────────────────────────── */
  {
    id: "slack-token",
    // xoxb- bot, xoxp- user, xoxs- workspace, xoxa- OAuth, xoxo- app
    // xapp- app-level (Socket Mode) — note: xapp- is NOT xox-prefixed
    re: /\b((?:xox[bpsao]|xapp)-[A-Za-z0-9_-]{9,}(?:-[A-Za-z0-9_-]+)*)\b/g,
    group: 1,
  },

  /* ── OpenAI ───────────────────────────────────────────────── */
  {
    id: "openai-key",
    // OpenAI project/service keys: sk-proj-... or sk-svcacct-... or legacy sk-...
    // Must NOT match Anthropic (sk-ant-), Stripe (sk_live_/sk_test_)
    // Use negative lookahead to exclude known other patterns
    re: /\b(sk-(?!ant-)(?!live_)(?!test_)[A-Za-z0-9\-_]{48,})\b/g,
    group: 1,
  },

  /* ── Hugging Face ─────────────────────────────────────────── */
  {
    id: "huggingface-token",
    re: /\b(hf_[A-Za-z0-9]{34,})\b/g,
    group: 1,
  },

  /* ── Replicate ────────────────────────────────────────────── */
  {
    id: "replicate-token",
    re: /\b(r8_[A-Za-z0-9]{37,})\b/g,
    group: 1,
  },

  /* ── Stripe publishable ───────────────────────────────────── */
  {
    id: "stripe-pub",
    re: /\b(pk_(?:live|test)_[0-9a-zA-Z]{24,})\b/g,
    group: 1,
  },

  /* ── Stripe webhook signing secret ───────────────────────── */
  {
    id: "stripe-webhook",
    re: /\b(whsec_[A-Za-z0-9+/=]{32,})\b/g,
    group: 1,
  },

  /* ── Twilio Account SID ───────────────────────────────────── */
  {
    id: "twilio-account-sid",
    // AC + 32 lowercase hex characters
    re: /\b(AC[a-f0-9]{32})\b/g,
    group: 1,
  },

  /* ── SendGrid ─────────────────────────────────────────────── */
  {
    id: "sendgrid-key",
    // SG. + 20-char base64url + . + 43-char base64url
    re: /\b(SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{43,})\b/g,
    group: 1,
  },

  /* ── npm access token ─────────────────────────────────────── */
  {
    id: "npm-token",
    // New-format npm tokens (created since 2021)
    re: /\b(npm_[A-Za-z0-9]{36})\b/g,
    group: 1,
  },

  /* ── Azure Storage connection string ─────────────────────── */
  {
    id: "azure-conn-string",
    // Match the AccountKey= segment — 88-char base64
    re: /AccountKey=([A-Za-z0-9+/]{86,88}={0,2})/g,
    group: 1,
  },

  /* ── Discord bot token ────────────────────────────────────── */
  {
    id: "discord-token",
    // Bot token format: base64(id).base64(timestamp).HMAC — three dot-separated parts
    // Part 1: ~24 chars (base64 encoded snowflake)
    // Part 2: ~6-7 chars (timestamp)
    // Part 3: ~27 chars (HMAC)
    re: /\b([A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,28})\b/g,
    group: 1,
    // Require keyword context — format overlaps with some JWT payloads
    minConf: 0.5, // > baseline, so at least one keyword required
  },
];

/* ── Build and export ────────────────────────────────────────── */

export const cloudKeyDetectors: Detector[] = ENTRIES.map(makeCloudKeyDetector);

export const slackTokenDetector      = cloudKeyDetectors[0]!;
export const openAiKeyDetector       = cloudKeyDetectors[1]!;
export const huggingfaceTokenDetector = cloudKeyDetectors[2]!;
export const replicateTokenDetector  = cloudKeyDetectors[3]!;
export const stripePubDetector       = cloudKeyDetectors[4]!;
export const stripeWebhookDetector   = cloudKeyDetectors[5]!;
export const twilioAccountSidDetector = cloudKeyDetectors[6]!;
export const sendgridKeyDetector     = cloudKeyDetectors[7]!;
export const npmTokenDetector        = cloudKeyDetectors[8]!;
export const azureConnStringDetector = cloudKeyDetectors[9]!;
export const discordTokenDetector    = cloudKeyDetectors[10]!;
