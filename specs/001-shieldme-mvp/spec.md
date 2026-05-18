# Feature Spec — ShieldMe v1.0 (Privacy Audit Web App)

**Feature ID:** 001-shieldme-mvp · **Owner:** eng · **Status:** ready · **Updated:** 2026-05-17 (web-app pivot)

Scope: Ship a publishable client-side web app at `/` covering six privacy-audit modules at **Free-tier capacity**, with architectural seams to flip specific features to Basic / Pro without refactors. Deployable to GitHub Pages / Cloudflare Pages / Vercel.

**Re-positioning (2026-05-17):** ShieldMe is now a *Privacy Audit Tool* — "Know what's exposed. Before you share it." Users come, paste/upload/connect, get a report. The original always-on "Email Guardian intercepts Gmail Send" value prop is parked under `BL-platform-chrome-extension` for a future extension variant. The web app's email-scanning mode is **paste-text-or-upload-.eml** (same trust posture as Document Check). Multi-account remains the Pro differentiator.

**Companions:** [constitution](../../.specify/memory/constitution.md) · [plan](./plan.md) · [research](./research.md) · [data-model](./data-model.md) · [contracts](./contracts/) · [tasks](./tasks.md) · [quickstart](./quickstart.md)

---

## 1. User Stories

| ID | As a | I want | So that |
|---|---|---|---|
| US-01 | new user | install the extension and get protected with zero config | my common sensitive data is watched by default |
| US-02 | everyday user | drag a PDF into the extension and see what's exposed | I know what to redact before sharing |
| US-03 | Gmail user | be warned before sending an email with my IBAN to a stranger | I don't leak my bank details |
| US-04 | Drive user | see which of my files are public and contain sensitive data | I can lock them down |
| US-05 | breached user | check if my email appeared in a known breach | I can change passwords where it matters |
| US-06 | privacy-conscious user | walk through 20+ data-broker opt-outs with progress tracked | I can remove my info from people-search sites |
| US-07 | free user | hit a soft limit and see a clear upgrade path | I understand why and what paid adds |
| US-08 | any user | wipe every byte ShieldMe stored in one action | I'm in control |
| US-09 | advanced user | define a custom rule matching my own ID format | my non-standard IDs are watched |
| US-10 | non-English speaker (Greek) | use the extension in my language | it works for me |
| US-11 | new user in any Tier-1 country | pick my country and situations during onboarding, have the right detectors turn on | I'm not stuck choosing from 200 checkboxes |
| US-12 | user with Beta-country needs | opt in to detectors for countries that aren't corpus-gated yet | my non-primary country is at least watched best-effort |
| US-13 | user with multiple Google accounts (personal + work) | connect both and run Drive Audit / Email Guardian per account | I can protect each account without re-installing |
| US-14 | user changing devices or finishing with a connected account | disconnect that account in one action — revoke tokens, wipe its scoped state | nothing of mine lingers when I'm done |
| US-15 | user with a Microsoft 365 / Outlook account | connect it the same way I connect Google, with the same UX | the product feels coherent across providers |
| US-16 | calendar-heavy user | scan my Google / Outlook calendar for events that contain my PII | my recurring private appointments aren't accidentally shared |
| US-17 | privacy-conscious EU user | generate Article 15 / CCPA data-export-request letters from inside the extension | I don't have to compose them from scratch |
| US-18 | user worried about Chrome extensions | see which of my installed extensions have the most invasive permissions | I can prune what I don't trust |
| US-19 | user who downloaded a Google Takeout | drag the .zip into the extension and see what's exposed inside | I know what to delete before backing it up |
| US-20 | user with too many subscriptions | find every service that emailed me a receipt in the last year | I can unsubscribe / delete-account where I don't need them |
| US-21 | traveler crossing a border | flip on Travel Mode for the trip duration | my keys are gated behind biometric re-auth and risky accounts auto-disconnect |
| US-22 | Pro user about to share a Drive file | be warned before the share completes if the file contains PII | I don't accidentally ship my IBAN to anyone-with-the-link |
| US-23 | Pro user receiving suspicious email | get a phishing banner above messages with link-mismatch or homoglyph patterns | I think twice before clicking |
<!-- US-24 (Pro Family) removed 2026-05-12 — household/family licensing moved to backlog.md -->
| US-24 | Pro user with three connected accounts | switch between accounts in the popup header without re-authenticating each time | I can audit work in the morning and personal in the evening without friction |

