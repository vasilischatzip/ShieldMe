# Implementation Plan — ShieldMe MVP

**For:** [spec.md](./spec.md) · **Constitution check:** PASS (see §7) · **Updated:** 2026-04-22

---

## 1. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Platform | **Web app (SPA)** — static deploy to Cloudflare Pages / GitHub Pages / Vercel | Pivoted 2026-05-17. Web app ships in 24h vs 4–6 weeks Chrome Web Store review; portfolio-friendly; GitHub-hostable; chrome-extension variant parked in backlog. |
| Language | TypeScript 5.x (strict) | Type safety across content/popup/worker boundaries. |
| UI | Preact 10 + Signals | ~15 KB, Preact Signals gives reactive state without Redux bloat. |
| Build | Vite 5 (standard SPA) | No CRXJS plugin needed post-pivot. Plain Vite SPA build with hashed asset emission. |
| Tests | Vitest (unit) + Playwright (e2e) | Vitest pairs with Vite; Playwright loads the extension via `chromium --disable-extensions-except`. |
| Linter | ESLint + `eslint-plugin-security` | Catches `eval`, unsafe regex, etc. |
| Formatter | Prettier | Non-negotiable; set once in CI. |
| Doc parsers | pdf.js, mammoth.js, SheetJS (community) | Per PRD §11. Bundled. |
| OCR | Tesseract.js v5 (WASM SIMD) | Fastest option. Web Worker. |
| PDF report | jsPDF | Per PRD. |
| Storage | `localStorage` (small flags) + IndexedDB (via `idb`) — both encrypted at rest where sensitive | Replaced `chrome.storage.local` post-pivot. Same LocalStore abstraction; only the implementation swaps. |
| Crypto | Web Crypto API (AES-GCM, PBKDF2) | Native, no dep. |
| i18n | JSON locale files served as static assets (`/locales/en.json`, `/locales/el.json`) loaded via fetch on first language switch; cached in IndexedDB. | Replaced `chrome.i18n` post-pivot. |
| Routing | `preact-iso` (MIT, ~3 KB) | Lightweight SPA router with route-level code splitting. |
| Analytics (opt-in) | Plausible self-hosted event endpoint | No cookies, no IP retention. |
| Payments (future) | Stripe Checkout | EU VAT handled; minimal integration. |
| DeleteMe (future) | Adapter pattern — `BrokerRemovalProvider` | No dep today. |

## 2. Folder Layout

```
.
├── .specify/
│   └── memory/constitution.md
├── docs/
│   ├── PRD.md
│   ├── engineering-qa.md
│   ├── testing-fixtures.md
│   └── legal/               # privacy-policy, limited-use (drafted at M4)
├── specs/001-shieldme-mvp/
│   ├── spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
│   └── contracts/
├── src/
│   ├── manifest.ts          # generated manifest.json
│   ├── background/          # MV3 service worker
│   │   └── service-worker.ts
│   ├── offscreen/           # offscreen documents for heavy parsing
│   │   └── parser.html
│   ├── content/gmail/       # Email Guardian content script
│   │   ├── index.ts
│   │   ├── selectors.ts     # resilient cascade
│   │   ├── canary.ts
│   │   └── banner.ts
│   ├── popup/               # main UI
│   │   ├── App.tsx
│   │   └── routes/
│   ├── options/             # settings page
│   ├── core/
│   │   ├── tier-gate.ts     # SINGLE source of free/paid decisions
│   │   ├── exposure-score.ts
│   │   ├── storage.ts
│   │   ├── crypto.ts
│   │   ├── i18n.ts
│   │   └── telemetry.ts
│   ├── detectors/
│   │   ├── registry.ts
│   │   ├── money/           # cards, iban, tax-ids, crypto, keywords
│   │   ├── identity/
│   │   ├── health/
│   │   ├── family/
│   │   ├── digital/
│   │   ├── location/
│   │   └── custom/
│   ├── parsers/
│   │   ├── dispatch.ts      # dynamic import by MIME/ext
│   │   ├── pdf.ts
│   │   ├── docx.ts
│   │   ├── xlsx.ts
│   │   ├── text.ts
│   │   └── ocr.ts           # Tesseract worker wrapper
│   ├── drive/
│   │   ├── client.ts
│   │   ├── audit.ts
│   │   └── fix-actions.ts   # gated behind Premium
│   ├── email/
│   │   ├── intercept.ts
│   │   └── scan.ts
│   ├── radar/
│   │   ├── hibp-passwords.ts
│   │   ├── hibp-emails.ts
│   │   ├── brokers.ts
│   │   └── providers/
│   │       ├── broker-removal-provider.ts  # interface
│   │       ├── manual-provider.ts           # ships
│   │       └── deleteme-provider.ts         # stub, interface only
│   ├── security/
│   │   ├── egress-allowlist.ts
│   │   └── csp.ts
│   └── ui/                  # shared components
├── tests/
│   ├── unit/                # Vitest, mirrors src/
│   ├── corpus/              # detector regression
│   ├── e2e/                 # Playwright
│   ├── fixtures/
│   │   ├── samples/         # dummy files (see testing-fixtures.md)
│   │   └── corpus/<country>/<detector>/{positive,negative}.txt
│   └── acceptance/          # AC-* tests from spec
├── scripts/
│   ├── check-bundle-budget.mjs
│   ├── check-egress-allowlist.mjs
│   ├── lint-copy.mjs
│   └── verify-csp.mjs
├── .github/workflows/ci.yml
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## 3. Build & Bundle Strategy

- **Entry points:** service worker, popup, options, content-script (gmail), offscreen parser.
- **Code split:** parsers, OCR, jsPDF, each in their own chunk, loaded via dynamic `import()` at first use.
- **Manifest generation:** `src/manifest.ts` exports a typed object, `@crxjs` serializes to `manifest.json` at build time. Optional host permissions declared but **not granted** until the user enables the feature (`chrome.permissions.request`).
- **CSP:** `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. Enforced by `scripts/verify-csp.mjs`.
- **Hashing:** every output file hashed for cache-busting across updates.

