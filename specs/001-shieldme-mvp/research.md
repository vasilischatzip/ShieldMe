# Research & Decisions — ShieldMe MVP

Records decisions with rationale and alternatives considered. Companion to [plan.md](./plan.md). Answers to PRD §22 open questions live in [../../docs/engineering-qa.md](../../docs/engineering-qa.md) and are not repeated here.

---

## R1. Why Preact over React or vanilla JS?

**Decision:** Preact 10 + `@preact/signals`.
**Why:** 15 KB vs React's 45 KB minified. Signals remove the need for a store library. API is React-compatible so docs and typings are abundant.
**Rejected:** React (too big for a popup bundle budget); Svelte (compiler magic complicates CSP and offscreen loading); vanilla JS (loses reactivity, increases per-module boilerplate).

## R2. Why pnpm?

**Decision:** pnpm 9.
**Why:** Strict lockfile prevents phantom deps (security-relevant for a privacy tool). Disk-efficient for CI. Claude Code's default in many projects.

## R3. Why Vite + `@crxjs/vite-plugin`?

**Decision:** Vite with the CRXJS extension plugin.
**Why:** HMR in MV3 is genuinely hard; CRXJS solves it. Produces correctly-transformed manifest + content scripts out-of-the-box.
**Rejected:** webpack (slower, more config); esbuild standalone (no extension-specific helpers); rollup (CRXJS wraps rollup anyway).

## R4. Offscreen documents vs running parsers in the service worker?

**Decision:** Offscreen document for all heavy parsing (pdf.js, Tesseract, mammoth, SheetJS).
**Why:** MV3 service workers lack `DOMParser`, `createImageBitmap` for some code paths, and are terminated after 30 s idle. Offscreen documents persist for the reason we declare (`DOM_PARSER`, `WORKERS`) and have full DOM APIs.
**Rejected:** Pure SW parsing (pdf.js partially works but mammoth and jsPDF do not); popup-hosted parsing (dies when popup closes).

## R5. Storage split — `chrome.storage.local` vs IndexedDB?

**Decision:**
- `chrome.storage.local`: preferences, rule toggles, whitelists, encrypted API keys, tier status, broker-site progress. Small and fast.
- IndexedDB (via `idb`): scan history, Drive audit cache, Tesseract traineddata blob, community feedback queue.
**Why:** `chrome.storage.local` has a soft quota (~10 MB historically, larger now) and syncs across the same-profile service-worker wake. IDB handles blobs and large caches gracefully.
**Rejected:** `chrome.storage.sync` — leaks data to Google servers, conflicts with Constitution §I.

## R6. Encryption model for API keys

**Decision:** AES-GCM 256 via Web Crypto. Key derived from a per-install random seed stored alongside the wrapped key. User-facing password unlock: **not** in MVP — the OS-level Chrome profile already gates access; adding a master password is future work.
**Why:** Simpler for MVP, matches PRD expectations. Wrapping makes copy-paste of raw `chrome.storage` useless to a casual attacker.
**Tradeoff acknowledged:** Malicious extensions on the same Chrome profile could theoretically read decrypted keys. MVP mitigation: minimal time keys live in memory; zero log statements for key material; CI scan for accidental `console.log` of `ApiKey` objects.

## R7. Luhn, mod-97 and checksum choices

**Decision:** Implement validators in pure TS (no dep) under `src/detectors/validators/`:
- `luhn.ts` — for all card brands
- `iban-mod97.ts` — for IBANs
- `afm-checksum.ts` — Greek AFM modulus
- `nif-spain.ts`, `nif-portugal.ts`, `codice-fiscale.ts`
- `ssn-blacklist.ts` — rejects SSA-invalid area numbers (000, 666, 900–999)
**Why:** Small, testable, no dep exposure.

## R8. Detection engine architecture

**Decision:** Detectors are pure functions matching the `Detector` interface (see `contracts/detection-engine.md`). A **registry** maps category toggles → detector IDs. Rule evaluation is a single pass over normalized text: one regex union with named groups, findings enriched by validators and context-window scoring.
**Why:** One-pass scanning scales linearly and is the proven pattern from grepping PII tools. Named groups keep per-match attribution cheap.
**Perf target:** 10,000 chars scanned/ms on mid-range hardware.

