# Backlog — Post-v1.0 Feature Roadmap

**Status:** binding · **Updated:** 2026-05-12

Features I considered, judged not essential for v1.0, and parked here with structured entries. Each is one `/speckit.specify` invocation away from becoming `specs/00X-<feature-name>/spec.md` once it graduates.

**Graduation criteria for any backlog item:** the feature has (a) a clear measurable user signal demanding it, (b) a written cost-of-not-shipping the founder is willing to accept, (c) a fit with the constitution that requires no amendment OR an amendment proposal accompanying it, (d) capacity in the next phase plan.

---

## 1. Format per entry

```
ID: BL-<area>-<slug>
Title: <consumer label>
Intent: One sentence, plain language.
Why backlogged: <why not v1.0>
Constitution fit: <conformant | requires amendment X>
Tier (if it ships): Free / Basic / Pro
Dependencies: <other backlog or shipped features it needs>
Graduation trigger: <what signal moves this to in-progress>
```

---

## 2. Backlog items

### 2.0 Platform variants

#### BL-platform-chrome-extension
**Title:** Chrome MV3 extension (revival of the pre-pivot scope)
**Intent:** Ship a Chrome MV3 extension that adds Email Guardian outbound (Gmail compose intercept), Cloud Audit content-script for Drive share dialogs, and the kill-switch selector system. Reuses ~90% of the web app's code (detection engine, parsers, detectors, presets, exposure score, UI components, design tokens).
**Why backlogged:** Pivoted 2026-05-17 to web app for portfolio/sharing reasons. Extension adds 4–6 weeks of Chrome Web Store + OAuth verification; web app ships in 24 hours.
**Constitution fit:** requires reviving §III "Least-Privilege Permissions" (activeTab, storage, optional host_permissions) and §XVI "Web-App Deployment Posture" carve-out.
**Tier:** any (same matrix as web app).
**Dependencies:** web app shipped and product-market fit signaled.
**Graduation trigger:** explicit founder decision after web app reaches >5,000 MAU OR a clear user demand signal for the always-on protection that the extension uniquely enables.

#### BL-email-gmail-content-script
**Title:** Email Guardian — outbound intercept on Gmail compose
**Intent:** The original Email Guardian that intercepts Send clicks in Gmail, scans body+subject+recipients+attachments via the detection engine, presents a warning modal with Go Back / Send Anyway. Requires DOM cascade selectors per `engineering-qa.md` Q1 strategy, the kill-switch selector update mechanism, and Chrome MV3 content scripts.
**Why backlogged:** This is the keystone feature parked with the extension pivot. The web app's email module is paste-or-upload-.eml instead.
**Constitution fit:** requires `BL-platform-chrome-extension` to graduate first.
**Tier:** any.
**Dependencies:** `BL-platform-chrome-extension`.
**Graduation trigger:** along with `BL-platform-chrome-extension`.

#### BL-kill-switch-system
**Title:** Ed25519-signed selector kill-switch for Gmail content script
**Intent:** Remote-update mechanism for Gmail compose selectors when Gmail's DOM changes. Ed25519 signature verification with the public key pinned in code. Payload ≤4 KB, ±24h skew, selectors only.
**Why backlogged:** Only useful with a content script on `mail.google.com`. Dead in the web app variant.
**Constitution fit:** requires `BL-platform-chrome-extension` to graduate first. Reuses the Sonnet-built `src/security/kill-switch.ts` + `kill-switch-keys.ts` source code parked under that backlog item.
**Tier:** any.
**Dependencies:** `BL-platform-chrome-extension`, `BL-email-gmail-content-script`.
**Graduation trigger:** along with `BL-email-gmail-content-script`.

#### BL-pwa-offline
**Title:** Progressive Web App offline mode
**Intent:** Service worker registered at runtime that caches the SPA shell for offline use. App opens and runs without network (HIBP / Drive calls require online).
**Why backlogged:** v1.0 ships as a standard SPA. Service-worker complexity (cache invalidation, update flow) isn't worth the offline payoff for a privacy-audit-tool that mostly needs detection (which doesn't require network) but the Drive/HIBP integrations do.
**Constitution fit:** conformant.
**Tier:** Free+.
**Dependencies:** v1.0 shipped.
**Graduation trigger:** user request for offline use.

