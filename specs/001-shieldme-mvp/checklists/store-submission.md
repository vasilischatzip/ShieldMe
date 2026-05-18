# Chrome Web Store Submission Checklist — ShieldMe MVP

**Scope:** Pre-submission gate. Every item must be `[x]` before uploading the production zip to the Chrome Web Store developer dashboard. Items marked *(M3+)* gate the Drive Audit public launch, not the initial submission.
**Version:** 1.0 · **Updated:** 2026-05-16
**Authorities:** Constitution §III/§VIII · `docs/engineering-qa.md` Q6 · `spec.md` FR-*, AC-* · Chrome Web Store Developer Program Policies (May 2025) · Google API Services User Data Policy (Limited Use)

---

## How to use this checklist

1. Work through **S1–S6** in order — each section maps to one Chrome Web Store dashboard tab or a pre-submission artifact.
2. For each item, mark one of:
   - `[x]` — confirmed green
   - `[-]` — not applicable (add a one-line reason in the PR comment)
   - `[!]` — violation found — **blocks submission**
3. The **Submission Sign-off** table at the bottom requires sign-off from both eng and product before the zip is uploaded.
4. After initial submission, items that change between releases are marked with *(re-check on update)*.

---

## S1 — Package & Manifest (MV3 Compliance)

> Dashboard section: **Package** tab (zip upload). These items validate the built artifact before it is ever uploaded.

- [ ] **S1-1.** `manifest_version` is exactly `3`. No MV2 keys (`browser_action`, `background.persistent`, `background.scripts`) appear in the built manifest.
  - *Constitution:* §VIII — MV3 is the only supported target
  - *Verification:* `node -e "const m = require('./dist/manifest.json'); console.assert(m.manifest_version === 3)"`. CI `pnpm build` produces this file; assert version in the bundle-budget script output.

- [ ] **S1-2.** The `content_security_policy.extension_pages` field is exactly:
  ```
  script-src 'self' 'wasm-unsafe-eval'; object-src 'self'
  ```
  No `unsafe-inline`, no `unsafe-eval`, no external origins in `script-src`. The `connect-src` is handled by the egress allowlist and is absent from the manifest CSP (Chrome ignores `connect-src` in the manifest CSP for MV3; it is enforced via the egress allowlist CI check).
  - *Constitution:* §VIII — "no eval, no CDN, no remote code"
  - *Verification:* `node scripts/verify-csp.mjs` — CI gate. Manually inspect `dist/manifest.json` after build.

- [ ] **S1-3.** **"Remotely hosted code": No.** The extension does not fetch or execute any JavaScript or WebAssembly from a remote server at runtime. The kill-switch (Q1) fetches a signed JSON data file only — no executable code — enforced by the `script-src 'self'` CSP.
  - *Constitution:* §VIII — "No CDN requests. No remote code execution. No eval."
  - *Engineering-QA:* Q6 — "'Remotely hosted code' field: **No.** Kill-switch (Q1) fetches *data only*, enforced by CSP."
  - *Verification:* `node scripts/verify-csp.mjs` confirms no external script source. `node scripts/check-egress-allowlist.mjs` confirms no CDN JS host in the allowlist. The Web Store submission form field "Does your extension use remotely hosted code?" is answered **No**.

- [ ] **S1-4.** The built `dist/` contains no inline `<script>` tags in any HTML file (`popup/index.html`, `options/index.html`, `offscreen/parser.html`). All JS is loaded via `<script src="...">` pointing to bundled files.
  - *Constitution:* §VIII — "no eval, no inline scripts"
  - *Verification:* `grep -r "script>" dist/*.html` — must return zero results for inline script content. `pnpm build` produces deterministic output; this check runs as part of the CSP validator.

- [ ] **S1-5.** `web_accessible_resources` restricts asset access to the minimum required match pattern. Currently declared as `matches: ["<all_urls>"]` for the `assets/*` directory. **Before submission:** narrow this to `["https://mail.google.com/*"]` (the only context where the content script accesses extension assets), unless assets are required in other origins.
  - *Constitution:* §III — least-privilege; `<all_urls>` in `web_accessible_resources` enables any page to probe extension asset URLs and fingerprint the extension
  - *Verification:* Code review of `src/manifest.ts`. `web_accessible_resources[0].matches` must not be `["<all_urls>"]` in the production build. Restrict to `["https://mail.google.com/*"]` unless a concrete cross-origin use case is documented.

