# Privacy Review Checklist — ShieldMe MVP

**Scope:** PR-level privacy review gate and compliance reference. Every PR that touches a data-handling code path, storage schema, telemetry, permission, or consent mechanism must evaluate every applicable item before merge.
**Version:** 1.0 · **Updated:** 2026-05-16
**Authorities:** Constitution §I/II/III/IX/XII/XIII · `spec.md` · `data-model.md` · `threat-model.md` · `docs/engineering-qa.md` (Q6) · GDPR Arts. 5–13, 15, 17, 25 · CCPA/CPRA · Google API Services User Data Policy (Limited Use)

---

## How to use this checklist

1. Scan your diff. Identify which **sections** (P1–P9) your change touches.
2. For each applicable item, mark one of:
   - `[x]` — confirmed green
   - `[-]` — not applicable (add a one-line reason in the PR comment)
   - `[!]` — violation found — **blocks merge**
3. Paste the relevant section(s) into your PR description.
4. The **Compliance Sign-off** table at the bottom applies to every PR that modifies storage schemas, telemetry, permissions, OAuth scopes, the privacy policy, or the data-deletion flow; the reviewer checks the row, not the author.

Items marked *(M6+)* or *(v1.5+)* apply only from that phase onward.

---

## P1 — Data Minimisation & Storage Limitation

> GDPR Art. 5(1)(b) purpose limitation · 5(1)(c) data minimisation · 5(1)(e) storage limitation.
> Core principle: no user data lives in our systems. All data lives in the user's own browser storage. Findings and matched values are never written to disk.

- [ ] **P1-1.** Scan findings (matched strings, `contextSnippet`, `match.value`) are **never persisted** to any storage layer (chrome.storage, IndexedDB, or any export that leaves the device at scan time). Only the summary (`criticalCount`, `warningCount`, `score`) is written to `scanHistory`.
  - *Constitution:* §I — "all scanning client-side; zero upload of raw content"
  - *Data model:* §6 — `ScanHistoryEntry.findingsSummary` is the maximum permitted write; `detectorRunIds[]` are opaque internal IDs, never matched values
  - *Threat model:* Asset "Detected findings (matched values)" — "RAM only, never persisted"
  - *Verification:* Code review. `grep -r "finding\.match\|contextSnippet" src/ | grep -v "\.spec\."` — any result that flows into a `LocalStore.set()` or `idb` write call blocks merge.

- [ ] **P1-2.** The breach-check cache stores a salted hash (`emailSalt`), never the plaintext email address.
  - *Constitution:* §I — no raw PII leaves the device in identifiable form
  - *Data model:* §9 — `BreachCheckResult.emailSalt?: string`; no `.email` field exists in the schema
  - *Threat model:* A1 (network observer correlating identity) — HIBP k-anonymity + local hash
  - *Verification:* Code review of `src/radar/hibp-emails.ts`. Must not write any field named `email`, `address`, or plaintext identifier to the `breachResults` IDB store.

- [ ] **P1-3.** Drive Audit cache stores only permission metadata and finding counts. It does not store file content, extracted text, or matched values.
  - *Constitution:* §I
  - *Data model:* §7 — `DriveFileCache.contentFindings` is `{ critical, warning, categories[] }` counts only; no string from file content appears in the schema
  - *Verification:* Code review of `src/drive/client.ts`. Any write to the `driveCache` IDB store must not include a `string`-typed field that originated from file content or a scan result.

- [ ] **P1-4.** Usage meter (`usage`) stores only coarse monthly aggregates (`scansThisMonth`, `monthKey`, `resetAt`). No per-scan timestamps beyond `lastScanAt`.
  - *Data model:* §4 — `Usage` schema; this is the complete schema, no additions permitted without a data-model amendment
  - *Verification:* Code review. Writes to the `usage` chrome.storage key must match the declared schema exactly.

- [ ] **P1-5.** Scan history does not accumulate indefinitely. If a retention limit is implemented (e.g., retain last 90 entries), the policy is documented in `data-model.md §6` before the PR lands. Until a policy is defined, this item is `[-]`.
  - *Constitution:* §II — user sovereignty; stale history is a liability, not an asset
  - *Verification:* *(Mark `[-]` with "no retention policy yet defined" until `data-model.md §6` is updated.)*