### 2.1 Tier & monetization

#### BL-tier-family
**Title:** Family / household licensing
**Intent:** A single subscription covers up to 5 household members with separate per-person protections under one billing.
**Why backlogged:** Removed from v1.0 (2026-05-12 directive). Multi-account in Pro covers the multi-life use case without household-licensing infrastructure. Family adds Stripe-side complexity (seat management, invitation flows, per-seat tier inheritance) that isn't justified before product-market fit.
**Constitution fit:** conformant (Constitution §VI tier-agnostic core supports it without amendment).
**Tier:** new "Pro Family" tier at €11.99/mo.
**Dependencies:** Stripe customer-on-customer relations, an invitation flow with email verification (would require the Cloudflare Worker to grow a second endpoint).
**Graduation trigger:** Pro converts >10% of Basic users AND >5 support tickets requesting household licensing in any 60-day window.

#### BL-tier-business
**Title:** Business / SMB tier
**Intent:** A tier for sole-proprietors and small businesses (2–25 seats) with admin dashboard, seat management, billing consolidation.
**Why backlogged:** Constitution §VI is consumer-first. Business introduces enterprise concerns (audit logging, SSO, admin policies, billing centralization) that bloat the core.
**Constitution fit:** requires amendment (introduces a multi-tenant concept).
**Tier:** new "Business" tier at €19.99/seat/mo.
**Dependencies:** SAML/SSO (would require a server), admin dashboard (a real web app, not just the extension).
**Graduation trigger:** inbound demand from >25 prospective business customers; product-led growth to >50K monthly Pro users.

### 2.2 Detection & coverage

#### BL-detect-ml-classifier
**Title:** Trainable classifier for fuzzy detection
**Intent:** On-device ML inference for categories where regex+checksum fails (résumés, medical records, generic "this looks personal").
**Why backlogged:** R32. WebGPU + tensorflow.js bundle cost is large; training corpus doesn't exist; Chrome's built-in `chrome.ai.*` API is experimental.
**Constitution fit:** conformant (client-side inference).
**Tier:** Pro.
**Dependencies:** Chrome built-in AI APIs reaching stable, or a small on-device model under 5 MB.
**Graduation trigger:** Chrome ships `chrome.ai.*` as stable AND a privacy-tuned classifier corpus is available.

#### BL-detect-ocr
**Title:** OCR for images (PNG / JPG / TIFF)
**Intent:** Document Check accepts images and OCRs them client-side.
**Why backlogged:** R25 — Tesseract.js eats 14 MB of bundle. Deferred to v1.5 with Premium audience.
**Constitution fit:** conformant.
**Tier:** Basic + Pro.
**Dependencies:** bundle-size headroom (currently 7 MB free at v1.0 baseline).
**Graduation trigger:** v1.5 release window.

#### BL-detect-bip39
*Already shipped in v1.0 detector catalog §10.5 — not backlogged.* (kept here as a placeholder to show the catalog graduates items into spec)

### 2.3 New modules

#### BL-module-bank-statement
**Title:** Bank statement parser
**Intent:** Upload a downloaded bank PDF; ShieldMe surfaces transactions that suggest exposed PII (subscriptions to risky services, etc.).
**Why backlogged:** PDF parsing is solved (Module 2), but the heuristics for "this transaction is privacy-relevant" need a curated catalog of risky merchants and a careful UX to avoid feeling judgmental.
**Constitution fit:** conformant (client-side).
**Tier:** Pro.
**Dependencies:** Module 2 (Document Check) shipped; merchant-risk catalog curated.
**Graduation trigger:** 5+ inbound user requests for "scan my bank statements."

#### BL-module-photo-exif-stripper
**Title:** Photo EXIF + GPS stripper
**Intent:** When the user attaches a photo to email/Drive/share, offer to strip EXIF + GPS first.
**Why backlogged:** Bundle-budget call. The EXIF detector is shipped; the *strip-and-replace* flow needs UI in three contexts (Gmail compose, Drive share, Document Check).
**Constitution fit:** conformant.
**Tier:** Basic + Pro.
**Dependencies:** EXIF detector (shipped), Module 3 + Module 4 plumbing.
**Graduation trigger:** v1.1.

