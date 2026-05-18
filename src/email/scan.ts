/**
 * Email scan — T034.
 *
 * Assembles a plain-text representation of the email fields and runs
 * the ScanEngine over it. Reuses `ScanEngine.scanText` and `parseFile`
 * so all detector + parser logic is in a single place.
 *
 * Privacy:
 *   - Results are passed to the caller; nothing is persisted here.
 *   - Raw field values are not included in any Finding (only contextSnippets).
 */
import { scanText } from "~/core/scan-engine";
import { loadRules, rulesState } from "~/core/rules";
import { getCurrentLocale } from "~/core/i18n";
import type { Finding } from "~/detectors/types";

/* ── Input type ─────────────────────────────────────────────────── */

export type EmailScanInput = {
  /** Email subject line. */
  subject: string;
  /** Plain-text body (HTML tags must be stripped by caller). */
  body: string;
  /** List of recipient email addresses. */
  recipients: string[];
  /** Optional: plain-text names of attached files (not file contents). */
  attachmentNames?: string[];
};

export type EmailScanResult = {
  findings: Finding[];
  /** Number of characters scanned (subject + body + recipients joined). */
  charCount: number;
  durationMs: number;
};

/* ── Helpers ────────────────────────────────────────────────────── */

/**
 * Strip HTML tags from a string — best-effort, not a full parser.
 * Caller should pass already-stripped plain text; this is a safety backstop.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Assemble all email fields into a single text blob for scanning.
 * Sections are labelled so detectors get useful context windows.
 */
export function buildScanText(input: EmailScanInput): string {
  const parts: string[] = [];

  if (input.subject.trim()) {
    parts.push(`Subject: ${input.subject}`);
  }

  if (input.recipients.length > 0) {
    parts.push(`Recipients: ${input.recipients.join(", ")}`);
  }

  if (input.body.trim()) {
    parts.push(`Body:\n${stripHtml(input.body)}`);
  }

  if (input.attachmentNames && input.attachmentNames.length > 0) {
    parts.push(`Attachments: ${input.attachmentNames.join(", ")}`);
  }

  return parts.join("\n\n");
}

/* ── Scanner ────────────────────────────────────────────────────── */

/**
 * Scan an email for PII findings.
 *
 * Loads current Rules from storage (cached) and delegates to ScanEngine.
 * The scan runs synchronously over assembled plain text — no network calls.
 */
export async function scanEmail(input: EmailScanInput): Promise<EmailScanResult> {
  const t0 = Date.now();

  const text = buildScanText(input);

  // Ensure rules are loaded before scanning
  await loadRules();
  const locale = getCurrentLocale();

  const result = await scanText(text, rulesState.value, {
    locale,
    module: "email-guardian",
  });

  return {
    findings:   result.findings,
    charCount:  text.length,
    durationMs: Date.now() - t0,
  };
}