---

## P2 — Lawful Basis & Consent

> GDPR Art. 6 (lawful basis) · Art. 7 (conditions for consent) · Art. 9 (special categories).
> ShieldMe's lawful basis is **explicit user consent** (Art. 6(1)(a)) exercised through in-product actions. Special-category data (health, finance) is matched locally only on user initiation.

- [ ] **P2-1.** Every scan is initiated by an explicit user action (file drop, Send click, "Scan" button press, "Audit Drive" button press). No background scan runs without the user's knowledge and without the relevant notification preference enabled.
  - *Constitution:* §II — user sovereignty; §I — "zero upload of raw content"
  - *Spec:* FR-D1 (user-initiated document scan); FR-E1 (Email Guardian on Send only); FR-A1 (Drive Audit user-initiated)
  - *Threat model:* R-CRIT-5 — compose body read only at Send-click, never proactively
  - *Verification:* Code review of `src/content/email-guardian.ts`. No `MutationObserver`, `setInterval`, or `input`/`keyup` listener may read the compose body.

- [ ] **P2-2.** Analytics (`Prefs.analyticsOptedIn`) defaults to `false`. Telemetry is never enqueued or flushed unless this flag is explicitly `true`.
  - *Constitution:* §II — "no dark patterns; default-off telemetry"
  - *Data model:* §1 `Prefs.analyticsOptedIn: boolean` default `false`; §12 `telemetryQueue` flushed only when opted in
  - *Verification:* Unit test `tests/unit/core/telemetry.spec.ts` — calling enqueue with `analyticsOptedIn = false` must not result in any network request. `pnpm test`.

- [ ] **P2-3.** The onboarding analytics opt-in is presented as an affirmative checkbox that is **unchecked by default**. No pre-ticked box; no dark-pattern framing (e.g., "Opt out of sharing" is forbidden; "Help us improve ShieldMe" with an unchecked box is acceptable).
  - *Constitution:* §II — no dark patterns
  - *Spec:* GDPR Art. 7(2) — consent must be as easy to withdraw as to give; Art. 7(3) — withdrawal must not be conditional
  - *Verification:* `tests/acceptance/onboarding.spec.ts` asserts the analytics checkbox renders with `checked=false` and that clicking it toggles `Prefs.analyticsOptedIn`.

- [ ] **P2-4.** No special-category personal data (GDPR Art. 9 — health, biometric, genetic, financial) is transmitted to any external service. Patterns for these categories run fully client-side.
  - *Constitution:* §I — "all scanning client-side"
  - *Spec:* FR-D7 (all document scanning client-side); FR-E6 (no email content leaves device)
  - *Verification:* `node scripts/check-egress-allowlist.mjs` — no host in the allowlist receives matched text. Code review: `scanText()` results must not appear in any `fetch()` body or URL parameter.

---

## P3 — Transparency & Notice

> GDPR Art. 13 (information provided at collection) · Art. 14 · Google API Services User Data Policy (Limited Use).

- [ ] **P3-1.** The published privacy policy (`docs/legal/privacy-policy.md`) names every `permission` and `optional_host_permission` declared in `src/manifest.ts`, explains each in plain language, and is updated in the same PR whenever a permission is added or removed.
  - *Constitution:* §III — least-privilege; every permission must be justified
  - *Engineering-QA:* Q6 — "privacy policy names Drive scopes explicitly"
  - *Verification:* Diff `src/manifest.ts` against `docs/legal/privacy-policy.md`. Every key in `permissions[]`, `host_permissions[]`, and `optional_host_permissions[]` must appear by name in the privacy policy. Block merge if any permission has no corresponding privacy-policy entry.

- [ ] **P3-2.** The Google OAuth Limited Use disclosure (`docs/legal/limited-use.md`) is updated whenever a Google API scope is added, changed, or removed. The disclosure must be linked from the Options page footer and the Chrome Web Store listing description.
  - *Engineering-QA:* Q6 — "Limited Use disclosure mandatory for Drive scopes"
  - *Verification:* Any change to `scopes` in `src/drive/client.ts` or `src/radar/ownership.ts` requires a corresponding update to `docs/legal/limited-use.md`. `grep -r "limited-use" src/options/` — must return a visible link.

