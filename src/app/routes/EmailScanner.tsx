/**
 * Email Scanner route — paste raw email text or upload an .eml file.
 *
 * Post-pivot 2026-05-17 — replaces the extension's Gmail compose intercept.
 * Trust posture: same as Document Check. Only what the user pastes / uploads
 * is scanned. No mailbox API access at v1.0.
 */
import { signal } from "@preact/signals";
import { scanText } from "~/core/scan-engine";
import { loadRules, rulesState } from "~/core/rules";
import { getCurrentLocale } from "~/core/i18n";
import type { Finding } from "~/detectors/types";
import FindingsList from "../components/FindingsList";

type Status =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "done"; findings: Finding[]; score: number; subject?: string }
  | { kind: "error"; message: string };

const status = signal<Status>({ kind: "idle" });
const inputText = signal<string>("");

async function scan() {
  status.value = { kind: "scanning" };
  try {
    await loadRules();
    const parsed = parseEmail(inputText.value);
        const result = await scanText(
      `${parsed.subject ?? ""}

${parsed.body}`,
      rulesState.value,
      { locale: getCurrentLocale() },
    );
    status.value = {
      kind: "done",
      findings: result.findings,
      score: result.score,
      ...(parsed.subject !== undefined ? { subject: parsed.subject } : {}),
    };
  } catch (err) {
    status.value = {
      kind: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Minimal .eml / pasted-email parser.
 * Splits headers from body at first blank line; extracts Subject if present.
 */
function parseEmail(raw: string): { subject?: string; body: string } {
  const blankLine = raw.search(/\r?\n\r?\n/);
  if (blankLine === -1) return { body: raw };
  const headerBlock = raw.slice(0, blankLine);
  const body = raw.slice(blankLine).replace(/^\r?\n\r?\n/, "");
  const subjectMatch = headerBlock.match(/^Subject:\s*(.+?)$/im);
  return subjectMatch && subjectMatch[1]
    ? { subject: subjectMatch[1].trim(), body }
    : { body };
}

function onFile(e: Event) {
  const input = e.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    inputText.value = typeof reader.result === "string" ? reader.result : "";
  };
  reader.readAsText(file);
}

export default function EmailScanner() {
  const s = status.value;
  return (
    <section class="route route-email">
      <header>
        <h1>Email Scanner</h1>
        <p>Paste an email or upload a <code>.eml</code> file. Scanning happens on your device.</p>
      </header>
      <label>
        <span class="sr-only">Email contents</span>
        <textarea
          aria-label="Paste email text here"
          placeholder="Paste full email text (headers and body)…"
          rows={12}
          value={inputText.value}
          onInput={(e) => (inputText.value = (e.currentTarget as HTMLTextAreaElement).value)}
        />
      </label>
      <div class="route-email__actions">
        <input
          type="file"
          accept=".eml,message/rfc822,text/plain"
          onChange={onFile}
          aria-label="Upload .eml file"
        />
        <button onClick={scan} disabled={!inputText.value.trim() || s.kind === "scanning"}>
          {s.kind === "scanning" ? "Scanning…" : "Scan"}
        </button>
      </div>
      {s.kind === "done" && (
        <section aria-live="polite">
          {s.subject && (
            <p>
              <strong>Subject:</strong> {s.subject}
            </p>
          )}
          <FindingsList findings={s.findings} />
        </section>
      )}
      {s.kind === "error" && <p role="alert">Could not scan: {s.message}</p>}
    </section>
  );
}