#### BL-module-extension-audit-actions
**Title:** Browser Extension Audit — recommend / disable actions
**Intent:** Beyond the read-only audit (shipped in Privacy Toolkit), allow the user to disable risky extensions from inside ShieldMe.
**Why backlogged:** Requires `management` permission with write capability, which raises the permission profile. Read-only audit ships v1.0; write-action is gated until traction justifies the permissions ask.
**Constitution fit:** conformant (added permission, on-demand, justified).
**Tier:** Pro.
**Dependencies:** Extension Audit (shipped read-only in v1.0 Privacy Toolkit).
**Graduation trigger:** >20% of Pro users invoke Extension Audit; >10% request a "disable this for me" action.

#### BL-module-keyring
**Title:** 2FA recovery code vault
**Intent:** Encrypted local vault for the things people forget: 2FA backup codes, FIDO2 recovery, OAuth scope receipts.
**Why backlogged:** Adjacent to ShieldMe's mission (privacy ≠ credential management) and starts to overlap with password managers. Risk of mission creep.
**Constitution fit:** conformant (client-side, encrypted).
**Tier:** Basic + Pro.
**Dependencies:** None.
**Graduation trigger:** mission realignment; not before v2.

#### BL-module-google-history-audit
**Title:** Browser-history privacy report
**Intent:** Opt-in scan of the user's Chrome history (last 7 days) to find URLs where they may have leaked PII (search queries, free tax tools, etc.).
**Why backlogged:** Requires `history` permission. Constitution §III is hard on permissions; adding `history` is a real ask justifying additional Chrome Web Store review attention.
**Constitution fit:** requires explicit constitutional justification.
**Tier:** Pro.
**Dependencies:** none.
**Graduation trigger:** v1.5+; explicit user research that this fills an unmet need.

### 2.4 Module enhancements

#### BL-mod-radar-dark-web
**Title:** Dark web monitoring (real, not stub)
**Intent:** Replace the "Notify me" stub with actual dark-web monitoring via a third-party provider that respects the user's identity (HIBP doesn't offer dark-web; SpyCloud / Constella do).
**Why backlogged:** Real dark-web monitoring requires sending the user's email to a third party; not k-anonymizable. Constitution §I tension. Acceptable if user opts in with explicit per-search consent (similar to HIBP-key flow).
**Constitution fit:** conformant *if* per-search opt-in with explicit warning copy.
**Tier:** Pro.
**Dependencies:** chosen vendor + their pricing/T&Cs accepted.
**Graduation trigger:** vendor selected; pricing model fits ShieldMe Pro margin; user demand signal ≥5 inbound requests.

#### BL-mod-radar-passport-leak
**Title:** Passport-number leak monitoring
**Intent:** Periodic check of major breach databases for the user's passport number specifically (different from email check).
**Why backlogged:** No equivalent of HIBP for passport numbers; requires a vendor relationship.
**Constitution fit:** conformant if vendor accepts hashed inputs.
**Tier:** Pro.
**Dependencies:** vendor.
**Graduation trigger:** vendor identified.

#### BL-mod-drive-fix-bulk
**Title:** Drive bulk fix actions
**Intent:** "Remove public link from all 23 files in this folder" as a single action.
**Why backlogged:** Drive write-scope is sensitive; bulk operations multiply mistakes; v1.0 ships single-file fix actions and validates UX first.
**Constitution fit:** conformant.
**Tier:** Pro.
**Dependencies:** single-file fix actions (shipped v1.0 Cloud Audit).
**Graduation trigger:** v1.1; >5% of Pro users use single-file fix.

#### BL-mod-share-watermark-stamp
**Title:** Share watermark — embed visible notice in the document
**Intent:** Beyond the Drive *comment* (shipped Pro at v1.0), embed a visible "Personal data inside" notice in the doc itself (DOCX header, PDF watermark, Sheets cell A1 comment).
**Why backlogged:** Modifying user document content has higher risk than comments; needs careful UX to avoid feeling intrusive.
**Constitution fit:** conformant (user-opt-in per file).
**Tier:** Pro.
**Dependencies:** Watermark-on-share comment version (shipped v1.0).
**Graduation trigger:** explicit user request signal.