- [ ] **P3-3.** The privacy policy discloses the HIBP k-anonymity scheme in plain language: only the first 5 characters of a SHA-1 hash of the password are transmitted; the full hash or the original password never leave the device.
  - *Threat model:* R-HIGH-3 — "Documented; users informed in copy"
  - *Verification:* `grep -i "5 char\|k-anon\|first.*hash" docs/legal/privacy-policy.md` — must return a match.

- [ ] **P3-4.** The privacy policy describes telemetry payloads accurately: "coarse usage events (e.g., feature name, rounded scan duration) — no file names, email addresses, or matched text are ever included." The description must be consistent with the actual `TelemetryEvent.payload` schema in `data-model.md §12`.
  - *Data model:* §12
  - *Threat model:* R-HIGH-7
  - *Verification:* Manual review — privacy policy description must match the enqueue-time schema validator allowlist (see P8).

---

## P4 — Right of Access & Portability

> GDPR Art. 15 (right of access) · Art. 20 (data portability).

- [ ] **P4-1.** The Privacy Toolkit provides a "Download my data" action (Basic+ tier) that exports all user-generated state to a JSON file: `prefs`, `rules`, `usage` summary, `scanHistory` summaries, `brokers`, and `accounts` labels. The export **must not** include wrapping keys, access tokens, refresh tokens, or any derived cryptographic material.
  - *Constitution:* §II — users can export their data at any time
  - *Spec:* FR-Tk1 (data export generator)
  - *Data model:* §5 (`EncryptedKey`) and §12b (`AccountTokens`) are excluded from export by definition
  - *Verification:* Code review of the export function. Assert the output schema contains no field named `wrappingKey`, `accessToken`, `refreshToken`, `ciphertext`, `iv`, or `encryptedBlob`.

- [ ] **P4-2.** The data export is UTF-8 JSON, human-readable, and includes `schemaVersion` and `exportedAt` (ISO-8601 UTC) at the root level so users can understand what they received.
  - *Spec:* FR-Tk1
  - *Verification:* Unit test asserts `typeof result.exportedAt === "string"` and `typeof result.schemaVersion === "number"`.

---

## P5 — Right to Erasure

> GDPR Art. 17 (right to erasure / "right to be forgotten").

- [ ] **P5-1.** "Delete all my data" is reachable in **≤2 clicks** from the extension popup. The path must be documented in the Settings UI and discoverable without consulting external documentation.
  - *Constitution:* §II — "Delete all my data in ≤2 clicks"
  - *Verification:* Playwright acceptance test `tests/acceptance/erasure.spec.ts` navigates from popup root to the deletion confirmation screen in ≤2 user interactions.

- [ ] **P5-2.** The deletion action wipes **all** of the following in a single atomic operation (per `data-model.md §15`):
  - All `chrome.storage.local` keys: `accounts`, `rules`, `presetSnapshot`, `prefs`, `tier`, `usage`, `keys`, `brokers`, `score`, `driveMeta`, `gmailSelectors`, and all `tokens.${accountId}` keys
  - All IndexedDB stores: `scanHistory`, `driveCache`, `breachResults`, `telemetryQueue`
  - Caches API entries (tessdata blobs)
  - All optional permissions via `chrome.permissions.remove()`
  - All cached auth tokens via `chrome.identity.clearAllCachedAuthTokens()`
  - Per-account: IDP token revocation (see P5-4) before local deletion
  - *Constitution:* §II; §XIII — "disconnect = wipe"
  - *Data model:* §15
  - *Verification:* Integration test stubs chrome.storage, IndexedDB, and chrome.identity APIs; asserts every wipe call is made. `pnpm test`.

- [ ] **P5-3.** After deletion completes, the extension returns to first-run state: `Prefs.onboardingCompleted = false`, the preset picker is shown, and a visible confirmation screen describes what was deleted.
  - *Constitution:* §II — "visible confirmation"
  - *Verification:* Playwright test asserts the preset picker renders after the deletion flow completes.