## 2. Functional Requirements

### 2.1 Module 1 — My Protection Rules
- **FR-R1.** 6 category toggles render with friendly names (§3.1 of PRD). Default ON: My Money, My Identity, My Digital Life. Default OFF: My Health, My Family, My Location.
- **FR-R2.** Each category expands to individual detector toggles (Advanced fold). Detector inventory is loaded from the compiled registry (sourced from [docs/detector-catalog.md](../../docs/detector-catalog.md)); Beta-tier detectors are rendered behind a single "Include detectors for other countries" switch, off by default.
- **FR-R3.** "Custom Rules" supports keyword, pattern, combination modes (§3.2). Free tier: **max 3 active custom rules**.
- **FR-R4.** "Request a protection" opens a pre-filled form to a public roadmap URL (configured via `ROADMAP_URL` constant).
- **FR-R5.** Changing a toggle takes effect on the next scan without restart.
- **FR-R6.** First-run onboarding completes in ≤5 clicks from install → dashboard. The onboarding flow presents the Preset picker (FR-R7).
- **FR-R7.** **Protection Presets.** Users apply one residency preset + any number of situation presets per [docs/protection-presets.md](../../docs/protection-presets.md).
  - FR-R7.1: Applying a preset mutates `Rules.categories` and `Rules.categories[*].detectors` via `PresetResolver.apply(preset, rules)`; mutations are additive (union) and never disable detectors enabled by other active presets or by manual override.
  - FR-R7.2: A preview panel renders the preset's effect ("turns on 18 protections, turns off 0") using consumer labels only — no detector IDs or regulation names — before the user confirms.
  - FR-R7.3: Unapplying a preset disables detectors it uniquely enabled (`refCount == 1` across active presets); manual overrides persist.
  - FR-R7.4: `rules.activePresets[]` persists across reloads. The Rules UI lists active presets with an individual Remove action.
  - FR-R7.5: Preset catalog is validated at build time (`scripts/verify-presets.mjs`): every detector ID in every preset exists in the registry; every preset has i18n keys; no preset references a `Planned`-tier detector.
  - FR-R7.6: Consumer-copy linter bans regulation names (HIPAA, GDPR, PCI, PIPEDA, APPI, PIPA, POPIA, LGPD) and jargon (DLP, SIT, regex, policy template) from user-facing preset strings.

