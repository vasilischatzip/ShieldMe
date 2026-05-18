# ShieldMe Constitution

**Version:** 2.0.0 · **Ratified:** 2026-04-22 · **Amended:** 2026-05-17 (web-app pivot)

These are the non-negotiable principles. Every spec, plan, task, and PR is checked against them. Violating a principle requires an amendment to this file with rationale.

---

## I. Privacy-First Architecture (NON-NEGOTIABLE)

All document, email, and attachment content is processed **client-side only**. No raw user data ever leaves the device. External API calls (HIBP, Google Drive, future DeleteMe) transmit only: (a) the user's own OAuth-scoped identity, (b) hashed/anonymized identifiers (e.g., k-anonymity SHA-1 prefix for passwords), or (c) the user's own API key against *their* account.

**Enforcement:** Any code path that posts `FormData`/`fetch` with scan content fails CI. A network-egress allowlist lives in `src/security/egress-allowlist.ts` and is enforced by build-time static analysis and runtime CSP.

## II. User Sovereignty & Auditability

- API keys, settings, and per-account OAuth tokens live in **IndexedDB** (large state) and **localStorage** (small flags), encrypted at rest via Web Crypto API with a key derived from a per-install random seed stored only in the user's browser. Never transmitted to any server we control.
- No obfuscation or minification of security-sensitive code paths (detection engine, storage, crypto). Source maps shipped with every deployment.
- "Delete all my data" wipes every byte in one action and is reachable in ≤2 clicks.
- **Public source.** The repository is open-source on GitHub. Users can verify the deployed JavaScript hash against the committed source; reproducible builds (security-controls C-SUP-8) make this verification credible.

## III. Least-Privilege Authorization (web-app variant, post-pivot 2026-05-17)

The product is a hosted web app. There are no browser-extension permissions to request. The only authorization surface is **OAuth scopes** the user grants when connecting external services (Google Drive, Google Calendar, future Microsoft Graph). Discipline:

- Read-only scopes by default. Write scopes upgraded on-demand and only at the moment the user invokes a write action.
- Never `https://www.googleapis.com/auth/gmail.readonly` for Gmail-mailbox reads at v1.0. Email scanning is **paste-text-or-upload-.eml** only — same privacy posture as Document Check.
- The web app declares its required OAuth scopes in its Google Cloud Console verification submission. Limited Use Disclosure covers every scope.
- No third-party analytics by default. Opt-in only, telemetry payload bound by schema validator (security-controls C-NET-2).

## IV. Consumer Language Everywhere

UI strings contain zero security jargon: no "DLP," "regex," "PII," "classifier," "entropy," "OAuth scope." Copy is reviewed against a banned-terms linter (`scripts/lint-copy.mjs`). Internal code uses precise technical names freely.

## V. Progressive Disclosure

Defaults work for a non-technical user with zero configuration. Advanced controls (per-detector toggles, custom rules, API keys) are behind an "Advanced" fold. First-run: 3 clicks from install → first scan result.

## VI. Tier-Agnostic Core

Free tier is **capacity-limited, never capability-crippled**. All seven modules ship on Day 1 of v1.0 (the five original PRD modules plus Calendar Audit and Privacy Toolkit, added 2026-05-09). Paid tiers add scale, automation, multi-account, and family — not unlock-to-see features. Tier checks go through a single `TierGate` abstraction (`src/core/tier-gate.ts`) so changing what a tier includes requires changing one entitlement, never rewriting modules.

**Free and open-source.** All seven modules ship at full capacity for everyone. The TierGate abstraction remains in place as a forward-compatible seam in case future versions reintroduce paid features (multi-account, hosted sync, etc.), but the v1.0 web app has no paid features and no Stripe integration. The constitution's original Tier-Agnostic Core principle is preserved: capacity-limited, never capability-crippled — currently everyone is on `preview` tier which always returns `allowed: true`.

## VII. Fundamental Correctness in Detection

Every detector ships with:
1. **Validation beyond regex:** Luhn for cards, mod-97 for IBAN, checksum for AFM/NIF/SSN where defined.
2. **Context window scoring:** proximity to keywords scales confidence; naked 9-digit strings are low-confidence.
3. **A golden test corpus** under `tests/fixtures/corpus/<country>/<detector>/{positive,negative}.txt` with ≥20 positives and ≥20 negatives per country before the detector is marked GA.
4. **Target false-positive rate ≤2%** on the corpus, measured in CI. A PR that raises FPR above the budget is blocked.

