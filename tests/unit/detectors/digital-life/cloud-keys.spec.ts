/**
 * T038/T039 — Per-vendor cloud key detector unit tests.
 *
 * Covers the 11 GA-tier detectors in src/detectors/digital-life/cloud-keys.ts:
 *   • slack-token, openai-key, huggingface-token, replicate-token
 *   • stripe-pub, stripe-webhook, twilio-account-sid
 *   • sendgrid-key, npm-token, azure-conn-string, discord-token
 *
 * Test vectors use synthetic keys that match the regex but are not real secrets.
 */
import { describe, it, expect } from "vitest";
import type { DetectorContext } from "~/detectors/types";
import {
  cloudKeyDetectors,
  slackTokenDetector,
  openAiKeyDetector,
  huggingfaceTokenDetector,
  replicateTokenDetector,
  stripePubDetector,
  stripeWebhookDetector,
  twilioAccountSidDetector,
  sendgridKeyDetector,
  npmTokenDetector,
  azureConnStringDetector,
  discordTokenDetector,
} from "~/detectors/digital-life/cloud-keys";

/* ── Helpers ──────────────────────────────────────────────────── */

function ctx(text: string): DetectorContext {
  return { locale: "en", text, activeCustomRules: [], clock: Date };
}

/* ════════════════════════════════════════════════════════════════ */
/* Barrel                                                          */
/* ════════════════════════════════════════════════════════════════ */