### 2.5 Compliance & legal helpers

#### BL-compl-export-tracking
**Title:** Data Export Request tracking (post-send)
**Intent:** After the user sends an Article 15 / CCPA letter, track the response window, draft a follow-up if no reply within the legal SLA (30 days in EU).
**Why backlogged:** Shipped at "generator" level for Basic at v1.0; tracking adds local state + scheduled-task complexity. Pro tier gets it next.
**Constitution fit:** conformant.
**Tier:** Pro.
**Dependencies:** Data Export generator (shipped v1.0).
**Graduation trigger:** v1.1.

#### BL-compl-takedown-templates
**Title:** Takedown letter templates (DMCA, right-to-be-forgotten)
**Intent:** Beyond Article 15 (data export), generate letters for content takedown and right-to-be-forgotten requests.
**Why backlogged:** Different legal context per jurisdiction; needs local-law review per country (12 Tier-1 countries = 12 reviews).
**Constitution fit:** conformant.
**Tier:** Pro.
**Dependencies:** legal review.
**Graduation trigger:** user demand + legal-review capacity.

### 2.6 UX & onboarding

#### BL-ux-mobile-companion
**Title:** Mobile companion (read-only)
**Intent:** A mobile web app (or PWA) that lets users view their Exposure Score, broker checklist, and findings on the go. Read-only; no scanning.
**Why backlogged:** Chrome mobile has no extensions; building a separate mobile app is a different product. PWA fed by a shared backend would break Constitution §I.
**Constitution fit:** requires amendment (introduces a server).
**Tier:** Pro.
**Dependencies:** server infrastructure; sync layer (which is itself a separate constitutional question).
**Graduation trigger:** explicit founder decision to introduce a server.

#### BL-ux-cross-device-sync
**Title:** Cross-device preference sync
**Intent:** Settings and broker progress sync across the user's Chrome installs (work laptop + home laptop).
**Why backlogged:** Requires a server (Constitution §I conflict) or `chrome.storage.sync` (data leaves device — also §I). E2E-encrypted sync via user-controlled key is possible but expensive.
**Constitution fit:** requires amendment.
**Tier:** Pro.
**Dependencies:** identity (shipped v1.0), server or E2E-encrypted sync infrastructure.
**Graduation trigger:** founder decision; user demand signal.

#### BL-ux-natural-language-summary
**Title:** On-device LLM summaries of findings
**Intent:** "What does this mean for me?" — a natural-language explanation per finding using Chrome's built-in AI.
**Why backlogged:** Chrome built-in AI APIs not stable enough yet.
**Constitution fit:** conformant (on-device).
**Tier:** Pro.
**Dependencies:** Chrome stable AI APIs.
**Graduation trigger:** Chrome ships `chrome.ai.*` stable.

### 2.7 Quality of life

#### BL-qol-clipboard-warning
**Title:** Sensitive clipboard warning
**Intent:** Warn when sensitive content is on the clipboard for a long time (other extensions could read it).
**Why backlogged:** UX risk — likely to be annoying without huge fine-tuning effort. Opt-in deeply but still adds noise.
**Constitution fit:** conformant.
**Tier:** Pro.
**Dependencies:** none.
**Graduation trigger:** user request signal; UX research that this isn't annoying.