- [ ] **S1-6.** All required manifest fields are populated in the production build:
  - `name`: `"ShieldMe"` (matches the Web Store listing title exactly — case-sensitive)
  - `version`: a valid semver string (e.g., `"1.0.0"`) — the `"0.1.0"` development stub is replaced
  - `description`: ≤132 characters; matches (or is a subset of) the store short description
  - `default_locale`: `"en"`
  - `icons`: `16`, `48`, and `128` px keys pointing to valid PNG files
  - `action.default_icon`: same three sizes
  - *Verification:* `node -e "const m = require('./dist/manifest.json'); ['name','version','description','default_locale'].forEach(k => console.assert(m[k], k + ' missing'))"`. Visual check of `version` field — must not be `"0.1.0"`.

- [ ] **S1-7.** *(re-check on update)* The content script declared in `content_scripts` uses `run_at: "document_idle"` and matches only `https://mail.google.com/*`. The corresponding host is in `optional_host_permissions`, not `host_permissions`, so the script is injected **only when the user grants the optional permission**. This pattern is confirmed correct for MV3 optional content scripts.
  - *Constitution:* §III — content script for `mail.google.com` is optional and on-demand
  - *Engineering-QA:* Q6 — "Content script for `mail.google.com`: Optional host permission, requested when user enables Email Guardian."
  - *Verification:* Inspect `dist/manifest.json`: `content_scripts[0].matches === ["https://mail.google.com/*"]` AND `optional_host_permissions` includes `"https://mail.google.com/*"` AND `host_permissions` is empty (or does not include `mail.google.com`).

- [ ] **S1-8.** The uploaded zip file is built from the same commit that passed all CI gates (`pnpm verify` green). The zip is produced by `pnpm build` in the CI environment, not from a local developer machine, to ensure reproducibility.
  - *Constitution:* §X — automated QA as a release gate; §XII — supply-chain rules
  - *Verification:* CI release workflow generates the zip as an artifact. The SHA256 of the uploaded zip matches the CI artifact SHA256. This is logged in `releases/<version>/sbom.cdx.json` from M2 onward.

---

## S2 — Privacy Practices

> Dashboard section: **Privacy practices** tab. One justification per declared permission. The Web Store reviewer reads `docs/store-listing/justifications.md` alongside the Privacy Practices form answers.

The `docs/store-listing/justifications.md` artifact must contain one paragraph per permission (as specified in engineering-qa Q6) **before submission**. Each paragraph states: (a) what the permission enables, (b) why no less-privileged alternative exists, and (c) the minimum scope used.

### S2a — Required Permissions

- [ ] **S2-1.** **`activeTab`** — justification: the Email Guardian content script scans the active Gmail compose window at Send-click time. `activeTab` grants temporary access to the current tab's URL and the ability to inject the content script on demand. Alternative `tabs` permission (which gives access to all tabs at all times) is explicitly not requested.
  - *Constitution:* §III — "Only `activeTab` and `storage` are requested at install. Never `tabs`."
  - *Spec:* FR-E1 — content script activates only on `mail.google.com`
  - *Justification file:* `docs/store-listing/justifications.md` §activeTab
  - *Verification:* `docs/store-listing/justifications.md` exists and contains an `activeTab` entry. Privacy Practices form: select "Browsing history" → No; "Personally identifiable information" → No.

- [ ] **S2-2.** **`storage`** — justification: ShieldMe stores all user preferences, protection rules, the usage meter (scan count), encrypted API keys, tier status, and exposure score locally in `chrome.storage.local`. No server-side storage is used. Storage access is bounded to the extension's own key namespace.
  - *Constitution:* §II — "API keys and settings live in `chrome.storage.local`, encrypted at rest"
  - *Data model:* all entities in §1–15 of `data-model.md`
  - *Justification file:* `docs/store-listing/justifications.md` §storage
  - *Verification:* Justifications file contains a `storage` entry. Privacy Practices form: "User activity" → No; "Website content" → No; "Personal communications" → No.