### 2.2 Module 2 — Document Check
- **FR-D1.** Accept PDF, DOCX, XLSX, CSV, TXT, RTF via drag-drop or file picker. (Image OCR — PNG, JPG, TIFF — deferred to v1.5; see [research.md R25](./research.md#r25-tesseract-ocr--defer-to-v15).)
- **FR-D2.** Extract text via the bundled parser for each type. No external services.
- **FR-D3.** Free tier — enforce: max **10 MB/file**, max **5 scans/calendar month**. Exceeding limits shows a modal with the limit + upgrade CTA. (Image-specific caps — 5 MB and 2048 × 2048 px — return when OCR ships in v1.5.)
- **FR-D4.** Render an Exposure Report per PRD §4.3 including per-finding page number (PDF/DOCX) or cell reference (XLSX).
- **FR-D5.** Export Report — generates a local PDF via jsPDF (free = 1-page summary; paid = full findings).
- **FR-D6.** Share Score — generates a branded PNG with **zero PII** — asserted by a test that scans the rendered canvas for any detector match.
- **FR-D7.** Scan state is visible at all times: Idle → Reading (bytes) → Scanning (rules count) → Done. No silent phases.

### 2.3 Module 3 — Email Scanner (web-app variant, post-pivot 2026-05-17)
- **FR-E1.** Two input modes: (a) paste raw email text (headers + body), (b) drag-drop / file-pick an `.eml` file. No Gmail/IMAP/Graph mailbox access at v1.0; that returns under `BL-platform-chrome-extension` and `BL-prov-microsoft-graph`.
- **FR-E2.** On submit: parse the email (headers + body + attachments-by-mime if .eml), scan body and subject via the detection engine, scan attachments via the Document Check engine, render an Exposure Report. Max 3 s on a 1 MB .eml.
- **FR-E3.** If findings on Pro: show inline phishing-heuristic banner above the body when link mismatch, homoglyph, or attachment-type masquerade is detected (Constitution §XV Inbound Content Trust).
- **FR-E4.** Recipient + domain whitelisting persists in IndexedDB. Whitelist applies on subsequent scans of the same sender (heuristic banner suppression).
- **FR-E5.** No silent failures. Parser errors render a named-failure banner with a Report button (Constitution §IX).
- **FR-E6.** No mailbox/inbox scopes. Only the user's paste/upload action initiates a scan.

### 2.4 Module 4 — Cloud Audit (renamed from Drive Audit, web-app variant)
- **FR-A1.** OAuth 2.0 PKCE code flow via browser redirect/popup (no `chrome.identity.*`). Scopes: `drive.metadata.readonly` + `drive.readonly` at audit time. Write scope (`drive`) upgraded only on first Pro fix-action consent.
- **FR-A2.** Free tier caps content scanning at the **top 100 most-exposed files** (by permission severity). Listing of all files still occurs; report header says *"Audited 100 of N exposed files."*
- **FR-A3.** Free tier: report shows top 5 critical findings with read-only details. **Fix actions** require Premium + one-time `drive` (write) scope upgrade.
- **FR-A4.** Cross-reference permissions with active Protection Rules per PRD §6.3.
- **FR-A5.** Incremental re-audit uses `changes.list`; full-scan button always available.
- **FR-A6.** Results are cached locally per `fileId + modifiedTime`. Cache is wiped on Delete-all-my-data.

### 2.5 Module 5 — Exposure Radar
- **FR-X1.** Breach Check password mode uses HIBP Pwned Passwords k-anonymity API (no key needed).
- **FR-X2.** Breach Check email mode requires user's own HIBP key; key entry persists in encrypted storage.
- **FR-X3.** Email check restricted to addresses on the Chrome profile or verified via email code (anti-abuse).
- **FR-X4.** Data Broker Exposure — curated list of 20+ sites in `src/data/brokers.json` (owner: product). Each entry: name, opt-out URL, expected form difficulty. User manually marks "Removal requested." Progress persists locally.
- **FR-X5.** Dark Web Monitoring — placeholder only in v1 with "Notify me" intent capture (stored locally; opt-in export to product waitlist later).
- **FR-X6.** **DeleteMe bridge** — Premium scaffold only; renders as "Coming soon" card. Abstraction `BrokerRemovalProvider` (see `contracts/integration-apis.md`) has two implementations: `ManualProvider` (ships) and `DeleteMeProvider` (stubbed interface, no network).

### 2.5a Identity & Multi-Account
- **FR-Acc1.** Users may connect multiple accounts via the `IdentityProvider` contract. v1.0 supports Google; Microsoft ships in M6.
- **FR-Acc2.** Free + Basic tiers: max 1 connected account. Pro tier: unlimited accounts. Enforced via `TierGate.check("accounts-max")`. The Free→Basic step does **not** add accounts (Basic is "protect *your* life, fully"); multi-account is the explicit Pro upgrade trigger.
- **FR-Acc3.** Each account has a scoped namespace; cached audit results, whitelists, and broker progress are per-account. Rules, Prefs, Tier, and Exposure Score are global.
- **FR-Acc4.** Sign-in uses OAuth 2.0 PKCE code flow via `chrome.identity.launchWebAuthFlow`. `chrome.identity.getAuthToken` is **forbidden** because it doesn't support multi-account.
- **FR-Acc5.** When `withOpenId === true`, the ID token is captured, validated client-side via JWKS, and the `sub` claim is stored on the `Account` for future entitlement attachment. The ID token itself is discarded unless retention is required by the entitlement service (M6+).
- **FR-Acc6.** Disconnecting an account: revoke tokens at the IDP, then wipe `tokens.${id}`, all `acc.${id}.*` keys, and IDB rows keyed by `accountId`. Idempotent. Type-to-confirm dialog.
- **FR-Acc7.** Settings → Accounts lists every connected account with provider badge, label, last-used date, and Disconnect action.
- **FR-Acc8.** Modules with multi-account capability (Drive, Email Guardian, Radar) show an account switcher when >1 eligible account is connected.

### 2.5b Module 6 — Calendar Audit
- **FR-Cal1.** Connect Google Calendar (Calendar API, `calendar.readonly` scope) and / or Outlook Calendar (Microsoft Graph `Calendars.Read`). Multi-account per the `IdentityProvider` contract.
- **FR-Cal2.** Scan event titles, descriptions, and location fields for active Protection Rules. Findings keyed by event ID + occurrence start.
- **FR-Cal3.** Findings cross-referenced with sharing: events visible to "anyone with link" or shared outside the user's domain are elevated to Critical when they contain PII.
- **FR-Cal4.** Free tier: not available. Basic: weekly re-audit, read-only report. Pro: daily re-audit + per-finding "Redact" action (requires `calendar.events` write scope; separate OAuth upgrade consent).
- **FR-Cal5.** Redact action rewrites title and description with user-confirmed redacted text; original is not recoverable through the extension. Audit log entry stored locally.

### 2.5c Module 7 — Privacy Toolkit
- **FR-Tk1.** Data Export Request generator (Basic+): user picks a service from a curated catalog (`src/data/exporters.json`, 50+ EU-relevant brokers + 30+ US-relevant services); ShieldMe pre-fills an Article 15 / CCPA letter template with the user's email and address; opens `mailto:` to the service's DPO address. Pro tier adds status tracking via a local ticket-id store.
- **FR-Tk2.** Browser Extension Audit (Basic+): on user demand, reads `chrome.management.getAll`, computes a risk score per extension based on declared permissions (weight: `<all_urls>` × 10, `tabs` × 5, `storage` × 1, optional vs required ×0.5), shows a sortable list. No automatic action.
- **FR-Tk3.** Takeout review (Basic+): when the user drops a Google Takeout zip into Document Check, recursively decompress (offscreen document) and scan every supported file inside. Files larger than the tier file-size cap are skipped with a notice.
- **FR-Tk4.** Subscription Audit (Basic+): Email Guardian content-script extension that scans the user's Gmail/Outlook inbox (DOM-only on Gmail; Graph `Mail.Read` on Outlook) for the last 30 days (Basic) or 365 days (Pro), identifies subscription-confirmation / receipt emails via heuristic patterns (sender-domain + keyword + structural cue), surfaces a list of services with the user's email. Read-only; no list persisted longer than the report screen lifetime unless the user explicitly saves.
- **FR-Tk5.** Travel Mode (Pro+): temporary heightened state. On enable, the user picks a duration (1–30 days) and behavior bundle: (a) require Chrome profile re-auth before every key-decrypt operation; (b) auto-disconnect selected accounts; (c) turn on every detector in My Family + My Health + My Location; (d) hide cached audit reports from Settings. Auto-reverts at end-of-duration; manual revert available.

### 2.5d Module 3 — Email Guardian Inbound mode (Pro)
- **FR-In1.** Off by default; opt-in per connected email account. When on, the content script (Gmail DOM or Outlook DOM/Graph) scans incoming messages at "open" event.
- **FR-In2.** Phishing heuristics (client-side): (a) link mismatch — visible text claims `bank.com`, href is `bank-secure.com.attacker.example`; (b) homoglyph — Latin/Cyrillic confusables in domain; (c) attachment type masquerade — `.exe`/`.scr`/`.iso` claiming to be a PDF; (d) sender-domain age unknown or <30d (heuristic: TLS cert age or DNS-WHOIS skipped — too expensive client-side; use sender-domain reputation list bundled and refreshed weekly via signed JSON, same Ed25519 discipline as kill-switch); (e) urgency/threat lexicon match.
- **FR-In3.** When a heuristic triggers, render a banner above the message body with the reason in plain language; never auto-action. User can `Trust this sender` (whitelist) or `Report to ShieldMe` (anonymous heuristic-quality signal, opt-in only via telemetry).
- **FR-In4.** Reputation lookups (if added v1.5): k-anonymity hashing of sender domain; never the full email address; no cookies; opt-in.

### 2.5e Module 4 — Cloud Audit submodes (added 2026-05-09)
- **FR-CA-Share1.** Share Interception (Basic+): content script on Drive's share dialog (or OneDrive's equivalent) detects when the user clicks "Share" or "Copy link," runs Document Check on the file in question, and presents a modal if findings exist: `Share Anyway` / `Cancel` / `Adjust Permissions`. Free tier: no interception (manual audit only).
- **FR-CA-Watermark1.** Watermark-on-share (Pro+, opt-in): when a Pro user shares a file containing PII, ShieldMe appends a comment to the file via Drive API: *"This file contains personal data — protected by ShieldMe."* Comment-only; the document body is never modified. Requires Drive write scope (user one-time consent).
- **FR-CA-Cont1.** Continuous re-audit (Pro+): background task runs `changes.list` daily (configurable: hourly Pro Family). Alerts on new public links or new external collaborators since last audit.

### 2.6 Cross-Cutting
- **FR-C1.** Exposure Score computed per PRD §8 formula. Badge color mapped per PRD. Updated reactively on any change.
- **FR-C2.** Settings page per PRD §11 (language EN/EL at launch, notification prefs, data retention wipe, export settings).
- **FR-C3.** "Delete all my data" wipes `chrome.storage.local`, IndexedDB, cached OCR traineddata, and optional analytics in one action, confirmed with a type-to-confirm dialog.
- **FR-C4.** Telemetry is **opt-in only**, disabled by default, and never transmits scan content. Schema fixed in `docs/analytics-schema.md`.
- **FR-C5.** Every capacity-bounded action goes through `TierGate.check()`. Free-tier limits block with an upsell card; no silent truncation.

## 3. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-P1 | Popup initial open ≤250 ms on mid-range laptop; cold-start to first scan ≤1 s. |
| NFR-P2 | Document Check: 1 MB PDF scans in ≤2 s; 10 MB PDF in ≤10 s. |
| NFR-P3 | OCR on 2048 × 2048 px image ≤8 s on mid-range laptop. |
| NFR-P4 | Drive Audit listing phase ≤15 s for 3,000 files. |
| NFR-S1 | All scanning client-side; verified by egress allowlist test. |
| NFR-S2 | API keys encrypted at rest (Web Crypto AES-GCM with per-install key). |
| NFR-S3 | No remotely hosted code. CSP `script-src 'self' 'wasm-unsafe-eval'`. |
| NFR-S4 | Source maps shipped; no obfuscation in security-sensitive paths. |
| NFR-A1 | WCAG 2.1 AA: color contrast ≥4.5:1, keyboard-only navigation, `aria-label`s on all icon buttons. |
| NFR-I1 | i18n: strings externalized to `_locales/{en,el}/messages.json`. No hardcoded UI strings in components. |
| NFR-Q1 | Unit test line coverage ≥80% on `src/core/**` and `src/detectors/**`. |
| NFR-Q2 | Detection FPR ≤2%, recall ≥95% per detector on the corpus. |
| NFR-Q3 | E2E Playwright suite passes on Chromium stable + beta. |
| NFR-B1 | Unpacked ≤25 MB. Popup initial bundle ≤500 KB. |

## 4. Acceptance Criteria (per module)

Each criterion corresponds to an automated test (`tests/acceptance/<module>.spec.ts`).

### 4.1 Rules
- AC-R1: Fresh install → 3 categories default ON, 3 default OFF.
- AC-R2: Toggling "My Money" OFF makes a follow-up Document Check scan on a doc with an IBAN emit zero findings for the IBAN detector.
- AC-R3: Creating a 4th custom rule on Free tier shows the Upsell CTA and does not activate the rule.
- AC-R4: Applying `preset.residency.gr` enables the AFM, ΑΔΤ, and Greek passport detectors; scanning a doc with a Greek AFM reports it, and `rules.activePresets` contains exactly `["preset.residency.gr"]`.
- AC-R5: Applying `preset.residency.gr` then applying `preset.work.developer` then **unapplying** `preset.residency.gr` leaves the developer detectors (credentials, cloud keys) enabled and the Greek-specific detectors disabled.
- AC-R6: Preset preview shows zero regulation names / DLP jargon (scanned via copy linter at CI time, plus a runtime string-match acceptance test).
- AC-R7: The "Include detectors for other countries" switch OFF → Beta-tier detector toggles are not present in the DOM. ON → they appear and respect the same category boundaries.

### 4.2 Docs
- AC-D1: Scanning `tests/fixtures/samples/tax-return-2025.pdf` reports the planted Tax ID, IBAN, and Full Name + Address at the correct page numbers.
- AC-D2: Uploading an 11 MB PDF on Free tier shows the size-limit modal; no scan runs.
- AC-D3: After 5 completed scans in a month, the 6th attempt shows the scan-count upsell; `TierGate` check event logged.
- AC-D4: Share Score PNG contains no detector matches (regression-scanned by test).

### 4.3 Email
- AC-E1: Composing in Gmail with a test IBAN and clicking Send → modal appears; dismissing returns focus to compose.
- AC-E2: Whitelisting a recipient and re-sending to them with the same content → no modal.
- AC-E3: When compose DOM canary fails, the banner renders within 1 s and the extension does NOT consume the Send click.

### 4.4 Drive
- AC-A1: First-time audit requests OAuth (PKCE via `launchWebAuthFlow`) and enumerates all files via `files.list`. ID token validated client-side; `sub` stored on the resulting `Account`.
- AC-A2: On Free tier, content scan stops at 100 files with the banner; listing total visible.
- AC-A3: Fix-action buttons on Free tier show Premium upsell, not write scope request.
- AC-A4: A file containing an IBAN and shared "Anyone with link" surfaces as Critical with both reasons.
- AC-A5: Connecting a second Google account works without disturbing the first; running Drive Audit on the second account produces a separate report; disconnecting the second account leaves the first's report cache intact.

### 4.8 Calendar Audit (Module 6)
- AC-Cal1: Connecting a Google Calendar with an event titled `"Dr. Smith oncology consult — AMKA 12345"` reports a Critical finding (AMKA + health-context keyword) on the next scan.
- AC-Cal2: Same event marked "Public" elevates the finding's reason to include "visible to anyone."
- AC-Cal3: Free tier cannot enable Calendar Audit; the toggle shows the Basic upsell.
- AC-Cal4: Pro `Redact` action rewrites the title to the user-confirmed redacted version and creates a local audit-log entry; the original title is unrecoverable through the extension UI.

### 4.9 Privacy Toolkit (Module 7)
- AC-Tk1: Data Export Request generator pre-fills the user's email and the chosen service's DPO address; the `mailto:` opens the user's default email client with a non-empty body.
- AC-Tk2: Browser Extension Audit reports `<all_urls>`-permissioned extensions with a higher risk score than `storage`-only extensions; the list is sortable.
- AC-Tk3: Dropping a `takeout.zip` containing one Drive folder and one Gmail .mbox file scans both; .mbox is treated as line-delimited text.
- AC-Tk4: Subscription Audit on a seeded Gmail account containing 5 receipt emails surfaces all 5 services; no list is persisted after the popup is closed unless the user clicks Save.
- AC-Tk5: Enabling Travel Mode for 7 days disconnects the chosen accounts immediately, requires Chrome profile re-auth before any key-decrypt, and auto-reverts to the prior state at 7 days +1 minute (clock-injectable for tests).

### 4.10 Email Guardian Inbound (Module 3, Pro)
- AC-In1: Receiving an email where the visible link text reads `https://example-bank.com` but the href is `https://example-bank.com.attacker.test` renders a phishing banner with reason "link mismatch."
- AC-In2: Whitelisting the sender suppresses the banner on next open of any message from that sender.
- AC-In3: With Inbound disabled, no banner renders regardless of heuristic match (verified by feature flag).

### 4.11 Cloud Audit Share Interception (Module 4)
- AC-CA-Sh1: Clicking Drive's `Copy link` button on a file containing an IBAN, with Share Interception enabled, presents a modal before the link is copied; clicking `Cancel` does not write the link to the clipboard.
- AC-CA-Sh2: Free tier shows no interception; the file is shared without warning (this is the documented Free-tier behavior, not a bug).

### 4.7 Identity & Accounts
- AC-Acc1: Adding a third account on Free tier shows the `accounts-max` upsell; no consent screen opens.
- AC-Acc2: Disconnecting an account revokes at the IDP (verified by a network-egress assertion targeting the revoke URL) and leaves zero `acc.${id}.*` keys in `chrome.storage.local`.
- AC-Acc3: After disconnect, the IDP-side OAuth scope grant is gone (verified by a re-auth flow showing the consent screen anew).
- AC-Acc4: An ID token signed with a key not in the JWKS cache is rejected with `IdentityError.kind === "id-token-invalid"`.

### 4.5 Radar
- AC-X1: Password check with `password123` returns ≥1 breach via k-anonymity; no key requested.
- AC-X2: Email check prompts for HIBP key if not present.
- AC-X3: Data-broker checklist renders 20+ sites; marking complete persists across popup reload.
- AC-X4: DeleteMe card renders "Coming soon" with a "Notify me" button; zero network calls made.

### 4.6 Cross-Cutting
- AC-C1: `chrome.storage.local` dump after "Delete all my data" returns empty.
- AC-C2: Network-egress test asserts no `fetch`/`XHR` to any host outside the authoritative allowlist in [`contracts/integration-apis.md` §1](./contracts/integration-apis.md). The test loads that allowlist as the single source of truth — adding/removing a host updates one file, never two. Hosts gated by user opt-in (Plausible, tessdata, HIBP keyed endpoint, selectors host, Stripe, entitlement host) only count when the corresponding feature is active in the test fixture.
- AC-C3: Bundle size check under 25 MB; popup bundle under 500 KB.

## 5. Tier Model (binding, post-pivot 2026-05-17)

ShieldMe is **free and open-source** — MIT-licensed, hosted on GitHub Pages. All seven modules ship at full capacity to every user. No pricing tiers in v1.0.

The `TierGate` abstraction (`src/core/tier-gate.ts`) remains in the codebase as a forward-compatible seam. Its current resolver returns `tier: "preview"` for every caller, which means every `check()` call returns `{ allowed: true }`. If a future variant reintroduces paid features, the resolver swaps to a real billing provider without rewriting modules.

What's NOT in v1.0:
- Stripe Checkout (the BillingProvider stub stays as scaffolding only).
- Family / household licensing.
- Premium-only feature gates.
- Subscription state in the data model (`TierStatus.tier` defaults to `preview` and never persists a paid value).

Why: the audience for the web app is portfolio reviewers and privacy-curious individuals. A free, sharable URL is the right surface. The Chrome extension variant in `backlog.md` (`BL-platform-chrome-extension`) is where pricing returns if it returns at all.

## 6. Out of Scope (v1)

**Scoped out of v1, planned for v1.5+ via the provider abstractions** ([identity-providers.md](./contracts/identity-providers.md), [storage-providers.md](./contracts/storage-providers.md), [email-providers.md](./contracts/email-providers.md)):

- Outlook web (compose intercept + inbound scan) and Microsoft 365 web — via Microsoft Graph identity provider.
- OneDrive — via Microsoft Graph storage provider.
- Inbound email scanning (phishing/malicious-link warnings) — Constitution §XV.
- Dropbox + Box cloud audit — interface-ready, no implementation date.

**Permanently out of scope** (no API path or no fit):

- Apple iCloud Drive — no public consumer API.
- Outlook desktop, Apple Mail desktop, Thunderbird, etc. — not browser surfaces.
- Yahoo Mail, AOL Mail — DOM-scrape decay rate too high to support.
- Generic IMAP/SMTP — credential storage is an unacceptable attack surface.
- Mobile Chrome — no extension support upstream.
- Browser-wide form-fill warnings — would require `<all_urls>`, violates Constitution §III.
- Enterprise admin console, SSO, audit logs — not consumer scope.
- Dark-web monitoring beyond a "Notify me" placeholder.
- Stripe checkout UI in MVP (scaffolded hook only; full UI at M6).
- Automated DeleteMe calls in MVP (scaffolded provider only; activates with Premium).
- Languages beyond EN/EL at MVP (FR/DE/ES/PT queued for M6).

## 7. Assumptions

- Users run Chrome 120+ (MV3 stable).
- Users supply their own HIBP API key for email breach check.
- Users have a Google account for Drive Audit.
- Gmail DOM structure broadly stable; 2–4 selector updates/year budget.

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gmail DOM breaks Email Guardian | High | High | Kill-switch selectors (Q1 strategy). |
| OAuth verification delays Drive Audit ship | Medium | High | Start OAuth verification Month 3. |
| Chrome Web Store rejects `identity` | Low | High | On-demand request + detailed justification doc. |
| Tesseract.js perf frustrates users | Medium | Medium | Size limits + progress + cancel. |
| False positives erode trust | Medium | High | Golden corpus + CI gate at FPR ≤2%. |