- [ ] **P5-4.** IDP token revocation is attempted for every connected account before local tokens are deleted. If revocation fails (e.g., 5xx or network timeout), local tokens are still deleted and the user is shown: *"Revocation may have failed — you can revoke access directly in your [Google Account settings / Microsoft Account settings]"* with a link to the IDP's own revocation page.
  - *Constitution:* §XIII — identity sovereignty
  - *Spec:* FR-A6 (disconnect = wipe)
  - *Verification:* Unit test stubs `oauth2.googleapis.com/revoke` to return 503; asserts local deletion still proceeds and the error message is rendered.

---

## P6 — Privacy by Design & Default

> GDPR Art. 25 (data protection by design and by default).

- [ ] **P6-1.** All scanning (document, email, Drive content) is performed client-side. No scan content, intermediate extracted text, or detected match is sent to any server at any point in the scan pipeline.
  - *Constitution:* §I — "all scanning client-side; zero upload"
  - *Spec:* FR-D7, FR-E6
  - *Engineering-QA:* Q3 — "Why not server-side? Violates Constitution §I."
  - *Verification:* `node scripts/check-egress-allowlist.mjs`. Additionally, a network-intercept Playwright test asserts no `fetch()` or `XMLHttpRequest` is made during a document scan.

- [ ] **P6-2.** Newly added modules and features default to the most privacy-preserving state: analytics off, notifications off, optional permissions not requested until the user enables the feature.
  - *Constitution:* §III — optional permissions granted on-demand; §II — default-off telemetry
  - *Spec:* FR-R1 (notification preferences)
  - *Verification:* Code review. Every new `Prefs` boolean field must have a default of `false`. Every new optional permission must appear in `optional_host_permissions`, not `host_permissions`.

- [ ] **P6-3.** Optional `host_permissions` (mail.google.com, drive.google.com, the HIBP API host) are requested **on-demand** when the user first enables the relevant feature, not at extension install. The extension must function at reduced capability with no optional permission granted.
  - *Constitution:* §III — least-privilege
  - *Engineering-QA:* Q6 — "identity, host permissions requested on-demand, not at install"
  - *Verification:* `src/manifest.ts` — `host_permissions` contains only always-required hosts (if any). Optional hosts appear solely in `optional_host_permissions`. `pnpm build && node scripts/check-egress-allowlist.mjs`.

- [ ] **P6-4.** Drive OAuth scopes are requested incrementally — the minimum scope is requested for each operation:
  - Listing and permission reading → `drive.metadata.readonly`
  - Content reading → `drive.readonly` (requested on first content-scan initiation)
  - Fix actions → `drive` (requested on first fix action; Basic+ only)
  - Scopes are never bundled into a single upfront request.
  - *Constitution:* §III — scope upgrade is a separate user prompt
  - *Threat model:* R-MED-6 — OAuth scope creep
  - *Engineering-QA:* Q6 — "scope upgrade never bundled"
  - *Verification:* Code review of `src/drive/client.ts`. Each `chrome.identity.getAuthToken()` call site passes only the scope required for its immediate operation, no more.

- [ ] **P6-5.** The Email Guardian content script reads the Gmail compose body **only** at Send-click time and holds the result in a local closure for the duration of the scan. It does not read, buffer, observe, or persist the body at any other time.
  - *Constitution:* §I; §XII — memory hygiene control 4
  - *Threat model:* R-CRIT-5
  - *Verification:* Code review of `src/content/email-guardian.ts`. No `MutationObserver`, `setInterval`, or `input`/`keyup` event listener may read or store the compose body.

- [ ] **P6-6.** All cryptographic key material and ULIDs are generated with `crypto.getRandomValues`. `Math.random` is never used outside test helpers.
  - *Constitution:* §IX — "use Web Crypto only"
  - *Threat model:* R-MED-4 — predictable `Math.random` seed
  - *Verification:* `grep -r "Math\.random" src/` — must return zero results. `pnpm lint` catches this via the `no-restricted-syntax` rule on `Math.random`.

---

## P7 — Google OAuth Limited Use

> Google API Services User Data Policy — Limited Use requirements. Applies to every PR that touches `chrome.identity`, Drive API, or Gmail API scope usage.