- [ ] **S2-3.** **`sidePanel`** — justification: ShieldMe's primary UI is rendered as a Chrome Side Panel (`chrome.sidePanel`), which allows the popup to remain open while the user interacts with Gmail or Google Drive, enabling the Email Guardian workflow (scan compose, review findings, return to compose) without closing the extension UI.
  - *Spec:* the popup uses `side_panel.default_path`
  - *Justification file:* `docs/store-listing/justifications.md` §sidePanel
  - *Verification:* Justifications file contains a `sidePanel` entry. Chrome 114+ required (declare in the store listing's "Minimum Chrome version" field).

- [ ] **S2-4.** **`offscreen`** — justification: pdfjs-dist (the PDF text-extraction library) requires DOM APIs (`DOMMatrix`, Web Workers) that are unavailable in a MV3 service worker. An offscreen document (`src/offscreen/parser.html`) hosts the parser in a sandboxed context with DOM access. The offscreen document handles only parse requests; it never accesses the network or browser state.
  - *Constitution:* §VIII — all parsing is client-side and bundled
  - *Spec:* the offscreen document is referenced by `src/manifest.ts`
  - *Justification file:* `docs/store-listing/justifications.md` §offscreen
  - *Verification:* Justifications file contains an `offscreen` entry describing the `DISPLAY_MEDIA`-free, parse-only use case.

### S2b — Optional Permissions

- [ ] **S2-5.** **`identity` (optional)** — justification: Drive Audit uses `chrome.identity.launchWebAuthFlow` to initiate a PKCE OAuth 2.0 flow for the Google Drive API. `chrome.identity.getAuthToken` is **not** used (it does not support multi-account). The permission is requested **only** when the user navigates to Drive Audit and clicks "Connect Google Drive." It is not requested at install.
  - *Constitution:* §III — "`identity` is optional and requested on-demand"
  - *Engineering-QA:* Q6 — "`identity` for Drive OAuth: Request on-demand, not at install."
  - *Spec:* FR-Acc4 — OAuth via `launchWebAuthFlow` only
  - *Justification file:* `docs/store-listing/justifications.md` §identity
  - *Verification:* Justifications file contains an `identity` entry. Privacy Practices form — "Authentication information" → No (tokens are managed by Chrome Identity API, not stored by ShieldMe directly in plaintext).

### S2c — Optional Host Permissions

- [ ] **S2-6.** **`https://mail.google.com/*` (optional host)** — justification: the Email Guardian content script (`src/content/gmail/index.ts`) is injected into Gmail compose windows to scan outgoing email body, subject, and recipients at Send-click time. No Gmail API scope is used; the script reads the DOM only. The permission is requested when the user enables Email Guardian in Settings.
  - *Constitution:* §III — "host_permissions for `mail.google.com` is optional and requested on-demand"
  - *Engineering-QA:* Q6 — "Content script for `mail.google.com`: Optional host permission, requested when user enables Email Guardian. Privacy policy explains DOM-only approach."
  - *Spec:* FR-E1, FR-E6 — no Gmail API scope; pure DOM
  - *Justification file:* `docs/store-listing/justifications.md` §mail.google.com
  - *Verification:* Justifications file contains a `mail.google.com` entry. Privacy Practices form: "Personal communications" → Yes (email content is read at Send-click for scanning); certify data is not transmitted off-device.

- [ ] **S2-7.** **`https://haveibeenpwned.com/*` and `https://api.pwnedpasswords.com/*` (optional hosts)** — justification: the Exposure Radar breach check sends a 5-character SHA-1 hash prefix to the HIBP Pwned Passwords API (k-anonymity) for password checks, and queries the HIBP breach database with the user's own API key for email checks. Both hosts are queried only on explicit user action. No email address or full hash is transmitted.
  - *Constitution:* §I — "transmit only hashed/anonymized identifiers (e.g., k-anonymity SHA-1 prefix)"
  - *Engineering-QA:* Q6 — "HIBP host: Optional host permission, requested when user saves HIBP key."
  - *Spec:* FR-X1 — k-anonymity (no key); FR-X2 — email check requires user's own HIBP key
  - *Justification file:* `docs/store-listing/justifications.md` §haveibeenpwned.com
  - *Verification:* Justifications file contains a `haveibeenpwned.com` entry describing k-anonymity. Privacy Practices form: the HIBP API key is declared as user-provided credentials, not collected by ShieldMe.

- [ ] **S2-8.** **`https://www.googleapis.com/drive/v3/*` (optional host)** — justification: Drive Audit reads file metadata (names, MIME types, sharing permissions) and file content (for PII scanning) using the Google Drive API v3. Access is scoped to the minimum required (`drive.metadata.readonly` for listing, `drive.readonly` for content scanning). The write scope (`drive`) is requested separately, only when the user initiates a fix action (Basic+ tier).
  - *Engineering-QA:* Q6 — Limited Use; Drive scopes explicitly named in the privacy policy
  - *Spec:* FR-A1 — Drive API scopes; FR-A3 — write scope only for fix actions
  - *Justification file:* `docs/store-listing/justifications.md` §googleapis.com/drive
  - *Verification:* Justifications file contains a Drive API entry listing each scope and its purpose separately.

- [ ] **S2-9.** **`https://accounts.google.com/*` and `https://oauth2.googleapis.com/*` (optional hosts)** — justification: `accounts.google.com` hosts the Google OAuth consent screen launched by `chrome.identity.launchWebAuthFlow`; `oauth2.googleapis.com` is the token revocation endpoint called when the user disconnects their Google account (`/revoke`). Both are accessed only in the account connect and disconnect flows.
  - *Constitution:* §XIII — "Disconnect = wipe; revoke tokens at the IDP"
  - *Spec:* FR-Acc6 — token revocation on disconnect
  - *Justification file:* `docs/store-listing/justifications.md` §oauth2.googleapis.com
  - *Verification:* Justifications file contains entries for both Google OAuth hosts, distinguishing their roles (consent screen vs. revocation endpoint).

### S2d — Privacy Practices Form Answers

- [ ] **S2-10.** The Chrome Web Store Privacy Practices form is completed with the following answers:
  - **Does your extension collect data?** Yes — only usage analytics (coarse, opt-in), and locally-cached scan summaries (never transmitted).
  - **Data types collected:** Website content (email DOM at Send-click, Drive file content for scanning — never transmitted); User activity (scan counts, optional analytics events — stored locally; coarse events transmitted only with opt-in).
  - **Is data sold?** No.
  - **Is data used for purposes other than the core function?** No (analytics is opt-in and coarse; no profiling).
  - **Is data transmitted to third parties?** No (Drive content and email content never transmitted; HIBP receives only a 5-char hash prefix; Plausible receives coarse opt-in events only).
  - *Verification:* Screenshot the completed Privacy Practices form and store it in `docs/store-listing/privacy-practices-screenshot.png` before submission.

---

## S3 — Store Listing & Single Purpose

> Dashboard section: **Store listing** tab. Reviewer reads this to evaluate Single Purpose Policy compliance and consumer-language discipline.

- [ ] **S3-1.** **Short description** (≤132 characters, shown in search results) uses the binding one-liner from `spec.md §5`:
  > *"Know what's exposed. Stop it before it leaves."*
  Verify the character count: `echo -n "Know what's exposed. Stop it before it leaves." | wc -c` → must be ≤132.
  - *PRD:* §1 — "One-liner: 'Know what's exposed. Stop it before it leaves.'"
  - *Verification:* Character count check. Must not contain any banned term from the copy linter (Constitution §IV).

- [ ] **S3-2.** **Long description** (≤16,000 characters) covers all seven modules using consumer framing from the PRD module framings. Forbidden terms (DLP, PII, regex, HIPAA, GDPR, classifier, OAuth scope) must not appear. The description must include:
  - The single-purpose statement (see S3-3)
  - One paragraph per module in consumer language
  - The privacy guarantee ("Everything scans on your device — nothing is uploaded")
  - A "What's included free" section aligned to `spec.md §5` tier matrix
  - *Constitution:* §IV — consumer language everywhere
  - *Verification:* `node scripts/lint-copy.mjs --source docs/store-listing/description.md` — banned-terms check against the description file. Manual review for jargon. Character count check.

- [ ] **S3-3.** **Single purpose statement** is documented in `docs/store-listing/justifications.md` and must be used verbatim in the Web Store submission's "Single purpose" declaration field:
  > *"Scan the user's own documents, emails, and Drive files to detect exposure of their own personal data."*
  All seven modules (Document Check, Email Guardian, Drive Audit, Calendar Audit, Exposure Radar, My Protection Rules, Privacy Toolkit) are expressions of this single purpose and must be demonstrably so in the long description.
  - *Engineering-QA:* Q6 — "'Single purpose' policy: Single purpose statement: 'Scan the user's own documents, emails, and Drive files…'"
  - *Verification:* Cross-check every module's long-description paragraph against the single-purpose statement. Each paragraph's first sentence should relate scanning or exposure detection directly to user-owned data.

- [ ] **S3-4.** **Category** is set to **"Productivity"** in the Web Store dashboard (the most accurate available category for a personal data-protection extension; "Privacy & Security" is not a Chrome Web Store category as of 2025 — use Productivity or Search Tools).
  - *Verification:* Dashboard category field set before submission.

- [ ] **S3-5.** **Languages** declared in the dashboard match the locales in `_locales/`: English and Greek (el). The store listing text itself is provided in English; a Greek translation of the short and long descriptions is prepared in `docs/store-listing/description-el.md` for the localized listing.
  - *Spec:* NFR-I1 — EN + EL at launch
  - *Verification:* `docs/store-listing/description-el.md` exists and passes `node scripts/lint-copy.mjs --source docs/store-listing/description-el.md`. Greek listing submitted in the dashboard's "Languages" section.

- [ ] **S3-6.** **Official website URL** in the dashboard points to a live page that includes a visible link to the privacy policy. The page must be live (HTTP 200) before submission.
  - *Engineering-QA:* Q6 — "homepage" is required for OAuth app verification
  - *Verification:* `curl -I https://<homepage-url>` → HTTP 200. Page HTML contains `<a href="...privacy-policy...">`.

---

## S4 — Promotional Assets

> Dashboard section: **Store listing** tab → **Graphic assets**. All images must be PNG, no alpha transparency, no misleading or exaggerated claims.

### S4a — Extension Icon

- [ ] **S4-1.** Extension icon uploaded to the Web Store is **128 × 128 px PNG** (RGB, no alpha channel in the store-listing version; the `action` icon may have alpha). This is the `assets/icon-128.png` file from the manifest, confirmed to be exactly 128 × 128 px.
  - *Verification:* `python3 -c "from PIL import Image; im=Image.open('assets/icon-128.png'); assert im.size==(128,128), im.size"`. Must match the icon declared in `src/manifest.ts`.

- [ ] **S4-2.** The icon visually communicates "protection / privacy" without using trademarked symbols (shield shapes from other products), NSFW imagery, or photorealistic human faces. It is legible at 16 × 16 px (the toolbar size).
  - *Constitution:* §XIV — "Decide whether to commission an exclusive ShieldMe wordmark/logo… or use a typographic mark in Manrope 800 — current default is the typographic mark"
  - *Verification:* Visual review at 16 px scale. Legal review: no trademark conflicts with existing shield-branded extensions.

### S4b — Screenshots

The Web Store requires **at least 1** and accepts up to **5 screenshots per locale**. Dimensions: **1280 × 800 px** or **640 × 400 px** (exactly; no other sizes). PNG or JPEG.

- [ ] **S4-3.** At least **5 screenshots** are prepared, one per core scenario. Each is 1280 × 800 px. Required scenes (minimum set):

  | # | Scene | Key elements to show |
  |---|---|---|
  | 1 | Dashboard — clean state | Exposure Score, 6 category toggles, module nav |
  | 2 | Document Check — scan in progress | File name, scan-state indicator ("Scanning — checking N protections"), privacy guarantee lockmark |
  | 3 | Document Check — Exposure Report | FindingCard with Critical severity (icon + text + color), score, filename |
  | 4 | Email Guardian — warning modal | Modal with finding, [Go Back & Review] / [Send Anyway] CTAs, severity badge |
  | 5 | Drive Audit — results | File list with permission severity badges, Critical cross-reference finding |

  - *Engineering-QA:* Q6 — "screenshots, 90-second walkthrough video, promo tiles" listed as submission artifacts
  - *PRD:* §4.3 Exposure Report design; §5.1 email guardian modal design; §6 Drive Audit framing
  - *Verification:* `python3 -c "from PIL import Image; im=Image.open('docs/store-listing/screenshot-01.png'); assert im.size==(1280,800)"` for each screenshot. Store in `docs/store-listing/screenshots/`.

- [ ] **S4-4.** Screenshots show **no real user data, no real email addresses, no real file contents**. All PII in screenshots uses clearly fictitious data (e.g., "Jane Sample", IBAN `GB29NWBK60161331926819` which is the standard test IBAN, email `user@example.com`).
  - *Constitution:* §I — privacy-first; no PII exfiltration even in marketing materials
  - *Verification:* Manual review of all screenshot files. Run `scanText` on the extracted screenshot text (via OCR) and assert no real PII patterns are found.

- [ ] **S4-5.** Screenshots do not make unsubstantiated claims. Prohibited: exact timing claims not verified ("Scans in 0.5 seconds"), percentage improvement claims, competitor comparisons. Permitted: feature descriptions shown in action.
  - *Verification:* Legal/product review of all screenshot overlay text.

- [ ] **S4-6.** A **Greek locale screenshot set** (same five scenes, UI in Greek) is prepared and uploaded in the Greek locale section of the dashboard.
  - *Spec:* NFR-I1 — EN + EL at launch
  - *Verification:* `docs/store-listing/screenshots-el/` directory contains 5 PNG files at 1280 × 800 px.

### S4c — Promotional Tiles

- [ ] **S4-7.** **Small promotional tile: 440 × 280 px PNG**. Content: ShieldMe wordmark, tagline ("Know what's exposed. Stop it before it leaves."), the brand teal color (`--color-brand-500 #1F8C7C`). No screenshots embedded. No text smaller than 18 px equivalent.
  - *Engineering-QA:* Q6 — "promo tiles" listed as submission artifact; stored in `docs/store-listing/`
  - *Verification:* `python3 -c "from PIL import Image; im=Image.open('docs/store-listing/promo-440x280.png'); assert im.size==(440,280)"`.

- [ ] **S4-8.** **Marquee promotional tile: 1400 × 560 px PNG** (used if the extension is featured). Same brand discipline. No screenshots embedded. Safe zone: keep all text and logos within the inner 1120 × 448 px (80% of each dimension) to account for responsive cropping.
  - *Verification:* `python3 -c "from PIL import Image; im=Image.open('docs/store-listing/promo-1400x560.png'); assert im.size==(1400,560)"`.

### S4d — Walkthrough Video

- [ ] **S4-9.** A **90-second walkthrough video** is produced and the YouTube URL is added to the Web Store listing. The video covers in sequence:
  1. First-run flow: install → preset picker → dashboard (≤20 s)
  2. Document Check: drop a PDF, see the Exposure Report with a Critical finding (≤20 s)
  3. Email Guardian: compose an email with a test IBAN, hit Send, see the warning modal (≤20 s)
  4. Drive Audit: connect, run audit, see a public-file Critical cross-reference finding (≤20 s)
  5. Delete all my data: Settings → wipe → first-run state (≤10 s)
  - *Engineering-QA:* Q6 — "90-second walkthrough video" listed as submission artifact; also required for Google OAuth app verification (S5)
  - *Verification:* Video duration ≤100 s (10% buffer). YouTube URL resolves. Video is unlisted (not private). Video contains no real user data.

---

## S5 — OAuth Verification & Google Limited Use Disclosure

> Applies to Drive Audit (Google Drive API scopes). This section gates the **public launch of Drive Audit**, not the initial store submission. *(M3 gate)*

- [ ] **S5-1.** **`docs/legal/limited-use.md`** is written, published at a public URL, and contains explicit statements for all four Google Limited Use requirements:
  1. Drive/Gmail data is used only to provide the stated privacy-scanning service directly requested by the user.
  2. No human at ShieldMe reads user files.
  3. Drive/Gmail data is not transferred to any third party (analytics receive only coarse, non-identifying events).
  4. Drive/Gmail data is not used for any secondary purpose (advertising, profiling, resale).
  - *Engineering-QA:* Q6 — "Limited Use Disclosure: Mandatory for Drive scopes. Published at `docs/legal/limited-use.md`, linked from options page and Web Store listing."
  - *Privacy checklist:* P7-2
  - *Verification:* `curl -I https://<limited-use-url>` → HTTP 200. Manual review of all four points. Link appears in the Options page footer and in the Web Store listing description.

- [ ] **S5-2.** The **privacy policy** (`docs/legal/privacy-policy.md`, published at a public URL) explicitly names each Google API scope by name and purpose:
  - `drive.metadata.readonly` — "Read file names, MIME types, and sharing permissions to identify exposed files"
  - `drive.readonly` — "Read file content to scan for personal data you may have exposed"
  - `drive` (write, requested separately) — "Change sharing settings on files you choose to fix"
  - The privacy policy also describes the DOM-only Email Guardian approach: "We read compose window content in Gmail only at the moment you click Send, using the page DOM — no Gmail API scope is used."
  - *Engineering-QA:* Q6 — "Privacy policy names Drive scopes explicitly."
  - *Privacy checklist:* P3-1, P3-2
  - *Verification:* `grep -i "drive.metadata.readonly\|drive.readonly" docs/legal/privacy-policy.md` — must return matches. Manual review of the Gmail section.

- [ ] **S5-3.** The **Google OAuth app verification** process is initiated at **Month 3** (not Month 5). Required pre-verification artifacts are prepared before the Month 3 milestone:
  - [ ] Homepage URL live (HTTP 200) with visible ShieldMe branding and privacy policy link
  - [ ] Privacy policy URL live (HTTP 200)
  - [ ] `docs/legal/limited-use.md` URL live (HTTP 200)
  - [ ] The 90-second walkthrough video (S4-9) is available as an unlisted YouTube video
  - [ ] CASA (Cloud Application Security Assessment) Tier 2 questionnaire submitted
  - *Engineering-QA:* Q6 — "Google OAuth app verification: CASA assessment, homepage, privacy URL, demo video. Budget 2–4 weeks."
  - *Threat model:* R-HIGH-5 — "Web Store rejection on `identity` scope"
  - *Verification:* Project milestone tracker. This item is a hard blocker at the M3 release gate. **Drive Audit must not ship publicly before OAuth verification is approved.**

- [ ] **S5-4.** The **Options page** contains a visible, clickable link to `docs/legal/limited-use.md` in its footer or Privacy section. The link text is "Google API Limited Use disclosure" or equivalent plain-language label. This is a Google OAuth verification requirement.
  - *Engineering-QA:* Q6 — limited-use disclosure "linked from options page and Web Store listing"
  - *Accessibility checklist:* A8-1 — link must be in `_locales/en/messages.json` (not hardcoded)
  - *Verification:* E2E test: navigate to Options page; assert a link with href pointing to the limited-use URL is present in the DOM.

- [ ] **S5-5.** The Drive OAuth consent screen (shown to users via `chrome.identity.launchWebAuthFlow`) is configured with:
  - **Application name:** ShieldMe
  - **Application logo:** the 128 × 128 px icon
  - **Support email:** a monitored support address (not a personal Gmail)
  - **Privacy policy link:** the live privacy policy URL
  - *Engineering-QA:* Q6 — OAuth app configuration requirements
  - *Verification:* Google Cloud Console → OAuth consent screen — all four fields populated. Screenshot stored in `docs/store-listing/oauth-consent-screen.png`.

---

## S6 — Legal Artifacts

> Pre-submission artifacts that must exist and be live before the zip is uploaded.

- [ ] **S6-1.** **`docs/legal/privacy-policy.md`** is published at a stable public URL (e.g., `https://shieldme.io/legal/privacy-policy`). The URL is the same URL entered in the Web Store dashboard "Privacy policy" field. Changing this URL after submission requires re-review.
  - *Engineering-QA:* Q6 — "privacy-policy.md: public URL, names every permission and why"
  - *Verification:* `curl -I https://<privacy-policy-url>` → HTTP 200. URL entered in the Chrome Web Store developer dashboard "Privacy policy URL" field. `grep "activeTab\|storage\|sidePanel\|offscreen\|identity\|mail.google.com\|haveibeenpwned\|googleapis.com" docs/legal/privacy-policy.md` — all declared permissions appear by name.

- [ ] **S6-2.** **`docs/store-listing/justifications.md`** is complete with one paragraph per declared permission: `activeTab`, `storage`, `sidePanel`, `offscreen`, `identity` (optional), `mail.google.com`, `haveibeenpwned.com`, `api.pwnedpasswords.com`, `googleapis.com/drive/v3`, `accounts.google.com`, `oauth2.googleapis.com`. Each paragraph covers: (a) what it enables, (b) why no less-privileged alternative exists, (c) the minimum scope used.
  - *Engineering-QA:* Q6 — "docs/store-listing/justifications.md — one paragraph per permission explaining necessity, non-alternatives, and minimal scope"
  - *Verification:* `grep -c "^##" docs/store-listing/justifications.md` — must return ≥11 (one section per permission). Manual review of each section for completeness.

- [ ] **S6-3.** **`docs/legal/limited-use.md`** is published at a stable public URL and linked from:
  - The Options page footer (S5-4)
  - The Chrome Web Store listing long description (last paragraph or dedicated section)
  - The privacy policy (cross-reference)
  - *Engineering-QA:* Q6 — limited-use disclosure artifacts
  - *Verification:* Three `grep` commands confirm the URL appears in: `src/options/**` (TSX/HTML), `docs/store-listing/description.md`, and `docs/legal/privacy-policy.md`.

- [ ] **S6-4.** *(re-check on update)* The privacy policy and limited-use disclosure **version date** is updated whenever: a new permission is added, a new external host is added to the egress allowlist, or a new Google API scope is requested. Stale documents (last-updated > 90 days before a release that touches permissions) block submission of that release.
  - *Threat model:* threat-model.md §8 — "Any new external host added to the egress allowlist [requires updating the threat model]"; same discipline applies to legal docs
  - *Verification:* `git log --since="90 days ago" -- docs/legal/privacy-policy.md` returns at least one commit whenever a permission-touching PR was merged in the same period.

---

## Submission Sign-off

> Both sign-offs are required before the zip is uploaded to the Chrome Web Store developer dashboard.

| Area | Items covered | Eng sign-off | Product sign-off |
|---|---|---|---|
| Manifest & package integrity | S1-1 through S1-8 | | |
| All permission justifications written | S2-1 through S2-9 | | |
| Privacy Practices form completed | S2-10 | | |
| Store listing text (consumer language, single purpose) | S3-1 through S3-6 | | |
| All 5 screenshots at correct dimensions | S4-3, S4-4 | | |
| Promotional tiles prepared | S4-7, S4-8 | | |
| Walkthrough video produced and linked | S4-9 | | |
| Privacy policy live at public URL | S6-1 | | |
| Justifications file complete (11 permissions) | S6-2 | | |
| *(M3 gate)* OAuth verification initiated | S5-3 | | |
| *(M3 gate)* Limited Use disclosure live | S5-1, S5-4 | | |

---

*This checklist is normative. Items marked `[!]` block submission. Items marked `[-]` require a one-line justification. Items marked *(M3+)* or *(re-check on update)* are re-evaluated at each release.*