## VIII. Zero Runtime External Dependencies

All libraries (pdf.js, mammoth, SheetJS, Tesseract.js (v1.5+), jsPDF, Preact, Floating UI, Lucide, Motion One, valibot, noble/ed25519, noble/hashes) are bundled at build time and served from the same origin as the application. No third-party CDN requests at runtime. No `eval`, no `new Function`. CSP `script-src 'self' 'wasm-unsafe-eval'` enforced in the deployment's `Content-Security-Policy` HTTP header.

**Subresource Integrity:** if a future feature requires loading any non-bundled resource (e.g., Tesseract traineddata for non-English OCR in v1.5), the resource is pinned by SHA-256 hash declared in code; runtime fetch verifies before use.

## IX. Fail Loud, Not Silent

When the Gmail DOM observer can't find compose nodes, when Drive rate-limits, when OCR times out — show the user a named failure mode ("Email Guardian temporarily unavailable — Gmail updated their layout") with a Report button. Never silently skip a scan the user believes ran.

## X. Automated QA as a Release Gate

Merges to `main` require, with no manual override:
- Typecheck (`tsc --noEmit`) passes
- Unit tests (Vitest) pass; line coverage ≥80% on `src/core/**`, `src/detectors/**`, `src/cloud/**`, `src/email/**`
- Detection corpus regression passes (FPR ≤2%, recall ≥95% per detector)
- E2E extension tests (Playwright + `chromium --load-extension`) pass on Chromium stable + beta
- Bundle size budget: total unpacked ≤25 MB, initial popup load ≤500 KB
- Egress allowlist check passes (allowlist read from `contracts/integration-apis.md` §1)
- Copy linter passes (banned-terms list in §IV)
- CSP validator passes (`script-src 'self' 'wasm-unsafe-eval'`)
- Accessibility (axe-core) passes; WCAG 2.1 AA on popup + options
- License audit (`pnpm licenses`) passes against the allowlist (Apache-2.0, MIT, BSD-2/3, ISC, MPL-2.0, OFL-1.1)
- Lockfile integrity (`pnpm install --frozen-lockfile`) passes
- `pnpm audit --prod --audit-level=high` passes (Critical blocks, High requires PR acknowledgement)
- Visual regression (Playwright + image diff) passes on the popup and options canonical scenes
- Localization completeness: every UI string has an `en` and `el` value; CI fails on missing keys
- Token discipline: ESLint `no-raw-color-tokens` and stylelint `no-magic-pixels` pass
- Memory hygiene: ESLint `no-secret-logging` passes
- Performance budgets: NFR-P1 / P2 / P4 benchmarks run; regressions >15% block

## XI. Token-Efficient Implementation

When invoking AI agents (Claude Sonnet/Opus) for implementation:
- Tasks reference file paths, never paste file contents.
- Each task is independently executable with only the spec + referenced files loaded.
- Shared conventions live in this constitution and `plan.md`; never restated per-task.

## XII. Threat Model & Supply Chain (added 2026-05-09)

A documented threat model lives at `specs/001-shieldme-mvp/threat-model.md`. It enumerates assets, adversaries, severity-rated risks, and mitigations. This file is updated whenever:

- A new external host is added to the egress allowlist.
- A new browser permission is declared, even if optional.
- A new direct dependency is added to `package.json`.
- A new module handles secrets, OAuth, or scan content.

**Supply-chain rules** (binding): `pnpm install --frozen-lockfile` in CI; `pnpm audit` blocks Critical; SBOM generated at every release; release zips Sigstore-signed from M2 onward; no automatic dependency upgrades; license allowlist enforced; every direct dependency >5,000 LoC has a "why this dep" entry in `docs/deps-rationale.md`.

**Memory-hygiene rules** (binding): decrypted secrets pass through closures, not module-level state; ESLint rule `no-secret-logging` bans `console.*` of `ApiKey | EncryptedBlob | DecryptedKey`-typed values; the Email Guardian content script reads compose body only at Send-click time, never proactively.

**Kill-switch rules**: the Ed25519 verification public key is a `const` in `src/security/kill-switch-keys.ts`, never fetched, rotated only via release. Selector payloads max 4 KB, signed-at within ±24h, and may only mutate selector strings.

## XIII. Identity & Account Sovereignty (added 2026-05-09)