## 4. Architecture

```
 ┌──────────────┐    ┌──────────────┐    ┌────────────────┐
 │    Popup     │    │   Options    │    │ Gmail content  │
 │ (Preact UI)  │    │ (Preact UI)  │    │    script      │
 └──────┬───────┘    └──────┬───────┘    └───────┬────────┘
        │ chrome.runtime.sendMessage             │
        └──────────────┬─────────────────────────┘
                       ▼
           ┌───────────────────────┐
           │    Service Worker     │  ◄─── TierGate, Exposure Score,
           │ (dispatcher + state)  │       Drive client, Telemetry
           └──────────┬────────────┘
                      │ chrome.offscreen
                      ▼
           ┌───────────────────────┐
           │  Offscreen Document   │  ◄─── pdf.js, mammoth, SheetJS,
           │    (heavy parsing)    │       Tesseract worker
           └───────────────────────┘

  chrome.storage.local  — prefs, rules, whitelists, tier status
  IndexedDB (idb)       — scan history, drive cache, Tesseract traineddata
  Web Crypto            — AES-GCM for API keys

  Egress allowlist: api.pwnedpasswords.com, haveibeenpwned.com,
                    googleapis.com/drive/v3/*, accounts.google.com/*
```

### Key choices
- **Offscreen documents** for parsing — MV3 service workers can't use `DOMParser` or many libraries directly. Offscreen is Chrome's official answer.
- **`TierGate` abstraction** (`src/core/tier-gate.ts`) — returns `{allowed, reason?, upsell?}`. Today's resolver returns `tier: "preview"` for everyone (everyone is treated as Pro pre-launch); at M6 it flips to `"free" | "basic" | "pro"` from a Stripe-webhook-populated entitlement cached in storage and refreshed every 30 s.
- **Detector registry** — detectors implement `Detector` interface (see `contracts/detection-engine.md`). Registry maps category toggles → active detectors at runtime.
- **No global singletons** — every module takes its storage, crypto, tier-gate, and clock via constructor/props for testability.

## 5. Phased Delivery — v1.0 launch (revised 2026-05-09)

Scope-shift target: v1.0 launches with all seven modules + Free/Basic/Pro/Pro-Family tiers active. Calendar provider may slip to v1.1 if Microsoft Graph approval lags.