#### BL-qol-redact-button-everywhere
**Title:** "Redact this" inline action across web pages
**Intent:** When the user selects text on any page (with a host permission allowlist), offer to "Redact this" — opens a clipboard / paste-target where the redacted version is available.
**Why backlogged:** Requires content-script presence on more hosts. Constitution §III caution.
**Constitution fit:** conformant only with a curated, user-opt-in host list (similar to Privacy Toolkit's form-fill heuristics).
**Tier:** Pro.
**Dependencies:** none.
**Graduation trigger:** v1.5+.

#### BL-qol-scheduled-reports
**Title:** Scheduled PDF reports by email
**Intent:** "Email me my Exposure Report every month."
**Why backlogged:** Sending email requires either user SMTP credentials (Constitution conflict) or a server we control (Constitution conflict). Alternative: render PDF, save locally, surface a notification when ready.
**Constitution fit:** conformant only as "save locally + notify."
**Tier:** Pro.
**Dependencies:** Pro tier shipped.
**Graduation trigger:** v1.1.

### 2.8 Integrations

#### BL-int-1password
**Title:** 1Password Watchtower integration
**Intent:** Cross-reference ShieldMe findings with the user's 1Password Watchtower data (breached passwords, reused passwords).
**Why backlogged:** 1Password is closed-source; no public consumer API for Watchtower data; would require browser-extension-to-browser-extension communication which Chrome blocks.
**Constitution fit:** conformant.
**Tier:** Pro.
**Dependencies:** 1Password partnership or new API.
**Graduation trigger:** 1Password introduces a public Watchtower API.

#### BL-int-bitwarden
**Title:** Bitwarden vault scan
**Intent:** Same as 1Password but for Bitwarden.
**Why backlogged:** Same dependency issue. Bitwarden has an API but consumer flows need OAuth.
**Constitution fit:** conformant.
**Tier:** Pro.
**Dependencies:** Bitwarden consumer OAuth.
**Graduation trigger:** Bitwarden ships consumer OAuth.

#### BL-int-mozilla-monitor
**Title:** Mozilla Monitor (formerly Firefox Monitor)
**Intent:** Alternative to HIBP for users who prefer Mozilla's reputation.
**Why backlogged:** Mozilla Monitor's API is in beta; consumer-API maturity unclear.
**Constitution fit:** conformant.
**Tier:** any (additional radar provider).
**Dependencies:** Mozilla Monitor stable API.
**Graduation trigger:** API stable + reasonable rate limits.

### 2.9 Provider expansions

#### BL-prov-dropbox
**Title:** Dropbox cloud storage provider
**Intent:** `CloudStorageProvider` implementation for Dropbox.
**Why backlogged:** Consumer market share too small to prioritize before Google + Microsoft are solid.
**Constitution fit:** conformant.
**Tier:** any.
**Dependencies:** Microsoft provider stable (M6).
**Graduation trigger:** user demand signal ≥10 requests.

#### BL-prov-box
**Title:** Box cloud storage provider
**Intent:** `CloudStorageProvider` implementation for Box.
**Why backlogged:** Consumer market share even smaller than Dropbox.
**Constitution fit:** conformant.
**Tier:** any.
**Dependencies:** Microsoft provider stable.
**Graduation trigger:** explicit demand signal.

#### BL-prov-proton
**Title:** Proton Drive + Proton Mail providers
**Intent:** Support the privacy-positioned Proton ecosystem.
**Why backlogged:** Proton's API is encrypted-at-rest with the user's key; integrating means accepting the user's Proton credentials in the extension (or running their key-derivation flow, which is non-trivial).
**Constitution fit:** conformant if Proton ships a consumer OAuth flow.
**Tier:** any.
**Dependencies:** Proton consumer OAuth (in beta as of 2026).
**Graduation trigger:** Proton stable OAuth.

### 2.10 Localization

#### BL-loc-fr
**Title:** French localization
**Why backlogged:** v1.0 ships EN + EL; FR queued.
**Tier:** any.
**Graduation trigger:** M6.

#### BL-loc-de / BL-loc-es / BL-loc-pt / BL-loc-it
Same shape as `BL-loc-fr`; M6+ rolling rollout.

---

## 3. Graduation workflow

When a backlog item graduates:

1. Author runs `/speckit.specify "<intent text>"` creating `specs/00X-<feature>/`.
2. The backlog entry here is updated with `Status: graduated → specs/00X-<feature>/`.
3. If the feature requires a constitutional amendment, the amendment PR ships first and the spec PR depends on it.
4. The feature joins the phased delivery plan at the next planning checkpoint.

## 4. What is NOT in the backlog

- `<all_urls>` host permission features (Constitution §III hard ban).
- IMAP/SMTP credential storage (Constitution §I + security posture conflict).
- iCloud Drive / Apple Mail / Yahoo Mail (no consumer API).
- Mobile Chrome (no extensions upstream).
- Anything requiring a persistent ShieldMe-controlled server beyond entitlements (Constitution §I).
- Enterprise SSO, audit logging at the admin level (out of consumer scope).