- [ ] **P7-1.** User data obtained from Google APIs (Drive file metadata, permission lists, Gmail compose content) is used **only** to provide the in-product privacy-protection features directly requested by the user. It is never used for advertising, profiling, or sold or transferred to any third party.
  - *Engineering-QA:* Q6 — "Single purpose: scan the user's own documents, emails, and Drive files to detect exposure of their own personal data."
  - *Verification:* Code review. No Drive API response field (file name, owner email, external-user list) may be passed to `telemetry.enqueue()` or any external `fetch()` body or URL.

- [ ] **P7-2.** `docs/legal/limited-use.md` explicitly states all four Limited Use requirements: (a) Drive/Gmail data is used only to provide the stated service; (b) no human reads user files; (c) data is not shared with third parties; (d) data is not used for any secondary purpose.
  - *Engineering-QA:* Q6 — "Limited Use disclosure mandatory for Drive scopes"
  - *Verification:* Manual review of `docs/legal/limited-use.md` against the four Google Limited Use policy requirements. All four must be present in plain language.

- [ ] **P7-3.** Drive API responses are not logged to `console.log`, telemetry, or any persistent store beyond the `driveCache` schema defined in `data-model.md §7`. File names, owner emails, and external-user email lists in `driveCache` are wiped on "Delete all my data".
  - *Data model:* §7 — `DriveFileCache` is the only permitted Drive data persistence
  - *Threat model:* memory-hygiene control 2; R-HIGH-7
  - *Verification:* ESLint `no-console` rule blocks `console.log` in `src/drive/`. Code review: no Drive API response field is written outside the `driveCache` IDB store schema.

- [ ] **P7-4.** *(M3 gate)* Google OAuth app verification is initiated no later than Month 3. The CASA assessment, privacy policy URL, demo video, and homepage are prepared before submission. OAuth verification running in parallel with extension review is acceptable; **Drive Audit must not ship publicly before verification is approved**.
  - *Engineering-QA:* Q6 — "plan OAuth verification start at Month 3, not Month 5"
  - *Threat model:* R-HIGH-5 — Web Store rejection on `identity` scope
  - *Verification:* Project milestone gate. This item becomes a hard blocker at the M3 release checklist.

---

## P8 — Telemetry Schema Bound

> R-HIGH-7 mitigation. No personal data, matched text, or file-identifying information may appear in any telemetry payload, even when the user has opted in to analytics.

- [ ] **P8-1.** The four permitted `TelemetryEvent.type` values (`feature_used`, `scan_completed`, `tier_gate_hit`, `ocr_performance`) each have a fully specified, locked payload schema in `data-model.md §12`. No field outside that schema may be enqueued; the enqueue-time validator rejects unknown fields.
  - *Data model:* §12 — `TelemetryEvent.payload: Record<string, string | number | boolean>`; coarse buckets only
  - *Threat model:* R-HIGH-7 — "Schema validator at enqueue-time rejects any field outside the allowlist"
  - *Verification:* `tests/unit/core/telemetry.spec.ts` — submit a payload with a field outside the schema allowlist and assert it is rejected synchronously at enqueue time. `pnpm test`.

- [ ] **P8-2.** The following field names are **permanently forbidden** in any telemetry payload regardless of event type: `filename`, `filePath`, `email`, `address`, `match`, `snippet`, `context`, `contextSnippet`, `fileId`, `userId`, `accountId`, `label`, and any field whose value is derived from scan content.
  - *Data model:* §12 — "no file names, no matched strings, no recipient emails, no Drive file IDs"
  - *Threat model:* R-HIGH-7
  - *Verification:* The enqueue-time validator must reject each forbidden field name. Unit test enqueues with each forbidden key and asserts rejection.

- [ ] **P8-3.** `scan_completed` payload contains exactly: `module` (string enum), `durationMs` (rounded to nearest 100 ms), `findingsBucket` (0 / 1–5 / 6–20 / 21+ enum), `scoreRange` (0–25 / 26–50 / 51–75 / 76–100 enum), `fileSizeBucket` (0–1 MB / 1–10 MB / 10+ MB enum), `tier` (string enum). No other fields.
  - *Data model:* §12 — payload schema per event type
  - *Verification:* Unit test enqueues `scan_completed` with exactly these fields and asserts success. Enqueuing with any additional field asserts rejection.