If the product introduces a ShieldMe-level identity (OIDC, multi-account, or future cross-device sync):

- **Local-first.** Identity exists to partition local state and to attach external OAuth tokens to a known principal. It is **not** a sync mechanism by default. Any sync feature is a separate constitutional question with its own amendment.
- **Multiple identities, by design.** A user may add multiple Google (and future OneDrive/Microsoft 365) accounts. Per-account state lives in scoped namespaces; nothing leaks across accounts.
- **No password.** ShieldMe never asks the user to set a password. Identity is an OIDC delegation only; the IDP holds the credential. PKCE flow, public client.
- **No server we control by default.** ID-token validation is client-side via JWKS. The only server that may enter the picture is the entitlement service (M6+), which already requires constitutional justification.
- **Disconnect = wipe.** Disconnecting an identity revokes its tokens at the IDP and wipes its account-scoped local state in one action.

Detail lives in `contracts/identity-providers.md`.

## XIV. Design System Discipline (added 2026-05-09, refined 2026-05-12)

UI uses a single, restrained design system documented in `contracts/design-tokens.md` and `contracts/ui-components.md`:

- ≤8 brand hues across the entire product (semantic + state).
- ≤2 font families — **Manrope** (display, OFL) + **Inter** (body, OFL). Both bundled WOFF2 subsets.
- All colors and type sizes consumed via CSS custom properties from `src/ui/tokens/`. No hex literals in component CSS. ESLint rule `no-raw-color-tokens` enforces.
- Light + dark variants of every token; system preference followed unless overridden.
- Severity colors (critical/warning/info) are part of the token system, not ad-hoc.
- Component library is **hand-built** on Floating UI (MIT) + Lucide icons (ISC) + Motion One animations (MIT). No CSS framework, no React component library (Preact-incompatible), no licensed assets.
- The MOTA aesthetic is the directional reference, not a brief to copy. **Every font, icon, library, and asset shipped MUST be SIL-OFL, MIT, ISC, BSD-2/3, Apache-2.0, or public domain.** License audit blocks any other license at the CI gate.

## XVI. Web-App Deployment Posture (added 2026-05-17)

ShieldMe is a web app, not a browser extension.

- **Hosting:** static SPA, deployable to any CDN (GitHub Pages, Cloudflare Pages, Netlify, Vercel). No origin server required for v1.0.
- **Build output:** single-page application at `/`, with `index.html` + hashed asset bundles. No service worker for offline (out of v1.0 scope; backlog `BL-pwa-offline`).
- **CSP enforced via HTTP response header** at the hosting layer. The exact header set is documented in `specs/001-shieldme-mvp/security-controls.md` and verified by `scripts/verify-csp.mjs` against the deployed headers.
- **Authentication mechanics:** browser-native OAuth 2.0 PKCE code flow via redirect or popup. No `chrome.identity.*`. Google Identity Services library (or hand-rolled fetch-based flow) used for Google OAuth.
- **Storage mechanics:** `localStorage` for small flags + tier status; IndexedDB (`idb` library) for everything else. No `chrome.storage.*`. All sensitive data encrypted with Web Crypto AES-GCM before persistence.
- **Permissions removed from this constitution:** the prior version's `activeTab` / `storage` / `host_permissions` discipline no longer applies. The web app has only OAuth scopes (Principle III).
- **Chrome extension is a v2 product question.** If the web app gets traction, an extension variant can revive Email Guardian (Gmail compose intercept) and Cloud Audit content-script flows. Tracked in `backlog.md` as `BL-platform-chrome-extension`.

## XV. Inbound Content Trust (added 2026-05-09)

Future modules that read inbound content (received emails, shared Drive files) operate under a stricter posture than outbound modules:

- Inbound parsing happens in the offscreen document, not the popup or content script.
- No automatic action; every protective response (warn, redact, block) is user-initiated or user-pre-authorized.
- Phishing/malicious-link detection in inbound email never sends links anywhere; reputation lookups, if added, must use the same hashing/k-anonymity discipline as Constitution §I.
- The user can disable any inbound scanner without disabling the corresponding outbound scanner.

---

## Amendment Process

1. Propose change in a PR that edits this file.
2. Update `Amended` date and bump version (MAJOR for removing/weakening a principle, MINOR for adding, PATCH for wording).
3. Document the trigger (why now) and migration impact in the PR description.
4. All open feature specs must be re-checked against the amendment before next merge.