| Phase | Weeks | Deliverable | Constitution gate |
|---|---|---|---|
| **M0 — Scaffolding** | W1–2 | Repo bootstrap (Claude Code Prompt B), CI pipeline, empty MV3 extension loads, Preact popup, design-tokens scaffold, i18n EN/EL skeleton, TierGate stub, egress allowlist generator. | Build green; egress check active. |
| **M1 — Rules + Document Check** | W3–6 | Module 1 (detectors for US/UK/DE/FR/GR/IT/ES/PT/NL/AU/CA/JP), Module 2 (PDF/DOCX/TXT/XLSX/CSV/RTF — no OCR), tier matrix v2, Exposure Report, jsPDF export, Share Score PNG, corpus FPR ≤2%. | Corpus gate active. |
| **M2 — Identity + Multi-account + Email Guardian Outbound** | W7–10 | `IdentityProvider` (Google), `AccountManager`, multi-account UI, Module 3 outbound on Gmail with cascade selectors + canary + banner, whitelist UI. | Identity contract tests green. |
| **M3 — Cloud Audit (Google Drive) + OAuth verification kickoff** | W11–14 | Module 4 with Google Drive, Share Interception (Basic+), Watermark-on-share (Pro+), cross-reference, continuous re-audit, write-scope upgrade flow. OAuth verification submitted to Google in parallel. | Drive quota + token-bucket test green. |
| **M4 — Exposure Radar + Privacy Toolkit foundation** | W15–18 | Module 5 (passwords k-anonymity, emails HIBP BYOK, broker checklist with reminders), Module 7 first half (Data Export Generator, Extension Audit, Takeout review). | Analytics opt-in gate tested. |
| **M5 — Calendar Audit + Privacy Toolkit completion + Inbound Email** | W19–22 | Module 6 (Google Calendar), Subscription Audit + Travel Mode (Pro), Email Guardian Inbound (Pro), sender-domain reputation list with Ed25519 signing infra. | Inbound trust boundary tests green. |
| **M6 — Microsoft providers + Billing** | W23–26 | Microsoft `IdentityProvider`, `CloudStorageProvider` (OneDrive), `EmailProvider` (Outlook), `CalendarProvider` (Outlook). Stripe Checkout for all four SKUs. Entitlement worker (Cloudflare Worker, single endpoint). | Multi-provider regression green. |
| **M7 — Score + Polish + Submission** | W27–30 | Exposure Score weighted across all modules, onboarding polish, a11y full pass, store listing, 90-sec walkthrough video, Basic + Pro billing UX, submit v1.0 to Web Store. | All NFRs green; tier-switch integration test (Free ↔ Basic ↔ Pro). |
| **M8 — Post-launch (continuous)** | ongoing | OCR (v1.5), Family-shared broker progress, scheduled reports, DeleteMe automated removal, dark-web monitoring, scoped FR/DE/ES/PT localization. | Per-feature gate at merge time. |

## 6. QA Automation (release gate)

All enforced in `.github/workflows/ci.yml` — no override.

1. `pnpm typecheck`
2. `pnpm test:unit` — Vitest, ≥80% line coverage on `src/core/**` + `src/detectors/**`
3. `pnpm test:corpus` — FPR ≤2%, recall ≥95% per active detector
4. `pnpm test:e2e` — Playwright with `--load-extension=dist/`
5. `pnpm build && node scripts/check-bundle-budget.mjs` — ≤25 MB total, ≤500 KB popup
6. `node scripts/check-egress-allowlist.mjs` — scans built JS for disallowed hosts
7. `node scripts/lint-copy.mjs` — no banned security-jargon terms in UI strings
8. `node scripts/verify-csp.mjs` — enforces `script-src 'self' 'wasm-unsafe-eval'`
9. `pnpm test:a11y` — Playwright + axe-core on popup and options
10. **Manual (pre-submission only):** Chrome Web Store checklist sign-off

**Perf benchmarks** (non-blocking but tracked): 1 MB PDF, 10 MB PDF, 2048 px OCR, 3,000-file Drive enum. Plotted in a simple dashboard (CI artifact JSON committed to a `benchmarks` branch).

## 7. Constitution Check

| Principle | Plan conformance |
|---|---|
| I. Privacy-first | Egress allowlist + CSP enforced in CI. All parsing client-side. |
| II. Sovereignty | API keys encrypted, source maps shipped, "Delete all" wired. |
| III. Least privilege | `activeTab` + `storage` at install; all others optional on-demand. |
| IV. Consumer language | Copy linter in CI. |
| V. Progressive disclosure | Category toggles simple; detectors behind Advanced fold. |
| VI. Tier-agnostic | Single `TierGate`; all modules ship on Day 1. |
| VII. Correctness | Luhn/mod-97/etc + context window + corpus gate. |
| VIII. Zero runtime deps | All libs bundled; CDN list empty. |
| IX. Fail loud | Banners for Gmail/OCR/Drive failures; never silent skip. |
| X. Automated QA | 10-check CI gate, no override. |
| XI. Token efficiency | Plan references files; doesn't inline code. |

**Status:** PASS. No deviations to track.

## 8. Plan-Level Decisions (resolved)

Previously open items, now committed. Rationale folded into `research.md` (R22, R23).

- **Test DOM:** Vitest + happy-dom. Smaller, faster cold-start; swap to jsdom only if a Preact-specific failure mode appears.
- **Package manager:** pnpm 9 (strict lockfile = security-relevant for a privacy tool; matches `quickstart.md`).
- **Styling:** plain CSS Modules + a small token layer in `src/ui/tokens/`. No Tailwind. Reasoning: bundle-size budget (popup ≤500 KB), zero PostCSS toolchain, design system is small enough that utility classes add ceremony without payoff. Token layer drives the MOTA-aligned palette and typography (see ask 6).
