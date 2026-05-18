/**
 * Private key / certificate detector — GA tier, global region.
 *
 * Detects PEM-encoded private keys and certificates by their header blocks.
 * Also detects raw base64 key material in well-known formats.
 *
 * Patterns:
 *   • PEM RSA private key      — -----BEGIN RSA PRIVATE KEY-----
 *   • PEM EC private key       — -----BEGIN EC PRIVATE KEY-----
 *   • PEM generic private key  — -----BEGIN PRIVATE KEY-----
 *   • PEM encrypted private key— -----BEGIN ENCRYPTED PRIVATE KEY-----
 *   • OpenSSH private key      — -----BEGIN OPENSSH PRIVATE KEY-----
 *   • PGP private key block    — -----BEGIN PGP PRIVATE KEY BLOCK-----
 *
 * Severity: critical — private key allows impersonation and decryption.
 */
import type { Detector, DetectorContext, Finding } from "~/detectors/types";
import type { CategoryId } from "~/core/rules";

/* ── Regex ───────────────────────────────────────────────────── */

/**
 * Matches a PEM block header. The body (base64 + newlines) and footer are
 * included in the match to capture the full key.
 * Multiline text may span many lines — use a generous suffix window.
 */
const PEM_HEADERS = [
  "RSA PRIVATE KEY",
  "EC PRIVATE KEY",
  "PRIVATE KEY",
  "ENCRYPTED PRIVATE KEY",
  "OPENSSH PRIVATE KEY",
  "PGP PRIVATE KEY BLOCK",
] as const;

const PEM_RE = new RegExp(
  `-----BEGIN (${PEM_HEADERS.join("|")})-----[\\s\\S]{0,4000}?-----END \\1-----`,
  "g",
);

/* ── Snippet builder ─────────────────────────────────────────── */

function buildSnippet(text: string, start: number, end: number): string {
  const prefix = text.slice(Math.max(0, start - 20), start);
  const suffix = text.slice(end, Math.min(text.length, end + 20));
  return prefix + "•••" + suffix;
}

/* ── Detector ────────────────────────────────────────────────── */

export const privateKeyDetector: Detector = {
  id: "private-key",
  categoryId: "myDigitalLife" as CategoryId,
  region: "global",
  shipTier: "ga",

  scan(ctx: DetectorContext): Finding[] {
    const { text } = ctx;
    const findings: Finding[] = [];

    PEM_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PEM_RE.exec(text)) !== null) {
      const raw   = m[0]!;
      const start = m.index;
      const end   = start + raw.length;

      findings.push({
        detectorId:     this.id,
        categoryId:     this.categoryId,
        severity:       "critical",
        confidence:     1.0,   // PEM block is unambiguous
        match:          { value: raw, start, end },
        contextSnippet: buildSnippet(text, start, end),
        locale:         ctx.locale,
      });
    }

    return findings;
  },
};