## R9. OCR vs cloud vision?

**Decision:** Tesseract.js only. No cloud fallback.
**Why:** Constitution §I. 95% of consumer images are readable by Tesseract with tuning.
**Tradeoff:** Rejects some low-contrast scans. UX: "We couldn't read this image. Try a clearer version."

## R10. Drive scopes — why `drive.metadata.readonly` + `drive.readonly` at audit time?

**Decision:** Two read-only scopes at first audit. Separate one-time upgrade to `drive` (write) at first fix action (Premium only).
**Why:** Metadata scope enumerates; readonly scope reads content for cross-reference. Write scope deferred reduces reviewer friction and user anxiety.
**Rejected:** `drive.file` (only files the app created — doesn't apply); `drive.appdata` (same).

## R11. HIBP email check — why user's own key?

**Decision:** Require user to purchase HIBP API key.
**Why:** HIBP's breachedaccount endpoint is paid ($3.50/mo). We don't proxy (Constitution §I). We don't pay centrally (no server).
**Copy:** "Your HIBP key, never sent to us. Direct browser-to-HIBP call." Verified in egress test.

## R12. DeleteMe — why stub, not integrate?

**Decision:** `BrokerRemovalProvider` interface with two implementations: `ManualProvider` (ships) and `DeleteMeProvider` (scaffold only — typed interface + "Coming soon" UI card, zero network). Real integration activates in Premium (M6+).
**Why:** Interface-first means paid tier is a drop-in `new DeleteMeProvider(key)` swap, not a refactor. Also de-risks: DeleteMe's partner API terms may change before we ship Premium.
**What the stub includes now:** The interface, the card UI, the "Notify me when available" intent capture (stored locally).

## R13. Exposure Score calibration

**Decision:** Use the PRD formula verbatim for MVP. After launch, collect *anonymous* (opt-in) distribution data and recalibrate so the median user lands around 65 (yellow).
**Why:** Keeps initial shipping simple; calibration iterates post-launch.

## R14. Share card — ensuring zero PII

**Decision:** Two-layer guarantee:
1. Component accepts only `{ score, criticalCount, warningCount, url }` props. No detector match string accessible.
2. Regression test: render card, extract pixels with OCR, run all active detectors over result, assert zero matches.
**Why:** "No PII" is a marketing promise. Must be testable.

## R15. Community rule requests infra

**Decision:** External Trello board initially; link from extension. Graduate to a Notion public database when count >50.
**Why:** Keeps maintenance zero for MVP. No need to build a voting server.

## R16. Telemetry schema and transport

**Decision:** Opt-in only, off by default. Events: `feature_used`, `scan_completed` (with `{ file_type, size_bucket, finding_count }` — **never** file name, never content), `tier_gate_hit`, `ocr_performance`. Transport: Plausible self-hosted (EU-hosted) events endpoint. Schema lives in `docs/analytics-schema.md`. Egress allowlist includes Plausible host only when telemetry opted in.
**Why:** Respects Constitution §I and GDPR.

## R17. i18n — what languages at launch?

**Decision:** English (EN) and Greek (EL) at launch — matches PRD §Settings. French, German, Spanish queued for M6.
**Why:** Ownership is in Greek market + global English. Greek has unique detector needs (AFM, ΑΔΤ, AMKA) so i18n + detection are co-developed.

## R18. How do we handle Tesseract traineddata storage?

**Decision:** Ship English `eng.traineddata` inside the extension bundle (~10 MB). Other languages fetched on demand from `https://tessdata.projectnaptha.com/4.0.0/` (Tesseract.js default) only if the user enables a non-English OCR language; cached indefinitely in IDB.
**Why:** Keeps install small while allowing multilingual use.
**Egress implication:** The tessdata URL is added to the allowlist, guarded by a user consent prompt.

## R19. Stripe integration — shape before M6

**Decision:** Abstraction `BillingProvider` with `getEntitlement(userId?: string): Promise<Tier>`. MVP implementation returns `"premium-preview"` for everyone. M6 implementation calls a lightweight Cloudflare Worker (our only server) that mirrors Stripe webhooks → entitlements.
**Why:** Keeps the extension serverless today; introduces the minimum-possible server (entitlement lookup) only when billing is needed.

## R20. CI provider

**Decision:** GitHub Actions.
**Why:** Playwright and `chromium --load-extension` both first-class on Actions. Free for public repos; cheap for private.

## R21. Versioning

**Decision:** SemVer. `0.x` during pre-launch. `1.0.0` at Chrome Web Store approval. Each merged feature spec bumps MINOR.

## R22. Test DOM — happy-dom vs jsdom

**Decision:** happy-dom for Vitest popup tests.
**Why:** ~5× faster cold-start than jsdom on the popup component graph; sufficient API coverage for Preact + Signals + `chrome.*` shims via `sinon-chrome`. jsdom is the fallback if a Preact-specific failure mode appears.
**Rejected:** jsdom (slow cold-start), Playwright-component-only (no unit-test isolation).

## R23. Styling — plain CSS Modules vs Tailwind

**Decision:** plain CSS Modules with a token layer in `src/ui/tokens/`.
**Why:** popup bundle budget is 500 KB; Tailwind's runtime and PostCSS toolchain add ceremony for ~6 popup screens. The token layer is the same primitive Tailwind would consume internally — keeping it standalone makes the MOTA-aligned palette/typography (ask 6) the source of truth without coupling to a CSS framework.
**Rejected:** Tailwind (bundle + toolchain cost), CSS-in-JS (runtime cost + CSP friction with `style-src`), inline styles (no token reuse).

## R24. CRXJS supply-chain risk and fallback

**Decision:** Pin `@crxjs/vite-plugin` to the last known-good minor for the locked Vite version. Maintain a 60-line emergency plugin (`scripts/dev/emit-manifest.mjs`) that emits `manifest.json` from `src/manifest.ts` so a CRXJS regression cannot block a release.
**Why:** CRXJS is functionally single-maintainer; Vite minor bumps have broken it before. The fallback is mechanical (read TS module → JSON.stringify → write to dist) and documented before we need it. The detection engine and offscreen workers don't depend on CRXJS — only HMR ergonomics and content-script bundling do.
**Tradeoff:** When CRXJS is healthy, no overhead. When it's broken, we lose HMR for content scripts and accept full reload until CRXJS recovers.

## R25. Tesseract OCR — defer to v1.5

**Decision:** OCR is removed from MVP. Document Check at launch supports PDF, DOCX, XLSX, CSV, TXT, RTF only. PNG/JPG/TIFF support ships in v1.5 alongside Premium.
**Why:** Tesseract.js ships ~4 MB WASM + ~10 MB English traineddata = ~14 MB on a 25 MB bundle budget. That's 56% of the budget for a feature that empirical Chrome extension data suggests <15% of free-tier users invoke in their first week. Deferring frees the budget for ask 8 features (Drive watermark, inbound phishing scan), removes a supply-chain dep, and aligns OCR's launch with the Premium audience for whom slow scans (5–15 s) are acceptable.
**Migration impact on plan:** `plan.md` §M1 deliverable now reads "PDF/DOCX/TXT/XLSX" without OCR. `parsers/ocr.ts`, the offscreen Tesseract worker, and the OCR-related rows in §FR-D3 (5 MB / 2048 px caps) become v1.5 work. Spec FR-D1 removes PNG/JPG/TIFF from MVP. Bundle-budget gate stays at 25 MB but starts way under it (~5 MB), giving ask-8 features room.
**Rejected alternatives:** Cloud OCR (violates Constitution §I); Chrome's experimental on-device AI OCR (gated behind a flag, not user-facing yet); shipping Tesseract anyway (eats the budget for marginal early-stage user value).

## R33. Security depth — operational controls map (added 2026-05-12)

**Decision:** Pin every Critical/High threat-model risk to one or more enforceable controls in [`security-controls.md`](./security-controls.md). The threat model describes *what could go wrong*; security-controls describes *the engineering invariants that prevent it* with test references and owners. Each control has a CI gate that blocks merge on regression.
**Why:** "We take security seriously" is a slogan without verifiable controls. The threat model alone (R3) was insufficient — engineers reading a PR need to know *which controls a change touches*. The map gives them that pointer.
**Layered defense:** L1 browser sandbox → L2 extension CSP → L3 Trusted Types → L4 process isolation → L5 memory hygiene → L6 per-account derived keys → L7 anti-tamper seals. Bypass of any one layer doesn't expose user data.
**Rejected alternatives:** centralizing controls in the constitution (constitution stays high-level), per-module security docs (scattered, drifts), no map at all (the status quo before this entry, which left R-CRIT-2 memory-hygiene controls implicit).

## R30. Microsoft Purview SIT/DLP parity strategy

**Decision:** ShieldMe adopts Purview's confidence-level taxonomy (`High` / `Medium` / `Low`), proximity-window structure, supporting-keyword counts, and instance-count thresholds verbatim in the `Detector` interface. Numeric values per detector are consumer-tuned (favor low FPR over high recall). Every detector declares its Purview SIT provenance (or `none` for ShieldMe-original). A quarterly parity scorecard (`docs/purview-parity.json`) tracks coverage drift; a CI script blocks releases when Microsoft publishes new SITs not yet triaged.
**Why:** shape-alignment makes ShieldMe's catalog legible to anyone familiar with Purview, gives community contributors a stable yardstick, and protects against marketing claim drift. Value-tuning honors the constitutional FPR ≤2% target which is stricter than Purview's enterprise defaults.
**Rejected:** verbatim Purview values (FPR too high for consumer fatigue), Trainable-Classifier replacement at launch (R32 stub), enterprise-only SIT coverage (no consumer story).

## R31. Tier rework — Free / Basic / Pro (revised 2026-05-12)

**Decision:** Three tiers — **Free** (sticky baseline, 1 account), **Basic** €2.99/mo (single account, full module access at single-life scale), **Pro** €9.90/mo (unlimited accounts + advanced detection + automation). Annual: Basic €24.99/yr, Pro €99.00/yr. Family / household pricing removed from v1.0; tracked in `backlog.md` as `BL-tier-family`.
**Why the change from the 2026-05-09 four-tier proposal:** Bill's directive 2026-05-12 — "remove the family package. Add a single account and multi-accounts." Reframing makes the Basic→Pro conversion ladder cleaner: **multi-account is the Pro differentiator**, not a side benefit. The product story becomes binary at the upgrade point ("protect one life" vs "protect every account that's you") instead of trying to articulate what €4 of additional value buys.
**Why Basic exists at all:** the Free→Pro €0→€9.90 gap is too steep. €2.99 gives users who've adopted Free a small commitment to unlock Calendar Audit, Privacy Toolkit, Share Interception, and the 25 scans/mo cap — all at single-account scope. Conversion data from comparable privacy SaaS (NordPass, 1Password) shows Basic→Pro ladders convert 2-3× better than direct Free→Pro jumps.
**Migration impact:** `TierStatus.tier` is `"free" | "basic" | "pro" | "preview"`. `familyMembers` entitlement removed. Stripe SKUs: two, not four.
**Rejected alternatives:** keeping four tiers (decision paralysis), Family-only (no individual-multi-account path), per-feature à la carte pricing (operational nightmare).
**Backlog trigger for family:** if Pro converts >10% of Basic users *and* support tickets repeatedly request household licensing, revisit family pricing as `BL-tier-family` graduation candidate.

## R32. Trainable-classifier replacement (deferred)

**Decision:** Defer ML-based detection to v1.5+. Bundle nothing model-shaped at launch. Continue with regex + checksum + context scoring.
**Why:** on-device ML inference at extension-bundle scale is non-trivial (WebGPU + tensorflow.js or Chrome's experimental built-in AI APIs); training corpus for a privacy-tuned classifier doesn't exist; bundle cost would replace the OCR weight we just freed. Revisit when Chrome's built-in `chrome.ai.*` APIs reach stable.
**What we'd use it for first:** "looks like medical record" classification (where regex is unreliable and Purview uses Trainable Classifiers), and "looks like a CV/résumé" (rich PII context).

## R29. Design system — MOTA-inspired tokens, free-only stack (revised 2026-05-12)

**Decision:** ShieldMe uses a two-tier token system (reference → semantic) defined in [`contracts/design-tokens.md`](./contracts/design-tokens.md), with a hand-built component library spec in [`contracts/ui-components.md`](./contracts/ui-components.md). **All assets are free for commercial use:** Manrope display (OFL) + Inter body (OFL), Lucide icons (ISC), Floating UI primitives (MIT), Motion One animations (MIT). Light + dark variants of every semantic token. Severity colors are part of the token system.
**Why:** Bill's 2026-05-12 directive — "only UI elements, font-families and more that I can use in my product for free." THICCCBOI's commercial license was ambiguous; swapping to Manrope+Inter eliminates the risk while preserving the geometric/rounded character that made THICCCBOI attractive. Hand-built components on Floating UI are smaller than any React-component-library port to Preact and respect the 500 KB popup budget.
**Open:** hex codes in `design-tokens.md` §3 remain inferred; Bill to confirm or send actual MOTA values.
**Rejected:** THICCCBOI (license risk on Premium tier); shadcn/ui (React-only); Material/Chakra (bundle weight + opinionated layout, both wrong for a 500 KB popup); Tailwind (R23); single-family typography (loses brand differentiation).

## R28. Multi-provider strategy — abstraction now, OneDrive/Outlook at v1.5

**Decision:** Cloud storage and email are accessed through `CloudStorageProvider` and `EmailProvider` interfaces. MVP ships only Google implementations. OneDrive + Outlook (web) ship at v1.5 as second implementations, sharing the same UX, the same scan engine, and the same TierGate.
**Why:** retrofit cost of a provider seam after a year of Google-only code is several engineer-weeks; the seam itself is ~2 days of design. Microsoft 365's consumer base (250M+ subs) is the only addressable second ecosystem with a real API; Apple is a dead end (no consumer API), and Yahoo/AOL DOM scraping decays faster than we can ship fixes.
**Rejected alternatives:**
- Multi-provider in MVP (doubles OAuth verification + scope review burden; product-market fit not yet established).
- IMAP/SMTP support (storing user credentials = unacceptable attack surface; no parity with OAuth's revocability).
- iCloud (no API).

## R27. Identity strategy — multi-account + minimal OIDC, no sync

**Decision:** MVP supports multiple Google accounts via per-account OAuth state. OIDC ID tokens are captured at sign-in time, validated client-side via JWKS, and only `sub` is retained. No ShieldMe-issued credentials. No cross-device sync. Microsoft/Apple providers are scaffolded behind the same `IdentityProvider` interface for v1.5+.
**Why:** the user's stated needs (multi-Google + drive + email + future non-Google) are satisfied by per-account OAuth without introducing a server, a credential store, or a sync surface. Capturing `sub` at sign-in is one extra fetch + JWKS verification (~10 ms) and saves M6 from refactoring entitlement attachment when the user gets a new laptop.
**Rejected:**
- ShieldMe-issued passwords or local-only sessions — no benefit; pure attack surface.
- `chrome.identity.getAuthToken` — single-account by design.
- Implicit grant — deprecated for security reasons.
- Cross-device preference sync via `chrome.storage.sync` — Constitution §I bars it (data leaves device).
- Server-mediated identity — Constitution §I + complexity.

## R26. State management at scale

**Decision:** `@preact/signals` is the state container. No Redux, Zustand, or context-API store layer. Cross-route state lives in module-level signals; component-local state uses Preact `useState`. A documented "signal hygiene" page in `docs/engineering/signals.md` covers the three footguns (reading signals outside tracked contexts, mutating arrays in place, cyclic effect dependencies) before we onboard a second contributor.
**Why:** Signals' bundle cost is ~1 KB; alternative stores add 10–20 KB. The signal model maps cleanly to detector registry → rules → exposure score reactivity. The footguns are documentable.