describe("cloudKeyDetectors barrel", () => {
  it("exports 11 detectors", () => {
    expect(cloudKeyDetectors).toHaveLength(11);
  });

  it("all have shipTier ga", () => {
    for (const d of cloudKeyDetectors) {
      expect(d.shipTier, `${d.id} shipTier`).toBe("ga");
    }
  });

  it("all have categoryId myDigitalLife", () => {
    for (const d of cloudKeyDetectors) {
      expect(d.categoryId, `${d.id} categoryId`).toBe("myDigitalLife");
    }
  });

  it("all IDs are unique", () => {
    const ids = cloudKeyDetectors.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* Slack token                                                     */
/* ════════════════════════════════════════════════════════════════ */

describe("slack-token detector", () => {
  it("has correct shape", () => {
    expect(slackTokenDetector.id).toBe("slack-token");
    expect(slackTokenDetector.categoryId).toBe("myDigitalLife");
    expect(slackTokenDetector.shipTier).toBe("ga");
  });

  // Split across concatenation so GitHub secret-scanning doesn't flag these
  // test vectors as live credentials — they are synthetic, never-issued tokens.
  const BOT_TOKEN  = "xoxb-" + "123456789012-123456789012-abcdefghijklmnop";
  const USER_TOKEN = "xoxp-" + "123456789012-123456789012-123456789012-abcdef1234";
  const APP_TOKEN  = "xapp-" + "1-AAAAAAAAAA-1234567890123-abcdef1234567890abcdef";

  it("detects xoxb- bot token", () => {
    const findings = slackTokenDetector.scan(ctx(`SLACK_BOT_TOKEN="${BOT_TOKEN}"`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("slack-token");
  });

  it("detects xoxp- user token", () => {
    const findings = slackTokenDetector.scan(ctx(`token: ${USER_TOKEN}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("detects xapp- app-level token", () => {
    const findings = slackTokenDetector.scan(ctx(APP_TOKEN));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT match plain xox without proper format", () => {
    const findings = slackTokenDetector.scan(ctx("xox-short"));
    expect(findings.length).toBe(0);
  });

  it("finding has correct severity", () => {
    const [f] = slackTokenDetector.scan(ctx(BOT_TOKEN));
    expect(f!.severity).toBe("critical");
    expect(f!.contextSnippet).toContain("•••");
  });

  it("is deterministic", () => {
    const c = ctx(BOT_TOKEN);
    expect(slackTokenDetector.scan(c)).toEqual(slackTokenDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* OpenAI key                                                      */
/* ════════════════════════════════════════════════════════════════ */

describe("openai-key detector", () => {
  it("has correct shape", () => {
    expect(openAiKeyDetector.id).toBe("openai-key");
    expect(openAiKeyDetector.categoryId).toBe("myDigitalLife");
  });

  // 51 chars total: sk- (3) + 48 alphanumeric
  const OPENAI_KEY = "sk-" + "A".repeat(48);

  it("detects OpenAI key", () => {
    const findings = openAiKeyDetector.scan(ctx(`OPENAI_API_KEY=${OPENAI_KEY}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("openai-key");
  });

  it("does NOT detect Anthropic key (sk-ant- prefix)", () => {
    const anthropicKey = "sk-ant-" + "A".repeat(80);
    const findings = openAiKeyDetector.scan(ctx(anthropicKey));
    expect(findings.length).toBe(0);
  });

  it("does NOT match short sk- strings (under 48 chars)", () => {
    const findings = openAiKeyDetector.scan(ctx("sk-shortkey12345"));
    expect(findings.length).toBe(0);
  });

  it("finding has correct shape", () => {
    const [f] = openAiKeyDetector.scan(ctx(OPENAI_KEY));
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.contextSnippet).toContain("•••");
  });

  it("is deterministic", () => {
    const c = ctx(OPENAI_KEY);
    expect(openAiKeyDetector.scan(c)).toEqual(openAiKeyDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* HuggingFace token                                               */
/* ════════════════════════════════════════════════════════════════ */

describe("huggingface-token detector", () => {
  it("has correct shape", () => {
    expect(huggingfaceTokenDetector.id).toBe("huggingface-token");
    expect(huggingfaceTokenDetector.categoryId).toBe("myDigitalLife");
  });

  const HF_TOKEN = "hf_" + "a".repeat(34);

  it("detects HuggingFace token", () => {
    const findings = huggingfaceTokenDetector.scan(ctx(`HF_TOKEN=${HF_TOKEN}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("huggingface-token");
  });

  it("detects HF token in plain text", () => {
    const findings = huggingfaceTokenDetector.scan(ctx(HF_TOKEN));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT match short hf_ strings", () => {
    const findings = huggingfaceTokenDetector.scan(ctx("hf_short"));
    expect(findings.length).toBe(0);
  });

  it("match positions are correct", () => {
    const text = `token: ${HF_TOKEN} end`;
    const [f] = huggingfaceTokenDetector.scan(ctx(text));
    expect(f).toBeDefined();
    expect(text.slice(f!.match.start, f!.match.end)).toBe(HF_TOKEN);
  });

  it("is deterministic", () => {
    const c = ctx(HF_TOKEN);
    expect(huggingfaceTokenDetector.scan(c)).toEqual(huggingfaceTokenDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* Replicate token                                                 */
/* ════════════════════════════════════════════════════════════════ */

describe("replicate-token detector", () => {
  it("has correct shape", () => {
    expect(replicateTokenDetector.id).toBe("replicate-token");
  });

  const R8_TOKEN = "r8_" + "a".repeat(37);

  it("detects Replicate token", () => {
    const findings = replicateTokenDetector.scan(ctx(`REPLICATE_API_TOKEN=${R8_TOKEN}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("replicate-token");
  });

  it("does NOT match short r8_ strings", () => {
    const findings = replicateTokenDetector.scan(ctx("r8_short"));
    expect(findings.length).toBe(0);
  });

  it("is deterministic", () => {
    const c = ctx(R8_TOKEN);
    expect(replicateTokenDetector.scan(c)).toEqual(replicateTokenDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* Stripe publishable key                                          */
/* ════════════════════════════════════════════════════════════════ */

describe("stripe-pub detector", () => {
  it("has correct shape", () => {
    expect(stripePubDetector.id).toBe("stripe-pub");
  });

  const PK_LIVE = "pk_live_" + "a".repeat(24);
  const PK_TEST = "pk_test_" + "b".repeat(24);

  it("detects pk_live_ publishable key", () => {
    const findings = stripePubDetector.scan(ctx(`STRIPE_PK=${PK_LIVE}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("stripe-pub");
  });

  it("detects pk_test_ publishable key", () => {
    const findings = stripePubDetector.scan(ctx(PK_TEST));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT match sk_ keys (those are stripe-secret in api-key.ts)", () => {
    const findings = stripePubDetector.scan(ctx("sk_live_" + "a".repeat(24)));
    expect(findings.length).toBe(0);
  });

  it("is deterministic", () => {
    const c = ctx(PK_LIVE);
    expect(stripePubDetector.scan(c)).toEqual(stripePubDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* Stripe webhook signing secret                                   */
/* ════════════════════════════════════════════════════════════════ */

describe("stripe-webhook detector", () => {
  it("has correct shape", () => {
    expect(stripeWebhookDetector.id).toBe("stripe-webhook");
  });

  const WHSEC = "whsec_" + "a".repeat(32);

  it("detects whsec_ webhook secret", () => {
    const findings = stripeWebhookDetector.scan(ctx(`STRIPE_WEBHOOK_SECRET=${WHSEC}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("stripe-webhook");
  });

  it("does NOT match short whsec_ strings", () => {
    const findings = stripeWebhookDetector.scan(ctx("whsec_short"));
    expect(findings.length).toBe(0);
  });

  it("is deterministic", () => {
    const c = ctx(WHSEC);
    expect(stripeWebhookDetector.scan(c)).toEqual(stripeWebhookDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* Twilio Account SID                                              */
/* ════════════════════════════════════════════════════════════════ */

describe("twilio-account-sid detector", () => {
  it("has correct shape", () => {
    expect(twilioAccountSidDetector.id).toBe("twilio-account-sid");
  });

  // AC + 32 lowercase hex
  const TWILIO_SID = "AC" + "a".repeat(32);

  it("detects Twilio Account SID", () => {
    const findings = twilioAccountSidDetector.scan(ctx(`TWILIO_ACCOUNT_SID=${TWILIO_SID}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("twilio-account-sid");
  });

  it("detects SID in bare text", () => {
    const findings = twilioAccountSidDetector.scan(ctx(TWILIO_SID));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT match AC followed by uppercase", () => {
    // The regex requires lowercase hex after AC
    const findings = twilioAccountSidDetector.scan(ctx("AC" + "G".repeat(32)));
    expect(findings.length).toBe(0);
  });

  it("does NOT match short AC strings", () => {
    const findings = twilioAccountSidDetector.scan(ctx("ACabc123"));
    expect(findings.length).toBe(0);
  });

  it("is deterministic", () => {
    const c = ctx(TWILIO_SID);
    expect(twilioAccountSidDetector.scan(c)).toEqual(twilioAccountSidDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* SendGrid key                                                    */
/* ════════════════════════════════════════════════════════════════ */

describe("sendgrid-key detector", () => {
  it("has correct shape", () => {
    expect(sendgridKeyDetector.id).toBe("sendgrid-key");
  });

  // SG. + 22 chars + . + 43 chars
  const SG_KEY = "SG." + "a".repeat(22) + "." + "b".repeat(43);

  it("detects SendGrid API key", () => {
    const findings = sendgridKeyDetector.scan(ctx(`SENDGRID_API_KEY=${SG_KEY}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("sendgrid-key");
  });

  it("detects key in bare text", () => {
    const findings = sendgridKeyDetector.scan(ctx(SG_KEY));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT match plain SG. without proper length", () => {
    const findings = sendgridKeyDetector.scan(ctx("SG.short.ab"));
    expect(findings.length).toBe(0);
  });

  it("is deterministic", () => {
    const c = ctx(SG_KEY);
    expect(sendgridKeyDetector.scan(c)).toEqual(sendgridKeyDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* npm access token                                                */
/* ════════════════════════════════════════════════════════════════ */

describe("npm-token detector", () => {
  it("has correct shape", () => {
    expect(npmTokenDetector.id).toBe("npm-token");
  });

  const NPM_TOKEN = "npm_" + "A".repeat(36);

  it("detects npm access token", () => {
    const findings = npmTokenDetector.scan(ctx(`NPM_TOKEN=${NPM_TOKEN}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("npm-token");
  });

  it("detects token in .npmrc context", () => {
    const findings = npmTokenDetector.scan(ctx(`//registry.npmjs.org/:_authToken=${NPM_TOKEN}`));
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT match wrong length npm_", () => {
    // npm_ + 35 chars (one short)
    const findings = npmTokenDetector.scan(ctx("npm_" + "A".repeat(35)));
    expect(findings.length).toBe(0);
  });

  it("does NOT match npm_ + 37+ chars (too long)", () => {
    // Exact 36 chars required
    const findings = npmTokenDetector.scan(ctx("npm_" + "A".repeat(37)));
    // This would not match because the \b word boundary after 37 chars makes it 37-char run
    // Actually it WOULD match the first 36 chars if the 37th is non-word or boundary...
    // The regex is npm_[A-Za-z0-9]{36} which is greedy exact: must be followed by a word boundary
    // Since \b fails between two word chars, "npm_" + "A"*37 would NOT match (no \b after 36)
    // because the char at position 37 is still [A-Za-z0-9]
    expect(findings.length).toBe(0);
  });

  it("is deterministic", () => {
    const c = ctx(NPM_TOKEN);
    expect(npmTokenDetector.scan(c)).toEqual(npmTokenDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* Azure storage connection string                                 */
/* ════════════════════════════════════════════════════════════════ */

describe("azure-conn-string detector", () => {
  it("has correct shape", () => {
    expect(azureConnStringDetector.id).toBe("azure-conn-string");
  });

  // 88-char base64 (86 chars + ==)
  const ACCOUNT_KEY = "a".repeat(86) + "==";
  const CONN_STRING = `DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=${ACCOUNT_KEY};EndpointSuffix=core.windows.net`;

  it("detects Azure connection string AccountKey", () => {
    const findings = azureConnStringDetector.scan(ctx(CONN_STRING));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("azure-conn-string");
  });

  it("match value contains the key (not the full connection string)", () => {
    const [f] = azureConnStringDetector.scan(ctx(CONN_STRING));
    expect(f!.match.value).toBe(ACCOUNT_KEY);
  });

  it("does NOT match AccountKey= with short value", () => {
    const findings = azureConnStringDetector.scan(ctx("AccountKey=shortvalue=="));
    expect(findings.length).toBe(0);
  });

  it("is deterministic", () => {
    const c = ctx(CONN_STRING);
    expect(azureConnStringDetector.scan(c)).toEqual(azureConnStringDetector.scan(c));
  });
});

/* ════════════════════════════════════════════════════════════════ */
/* Discord bot token                                               */
/* ════════════════════════════════════════════════════════════════ */

describe("discord-token detector", () => {
  it("has correct shape", () => {
    expect(discordTokenDetector.id).toBe("discord-token");
  });

  // Three-part base64url format matching [23-28].[6-7].[27-28]
  // Part 1 (24 chars): base64-encoded snowflake ID
  // Part 2 (6 chars): timestamp portion
  // Part 3 (27 chars): HMAC/signature portion
  // Concatenated so GitHub secret-scanning doesn't flag this synthetic test vector.
  const DISCORD_TOKEN = "ODcyMzc3ODI2NjI2MTE5NzQ2" + ".YWi17A." + "KEt8f5RBYJ9FLrMSNKfMn0Z8o5Q";

  it("detects Discord bot token with keyword context", () => {
    const findings = discordTokenDetector.scan(ctx(`discord token: ${DISCORD_TOKEN}`));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.detectorId).toBe("discord-token");
  });

  it("does NOT fire without keyword context (minConf gate)", () => {
    // Discord token has minConf = 0.5 (requires at least one keyword, baseline = 0.5)
    const findings = discordTokenDetector.scan(ctx(DISCORD_TOKEN));
    expect(findings.length).toBe(0);
  });

  it("is deterministic", () => {
    const c = ctx(`discord bot ${DISCORD_TOKEN}`);
    expect(discordTokenDetector.scan(c)).toEqual(discordTokenDetector.scan(c));
  });

  it("does not mutate context", () => {
    const c = ctx(`discord token: ${DISCORD_TOKEN}`);
    const before = JSON.stringify(c);
    discordTokenDetector.scan(c);
    expect(JSON.stringify(c)).toBe(before);
  });
});