- [ ] **P8-4.** `feature_used` payload contains exactly: `feature` (string from a fixed enum allowlist), `tier` (string enum), `locale` (2-character ISO 639-1 code only — not a full BCP-47 tag). No session IDs, user IDs, timestamps, or feature-specific arguments.
  - *Data model:* §12
  - *Verification:* Unit test — enqueuing `feature_used` with a `userId` field asserts rejection. Enqueuing with `locale: "en-US"` (full tag) asserts rejection.

- [ ] **P8-5.** Telemetry is flushed only when `Prefs.analyticsOptedIn === true`. On opt-out, the `telemetryQueue` IDB store is cleared immediately (not deferred to the next flush cycle). The "Delete all my data" flow also clears the queue unconditionally.
  - *Constitution:* §II — default-off analytics
  - *Data model:* §12 — `telemetryQueue`; §15 — queue included in wipe
  - *Verification:* Unit test asserts the IDB clear is called synchronously when `analyticsOptedIn` transitions from `true` to `false`. `pnpm test`.

---

## P9 — CCPA Applicability

> California Consumer Privacy Act (CCPA) / California Privacy Rights Act (CPRA). ShieldMe does not sell or share personal information. These items confirm the architecture cannot inadvertently create a "sale" or "share" under CCPA definitions.

- [ ] **P9-1.** ShieldMe does not sell or share personal information with third parties for cross-context behavioral advertising. The privacy policy states this in plain language using the phrase "We do not sell your personal information."
  - *Engineering-QA:* Q6 — privacy policy requirements
  - *Verification:* `grep -i "do not sell" docs/legal/privacy-policy.md` — must return a match. Code review of all `fetch()` call sites in `src/` confirms no personal data field appears in any request body or URL query string.

- [ ] **P9-2.** The privacy policy includes a "Your Privacy Rights" section that covers: the right to know what personal information is collected; the right to delete (linked to the in-product deletion flow); the right to opt out of sale (with the statement "We do not sell your personal information"); and the right to non-discrimination for exercising these rights.
  - *Verification:* Manual review of `docs/legal/privacy-policy.md`. All four CCPA consumer rights must be addressed by name.

- [ ] **P9-3.** The onboarding analytics consent screen includes a "Notice at Collection" reference: a one-line statement linking to the privacy policy (e.g., *"Learn what we collect and how in our [Privacy Policy]"*). This satisfies the CCPA requirement that notice be given at or before the point of collection.
  - *Verification:* UI review of the onboarding analytics screen. Assert the privacy policy link is present and rendered before the user can toggle the opt-in checkbox.

- [ ] **P9-4.** Telemetry data (when the user has opted in) is routed exclusively to the operator-controlled Plausible Analytics instance. Plausible is not an advertising network or data broker; no user data is onward-transferred. This is consistent with the "no sale or share" commitment.
  - *Threat model:* R-LOW-2 — "Plausible self-hosted; coarse event leak (no scan content)"
  - *Verification:* `contracts/integration-apis.md §1` — the Plausible host is the only analytics endpoint in the egress allowlist. `node scripts/check-egress-allowlist.mjs` — no advertising-network or third-party analytics host appears.

---

## Compliance Sign-off (Reviewer table)

> Apply to every PR that modifies: storage schemas, telemetry event types or payloads, permissions or host_permissions, OAuth scope lists, the privacy policy, or the data-deletion flow.

| Area | Checklist items | Reviewer signs off |
|---|---|---|
| Scan-result persistence (no findings stored) | P1-1 | |
| Breach-cache PII (hash only, no plaintext) | P1-2 | |
| Analytics consent default (false) | P2-2, P2-3 | |
| Privacy policy currency (all permissions listed) | P3-1 | |
| Limited Use disclosure currency | P3-2, P7-2 | |
| Telemetry payload PII-free | P8-1, P8-2 | |
| Erasure completeness (all stores wiped) | P5-2, P5-4 | |
| OAuth scope minimisation | P6-4, P7-1 | |
| CCPA "do not sell" statement present | P9-1, P9-2 | |

---

*This checklist is normative. Items marked `[!]` block merge. Items marked `[-]` require a one-line justification in the PR comment. Sections P7-4 and any item marked (M6+) or (v1.5+) become active at the stated milestone.*
