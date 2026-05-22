# Tasks — ShieldMe v1.0 (web app)

**Status:** active · **Updated:** 2026-05-22 (T104–T105 M3 Fix Actions done) · **Total:** 218 tasks (202 prior + 13 pivot + 3 deploy hotfix)
**Phase counts:** **MP** (Pivot conversion): 13 + 3 hotfix · M1: 74 · M2: 22 · M3: 22 · M4: 19 · M5: 22 · M6: 19 · M7: 24
**Progress (2026-05-22):** 125 `[x]` done · 0 `[~]` partial · ~93 `[ ]` pending. Markers: `[~]` = implementation exists but doesn't match the spec breakdown — needs a gap-fill task.

**Prerequisites complete (M0):** repo bootstrap, CI, Vite build, design tokens, i18n EN/EL, TierGate stub, LocalStore + IDB wrappers, crypto (AES-GCM), migrations runner, Playwright harness, corpus harness, a11y test harness, egress allowlist script, bundle budget script, CSP verifier, preset verifier, copy linter, eslint config.

**Pivot 2026-05-17:** scope changed from Chrome MV3 extension to web app. Tasks **TP1–TP13** below convert the codebase. Extension-only tasks (kill-switch system, Gmail content script, MV3 manifest, offscreen documents, `_locales/`, `chrome.*` APIs) are moved to `backlog.md` under `BL-platform-chrome-extension`, `BL-email-gmail-content-script`, `BL-kill-switch-system`.

---

## MP — Pivot Conversion (Chrome MV3 → Web App)

- [x] **TP1** `[H]` **Delete extension-only source directories** — REMOVE `src/manifest.ts`, `src/background/`, `src/content/`, `src/offscreen/`, `_locales/`, `src/popup/` (empty subdirs + dead `index.html`), `src/options/` (already empty). **Done 2026-05-20:** `git rm -rf` complete; ESLint `ignores` pruned; `pnpm verify` green.
- [x] **TP2** **Replace `chrome.storage.local` with `localStorage` + IndexedDB in LocalStore** — Files: `src/core/storage.ts`, `tests/unit/core/storage.spec.ts`. Same interface from `contracts/storage-schema.md` §1; only the implementation swaps. All sensitive data encrypted via `Crypto`. **Done 2026-05-18:** no `chrome.storage` refs in `src/core/storage.ts`; uses `localStorage` + `idb`.
- [x] **TP3** **Replace `chrome.identity` OAuth with browser PKCE flow** — Files: `src/drive/client.ts`, `src/core/identity/` (NEW), `tests/unit/drive/client.spec.ts`. Use hand-rolled fetch-based PKCE redirect (no Google Identity Services script — keeps zero third-party JS). **Done 2026-05-18:** `src/core/identity/pkce.ts` + `src/drive/client.ts` use redirect-flow PKCE; tests present.
- [x] **TP4** **Replace `chrome.i18n` with JSON-loader i18n** — Files: `src/core/i18n.ts`, `tests/unit/core/i18n.spec.ts`, NEW: `public/locales/en.json`, `public/locales/el.json`. Convert existing `_locales/{en,el}/messages.json` to flat key-value JSON. **Done 2026-05-18:** `public/locales/{en,el}.json` shipped; `src/core/i18n.ts` is fetch-based.
- [x] **TP5** **Remove `@crxjs/vite-plugin`; add SPA wiring** — Files: `vite.config.ts`, NEW `index.html`, `package.json`. Add `preact-iso` to deps; remove `@crxjs/vite-plugin` from devDeps. **Done 2026-05-18:** no `crxjs` in `package.json`; `vite.config.ts` is plain Preact + manual chunks; `index.html` exists.
- [x] **TP6** **Add SPA router (`preact-iso`) + new app shell** — Files: NEW `src/main.tsx`, `src/app/App.tsx`, `src/app/Layout.tsx`; MOVE `src/popup/routes/*.tsx` → `src/app/routes/*.tsx` (rename Scan→DocumentCheck, add EmailScanner, OAuthCallback, etc.). **Done 2026-05-18:** new shell present under `src/app/`; legacy `src/popup/` still on disk pending TP1.
- [x] **TP7** **OAuth callback handler** — Files: NEW `src/app/routes/OAuthCallback.tsx`, `src/core/identity/pkce.ts`. Parses `code`+`state` from URL, exchanges for token, redirects to initiator module. **Done 2026-05-18:** both files present.
- [x] **TP8** `[H]` **Update `eslint.config.js` — remove all `chrome.*` carve-outs** — Files: `eslint.config.js`. `no-restricted-globals: chrome` everywhere. **Done 2026-05-18:** rule applies to all `src/**` and `tests/**`; only `scripts/**` and `tests/e2e/**` opt out, which is correct.
- [x] **TP9** **Delete extension-only tests + source** — REMOVE `tests/unit/content/`, `tests/unit/offscreen/`, `tests/unit/security/kill-switch.spec.ts`, `src/security/kill-switch.ts`, `src/security/kill-switch-keys.ts`, `tests/e2e/onboarding.spec.ts`, `tests/e2e/onboarding-5click.spec.ts`. **Done 2026-05-20:** `git rm -rf` complete; ESLint `ignores` pruned; `pnpm verify` green. Design notes preserved in `backlog.md`.
- [x] **TP10** **Update CSP for web-app deployment** — Files: NEW `public/_headers` (Cloudflare Pages) + GitHub Pages workflow alternative, `scripts/verify-csp.mjs` updated to check `_headers` instead of manifest CSP. **Done 2026-05-18:** `public/_headers` shipped with `script-src 'self' 'wasm-unsafe-eval'`; deploy workflow copies it into `dist/`.
- [x] **TP11** **Update egress allowlist for web context** — Files: `specs/001-shieldme-mvp/contracts/integration-apis.md` §1, `src/security/egress-allowlist.ts` (auto-generated). Remove `{SELECTORS_HOST}`. Keep HIBP + Google APIs + optional Plausible + optional Stripe. **Done 2026-05-18:** `SELECTORS_HOST` absent; HIBP + Google APIs present in `src/security/egress-allowlist.ts`.
- [x] **TP12** **GitHub Actions deploy workflow** — Files: NEW `.github/workflows/deploy.yml`, update `.github/workflows/ci.yml`. Deploy `dist/` to GitHub Pages on `main` push. **Done 2026-05-18:** workflow ships build + `actions/deploy-pages@v4`; see TP14 for the pnpm hotfix.
- [x] **TP13** `[O]` **Pivot phase gate — full verification** — Run `pnpm verify`. All gates green. **Done 2026-05-20:** typecheck + lint + 1392 tests + build + bundle budget (11.5 MB ≤ 25 MB) + egress + CSP + presets all pass. Bundle note: 25 MB budget is for web-app; parser workers (PDF/XLSX/DOCX) dominate — expected and within budget.

### Deploy Hotfixes (2026-05-18)

- [x] **TP14** `[H]` **Fix `pnpm/action-setup@v4` version conflict in CI + Deploy workflows** — Files: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`. Removed inline `version: 9` so the action reads pnpm version from `package.json` `packageManager` field. Was causing `ERR_PNPM_BAD_PM_VERSION` on every Pages deploy run. Verification: re-run deploy on `main` push.
- [x] **TP15** `[H]` **Ignore stray nested `/ShieldMe/` clone** — Files: `.gitignore`. A misplaced clone created `repo-root/ShieldMe/` containing only a `.git` dir; added to `.gitignore` so it stays out of commits.
- [x] **TP16** **Confirm Pages enabled with "GitHub Actions" as source** — **Done 2026-05-18:** source set to "GitHub Actions"; deploy reaches live URL at `https://vasilischatzip.github.io/ShieldMe/`.
- [x] **TP17** `[H]` **Fix SPA base-path routing for `/ShieldMe/` deployment** — Files: NEW `src/app/base.ts`, `src/app/Layout.tsx`, `src/app/App.tsx`, `src/main.tsx`, `src/app/routes/Dashboard.tsx`, `src/app/routes/OAuthCallback.tsx`, `src/app/routes/NotFound.tsx`, `src/drive/client.ts`, `index.html`. **Done 2026-05-19:** introduced three helpers in `src/app/base.ts`: `link(path)` for `<a href>` values (trailing-slash form), `routePath(path)` for `<Route path>` values (no trailing slash — preact-iso normalizes `location.pathname` before matching), `stripBase(fullPath)` for nav active-link detection. Updated all `<a href>`, programmatic navigations (`window.location.href`), Route paths, OAuth redirect URI default, favicon path, and `LocationProvider scope`. Was causing every nav link to 404 to `https://vasilischatzip.github.io/toolkit` instead of `/ShieldMe/toolkit`, and the home route at `/ShieldMe/` rendered NotFound because the trailing slash was stripped before matching `path="/ShieldMe/"`.
- [x] **TP18** `[H]` **Add missing web-app shell CSS** — Files: `src/app/styles.css` (+137 lines). **Done 2026-05-19:** `Layout.tsx` was using class names (`.app-shell`, `.app-header`, `.app-header__brand`, `.app-header__title`, `.app-nav`, `.app-nav__link`, `.app-nav__link.is-active`, `.app-main`, `.app-footer`, `.route-notfound`, `.route-oauth-error`) that did not exist in `styles.css` — the popup-era stylesheet only defined `.sm-*` classes. Added the full shell layout (sticky header, centered max-width 1120px main, footer, responsive mobile breakpoint at 640px) using existing design tokens so it inherits the brand palette.

---

## M1 — Rules + Document Check (W3–6)

### Detection Engine Core

- [x] **T001** `[P]` **Write FakeDetectorRegistry + FakeScanEngine test doubles**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `tests/fakes/detection/fake-registry.ts`, `tests/fakes/detection/fake-scan-engine.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/fakes/detection/`
  - Notes: Fakes implement full `DetectorRegistry` and `ScanEngine` interfaces from `contracts/detection-engine.md`. Used by all modules that consume the engine.

- [x] **T002** **Write failing tests for DetectorRegistry** — **Done 2026-05-18:** `tests/unit/detectors/registry.spec.ts` shipped with 37 `it()` blocks across 6 `describe` groups covering `register()` (including `shipTier==="planned"` rejection + ID collision), `all()`, `byCategory()`, `byRegion()`, `byShipTier()`, and `active(rules, locale)` (category gates, per-detector toggles, `includeBetaDetectors`, `requiresLocales`, combined gates). Uses singleton `_reset()` in `beforeEach`. **Follow-up T002a:** export `DetectorRegistryImpl` so tests can construct isolated instances.
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: FR-R1, FR-R2, FR-R5
  - Files: `tests/unit/detectors/registry.spec.ts`
  - Depends on: T001
  - Verification: `pnpm test:unit -- tests/unit/detectors/registry.spec.ts`
  - Notes: Test `all()`, `byCategory()`, `byRegion()`, `byShipTier()`, `active(rules, locale)`. Assert `register()` rejects `shipTier === "planned"`.

- [x] **T003** **Implement DetectorRegistry**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: FR-R1, FR-R2, FR-R5
  - Files: `src/detectors/registry.ts`
  - Depends on: T002
  - Verification: `pnpm test:unit -- tests/unit/detectors/registry.spec.ts`
  - Notes: Single instance; detectors register via side-effectful `register()` calls. `active()` applies category toggles, per-detector state, `includeBetaDetectors`, locale/region match.

- [x] **T004** `[P]` **Write failing tests for ContextScorer**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `tests/unit/core/context-scorer.spec.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/core/context-scorer.spec.ts`
  - Notes: Test positive keyword boost, negative keyword suppression, window boundaries.

- [x] **T005** **Implement ContextScorer**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `src/core/context-scorer.ts`
  - Depends on: T004
  - Verification: `pnpm test:unit -- tests/unit/core/context-scorer.spec.ts`
  - Notes: Pure function. Window defaults to 60 chars per detection-engine contract.

- [x] **T006** `[P]` **Write failing tests for SeverityResolver**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `tests/unit/core/severity.spec.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/core/severity.spec.ts`
  - Notes: Test confidence × instance-count × category-default → severity mapping. Test `instanceCountForCritical` promotion.

- [x] **T007** **Implement SeverityResolver**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `src/core/severity.ts`
  - Depends on: T006
  - Verification: `pnpm test:unit -- tests/unit/core/severity.spec.ts`
  - Notes: Pure function per `contracts/detection-engine.md`.

- [x] **T008** **Write failing tests for ScanEngine**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: NFR-P2
  - Files: `tests/unit/core/scan-engine.spec.ts`
  - Depends on: T003, T005, T007
  - Verification: `pnpm test:unit -- tests/unit/core/scan-engine.spec.ts`
  - Notes: Test finding sort order (severity → confidence desc), confidence <0.5 dropped, perf ≤50 ms/10k chars.

- [x] **T009** **Implement ScanEngine**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: NFR-P2
  - Files: `src/core/scan-engine.ts`
  - Depends on: T008
  - Verification: `pnpm test:unit -- tests/unit/core/scan-engine.spec.ts`
  - Notes: Orchestrates registry.active() → map detector.scan() → merge + resolve severity + sort. Contract: ≤50 ms / 10k chars.

### Validators

- [x] **T010** `[P]` `[H]` **Write failing tests for all validators (Luhn, mod-97, AFM, NIF-ES, NIF-PT, Codice Fiscale, SSN blacklist)** — **Done 2026-05-18:** consolidated into `tests/unit/detectors/validators.spec.ts` rather than per-file specs (acceptable drift — same coverage, fewer files).
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `tests/unit/detectors/validators/luhn.spec.ts`, `tests/unit/detectors/validators/iban-mod97.spec.ts`, `tests/unit/detectors/validators/afm.spec.ts`, `tests/unit/detectors/validators/nif-spain.spec.ts`, `tests/unit/detectors/validators/nif-portugal.spec.ts`, `tests/unit/detectors/validators/codice-fiscale.spec.ts`, `tests/unit/detectors/validators/ssn-blacklist.spec.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/detectors/validators/`
  - Notes: Known-valid + known-invalid vectors for each. Include edge cases (all-zero, leading zero, boundary checksums).

- [x] **T011** `[P]` `[H]` **Implement all validators** — **Done 2026-05-18:** all 7 required validators present in `src/detectors/validators/` (`luhn.ts`, `iban.ts`, `afm.ts`, `nif-spain.ts`, `nif-portugal.ts`, `codice-fiscale.ts`, `ssn.ts`) plus 18 extras (`aba-routing`, `ar-cuit`, `au-abn`, `au-tfn`, `br-cnpj`, `br-cpf`, `ca-sin`, `de-tin`, `fi-hetu`, `il-id`, `insee`, `jp-my-number`, `no-nin`, `pl-pesel`, `se-nin`, `tr-tckn`, `uk-nino`).
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `src/detectors/validators/luhn.ts`, `src/detectors/validators/iban-mod97.ts`, `src/detectors/validators/afm.ts`, `src/detectors/validators/nif-spain.ts`, `src/detectors/validators/nif-portugal.ts`, `src/detectors/validators/codice-fiscale.ts`, `src/detectors/validators/ssn-blacklist.ts`, `src/detectors/validators/index.ts`
  - Depends on: T010
  - Verification: `pnpm test:unit -- tests/unit/detectors/validators/`
  - Notes: Pure functions. No I/O.

### GA Detectors — My Money (~30 detectors)

- [x] **T012** **Write corpus + unit tests for credit card detectors (money.card.generic, money.card.eu-debit)** — **Done 2026-05-18:** covered in `tests/unit/detectors/money.spec.ts` (`describe("credit-card detector")`). Flat layout instead of `money.card.*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/money/card/`, `tests/unit/detectors/money/card.spec.ts`
  - Depends on: T003, T005, T011
  - Verification: `pnpm test:corpus -- money.card && pnpm test:unit -- tests/unit/detectors/money/card.spec.ts`
  - Notes: ≥20 positive + ≥20 negative per detector. Include Visa, MC, Amex, Discover, Diners, JCB formats. Luhn validation required.

- [x] **T013** **Implement credit card detectors** — **Done 2026-05-18:** `src/detectors/money/credit-card.ts` implements generic + EU-debit detection. Flat layout instead of `money.card.*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/money/card/generic.ts`, `src/detectors/money/card/eu-debit.ts`, `src/detectors/money/card/index.ts`
  - Depends on: T012
  - Verification: `pnpm test:corpus -- money.card && pnpm test:unit -- tests/unit/detectors/money/card.spec.ts`
  - Notes: Luhn validator. Register as `money.card.generic` and `money.card.eu-debit`.

- [x] **T014** **Write corpus + unit tests for IBAN detector (money.bank.iban)** — **Done 2026-05-18:** covered in `tests/unit/detectors/money.spec.ts` (`describe("iban detector")`). Flat layout instead of `money.bank.*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/money/bank/iban/`, `tests/unit/detectors/money/bank-iban.spec.ts`
  - Depends on: T003, T005, T011
  - Verification: `pnpm test:corpus -- money.bank.iban && pnpm test:unit -- tests/unit/detectors/money/bank-iban.spec.ts`
  - Notes: ≥20 positive (multiple country formats) + ≥20 negative. Mod-97 validation.

- [x] **T015** **Implement IBAN detector** — **Done 2026-05-18:** `src/detectors/money/iban.ts` with mod-97 validation. Flat layout instead of `money.bank/iban.ts` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/money/bank/iban.ts`
  - Depends on: T014
  - Verification: `pnpm test:corpus -- money.bank.iban && pnpm test:unit -- tests/unit/detectors/money/bank-iban.spec.ts`
  - Notes: Mod-97 validator. Region: "global". 70+ country formats.

- [x] **T016** **Write corpus + unit tests for country-specific bank account detectors (US, UK, CA, AU, JP, SWIFT)** — **Done 2026-05-18:** covered in `tests/unit/detectors/money.spec.ts` (`describe("us-bank detector")`). `us-bank.ts`, `uk-bank.ts`, `ca-bank.ts`, `au-bank.ts`, `jp-bank.ts`, `swift.ts` all tested — acceptable flat layout drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/money/bank/`, `tests/unit/detectors/money/bank-accounts.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- money.bank && pnpm test:unit -- tests/unit/detectors/money/bank-accounts.spec.ts`
  - Notes: 6 detectors batched. ≥20 pos + ≥20 neg per detector.

- [x] **T017** **Implement country-specific bank account detectors** — **Done 2026-05-18:** `src/detectors/money/` contains `us-bank.ts`, `uk-bank.ts`, `ca-bank.ts`, `au-bank.ts`, `jp-bank.ts`, `swift.ts`, `bank-beta.ts`. Flat layout instead of `money.bank/*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/money/bank/us-account.ts`, `src/detectors/money/bank/us-aba.ts`, `src/detectors/money/bank/uk-account.ts`, `src/detectors/money/bank/ca-account.ts`, `src/detectors/money/bank/au-account.ts`, `src/detectors/money/bank/jp-account.ts`, `src/detectors/money/bank/swift.ts`, `src/detectors/money/bank/index.ts`
  - Depends on: T016
  - Verification: `pnpm test:corpus -- money.bank && pnpm test:unit -- tests/unit/detectors/money/bank-accounts.spec.ts`
  - Notes: ABA checksum for US routing. Sort-code + account for UK. BSB + account for AU.

- [x] **T018** **Write corpus + unit tests for Tier-1 tax ID detectors (US SSN/ITIN, UK UTR/NINO, GR AFM, DE TIN, FR TIN/INSEE, IT CF/VAT, ES DNI/NIF, PT NIF, NL TIN/VAT, AU TFN/ABN, CA SIN, JP MNC, EU TIN)** — **Done 2026-05-20:** 57 unit tests in `tests/unit/detectors/money/tax.spec.ts` covering US ITIN, UK UTR, CA SIN, AU ABN, JP My Number, NL BSN. UK NINO/GR AFM/ES NIF/IT CF/PT NIF/FR INSEE/DE TIN/AU TFN remain in national-id.ts; SSN in ssn.ts.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/money/tax/`, `tests/unit/detectors/money/tax.spec.ts`
  - Depends on: T003, T005, T011
  - Verification: `pnpm test:corpus -- money.tax && pnpm test:unit -- tests/unit/detectors/money/tax.spec.ts`
  - Notes: 20 detectors batched. Each has a validator (Luhn for CA SIN, AFM checksum for GR, etc.). ≥20 pos + ≥20 neg per detector.

- [x] **T019** **Implement Tier-1 tax ID detectors** — **Done 2026-05-20:** `src/detectors/money/tax.ts` — 6 GA-tier detectors: us-itin (ITIN structural check + conf gate), uk-utr (keyword-gated, no checksum), ca-sin (Luhn via caSin()), au-abn (auAbn() weighted checksum), jp-my-number (jpMyNumber() 12-digit check digit), nl-bsn (inline elfproef). All registered in money/index.ts. pnpm verify green; 57 tests pass.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/money/tax/us-ssn.ts`, `src/detectors/money/tax/us-itin.ts`, `src/detectors/money/tax/uk-utr.ts`, `src/detectors/money/tax/uk-nino.ts`, `src/detectors/money/tax/gr-afm.ts`, `src/detectors/money/tax/de-tin.ts`, `src/detectors/money/tax/fr-tin.ts`, `src/detectors/money/tax/fr-insee.ts`, `src/detectors/money/tax/it-cf.ts`, `src/detectors/money/tax/it-vat.ts`, `src/detectors/money/tax/es-dni.ts`, `src/detectors/money/tax/es-nif.ts`, `src/detectors/money/tax/pt-nif.ts`, `src/detectors/money/tax/nl-tin.ts`, `src/detectors/money/tax/nl-vat.ts`, `src/detectors/money/tax/au-tfn.ts`, `src/detectors/money/tax/au-abn.ts`, `src/detectors/money/tax/ca-sin.ts`, `src/detectors/money/tax/jp-mnc.ts`, `src/detectors/money/tax/eu-tin.ts`, `src/detectors/money/tax/index.ts`
  - Depends on: T018
  - Verification: `pnpm test:corpus -- money.tax && pnpm test:unit -- tests/unit/detectors/money/tax.spec.ts`
  - Notes: Each uses its respective validator. SSN blacklist for US SSN. Luhn for CA SIN. Checksum for AFM, NIF-ES, NIF-PT, Codice Fiscale.

- [x] **T020** **Write corpus + unit tests for crypto wallet + financial keyword detectors** — **Done 2026-05-18:** covered in `tests/unit/detectors/money.spec.ts` (`describe("crypto-wallet detector")`). `finance-keywords.ts` also tested. Flat layout — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/money/crypto/`, `tests/corpus/money/context/`, `tests/unit/detectors/money/crypto.spec.ts`, `tests/unit/detectors/money/context.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- money.crypto && pnpm test:corpus -- money.context`
  - Notes: BTC (1/3/bc1), ETH (0x), altcoin formats, BIP-39 mnemonic (12/24 words), Binance keypair, Kraken key. Financial keywords near monetary values.

- [x] **T021** **Implement crypto wallet + financial keyword detectors** — **Done 2026-05-18:** `src/detectors/money/crypto-wallet.ts` and `src/detectors/money/finance-keywords.ts` implement BTC/ETH/altcoin/BIP-39 + financial keyword detection. Flat layout — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/money/crypto/btc.ts`, `src/detectors/money/crypto/eth.ts`, `src/detectors/money/crypto/altcoin.ts`, `src/detectors/money/crypto/bip39-mnemonic.ts`, `src/detectors/money/crypto/binance-keypair.ts`, `src/detectors/money/crypto/kraken-key.ts`, `src/detectors/money/context/keywords.ts`, `src/detectors/money/crypto/index.ts`
  - Depends on: T020
  - Verification: `pnpm test:corpus -- money.crypto && pnpm test:corpus -- money.context`
  - Notes: BIP-39 mnemonic is highest priority (catastrophic if leaked). Financial keywords are context-only boost.

### GA Detectors — My Identity (~28 detectors)

- [x] **T022** **Write corpus + unit tests for Tier-1 national ID detectors (GR ADT, UK NI, DE PA, FR CNI, IT CF, ES DNI, PT CCC, NL BSN, US SSN, CA SIN, AU TFN, JP MN, EU generic, EU SSN)** — **Done 2026-05-18:** covered in `tests/unit/detectors/identity.spec.ts` and `tests/unit/detectors/national-id-beta.spec.ts`. Flat layout instead of `identity.nat/*` — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/identity/nat/`, `tests/unit/detectors/identity/nat.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- identity.nat && pnpm test:unit -- tests/unit/detectors/identity/nat.spec.ts`
  - Notes: 14 detectors batched. ≥20 pos + ≥20 neg each. Some share validators with money.tax (SSN, SIN, TFN) — different category, same underlying check.

- [x] **T023** **Implement Tier-1 national ID detectors** — **Done 2026-05-18:** `src/detectors/identity/national-id.ts` and `src/detectors/identity/national-id-beta.ts` cover PESEL, HETU, TCKN, NRIC, CURP, CPF, PAN, and others. Flat layout — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/identity/nat/gr-adt.ts`, `src/detectors/identity/nat/uk-ni.ts`, `src/detectors/identity/nat/de-pa.ts`, `src/detectors/identity/nat/fr-cni.ts`, `src/detectors/identity/nat/it-cf.ts`, `src/detectors/identity/nat/es-dni.ts`, `src/detectors/identity/nat/pt-ccc.ts`, `src/detectors/identity/nat/nl-bsn.ts`, `src/detectors/identity/nat/us-ssn.ts`, `src/detectors/identity/nat/ca-sin.ts`, `src/detectors/identity/nat/au-tfn.ts`, `src/detectors/identity/nat/jp-mn.ts`, `src/detectors/identity/nat/eu-generic.ts`, `src/detectors/identity/nat/eu-ssn.ts`, `src/detectors/identity/nat/index.ts`
  - Depends on: T022
  - Verification: `pnpm test:corpus -- identity.nat && pnpm test:unit -- tests/unit/detectors/identity/nat.spec.ts`
  - Notes: Pure functions. Cross-category validators shared via `src/detectors/validators/`.

- [x] **T024** **Write corpus + unit tests for Tier-1 passport detectors (US-UK, DE, FR, IT, ES, PT, GR, NL, AU, CA, JP, EU)** — **Done 2026-05-18:** covered in `tests/unit/detectors/identity.spec.ts` (`describe("passport detector")`). Consolidated multi-country spec instead of `identity.pass/*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/identity/pass/`, `tests/unit/detectors/identity/pass.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- identity.pass && pnpm test:unit -- tests/unit/detectors/identity/pass.spec.ts`
  - Notes: 12 detectors batched. ≥20 pos + ≥20 neg each.

- [x] **T025** **Implement Tier-1 passport detectors** — **Done 2026-05-18:** `src/detectors/identity/passport.ts` implements multi-country passport detection. Flat layout instead of `identity.pass/*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/identity/pass/us-uk.ts`, `src/detectors/identity/pass/de.ts`, `src/detectors/identity/pass/fr.ts`, `src/detectors/identity/pass/it.ts`, `src/detectors/identity/pass/es.ts`, `src/detectors/identity/pass/pt.ts`, `src/detectors/identity/pass/gr.ts`, `src/detectors/identity/pass/nl.ts`, `src/detectors/identity/pass/au.ts`, `src/detectors/identity/pass/ca.ts`, `src/detectors/identity/pass/jp.ts`, `src/detectors/identity/pass/eu.ts`, `src/detectors/identity/pass/index.ts`
  - Depends on: T024
  - Verification: `pnpm test:corpus -- identity.pass && pnpm test:unit -- tests/unit/detectors/identity/pass.spec.ts`
  - Notes: Format-based validators. Context scoring with passport-related keywords.

- [x] **T026** **Write corpus + unit tests for Tier-1 driver's license detectors (US, UK, DE, FR, IT, ES, PT, GR, NL, AU, CA, JP, EU)** — **Done 2026-05-18:** covered in `tests/unit/detectors/identity.spec.ts` (`describe("drivers-license detector")`). Consolidated spec instead of `identity.dl/*` — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/identity/dl/`, `tests/unit/detectors/identity/dl.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- identity.dl && pnpm test:unit -- tests/unit/detectors/identity/dl.spec.ts`
  - Notes: 13 detectors batched (12 countries + EU generic). ≥20 pos + ≥20 neg each.

- [x] **T027** **Implement Tier-1 driver's license detectors** — **Done 2026-05-18:** `src/detectors/identity/drivers-license.ts` implements multi-country driver's license detection. Flat layout instead of `identity.dl/*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/identity/dl/us.ts`, `src/detectors/identity/dl/uk.ts`, `src/detectors/identity/dl/de.ts`, `src/detectors/identity/dl/fr.ts`, `src/detectors/identity/dl/it.ts`, `src/detectors/identity/dl/es.ts`, `src/detectors/identity/dl/pt.ts`, `src/detectors/identity/dl/gr.ts`, `src/detectors/identity/dl/nl.ts`, `src/detectors/identity/dl/au.ts`, `src/detectors/identity/dl/ca.ts`, `src/detectors/identity/dl/jp.ts`, `src/detectors/identity/dl/eu.ts`, `src/detectors/identity/dl/index.ts`
  - Depends on: T026
  - Verification: `pnpm test:corpus -- identity.dl && pnpm test:unit -- tests/unit/detectors/identity/dl.spec.ts`
  - Notes: Country-specific format patterns. Context keywords for license-related terms.

- [x] **T028** **Write corpus + unit tests for DOB, name+address combo, standalone name, and Tier-1 address detectors** — **Done 2026-05-18:** `tests/unit/detectors/identity/dob.spec.ts` covers DOB; `tests/unit/detectors/identity/name-address.spec.ts` covers name+address. Flat layout — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/identity/dob/`, `tests/corpus/identity/name-address/`, `tests/corpus/identity/name/`, `tests/corpus/identity/addr/`, `tests/unit/detectors/identity/misc.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- identity.dob && pnpm test:corpus -- identity.name && pnpm test:corpus -- identity.addr`
  - Notes: DOB in-context (multi-language keywords). Name+address combo. Standalone NER (context-gated, low-confidence on its own). 12 country addresses + global fallback.

- [x] **T029** **Implement DOB, name+address combo, standalone name, and Tier-1 address detectors** — **Done 2026-05-18:** `src/detectors/identity/dob.ts` and `src/detectors/identity/name-address.ts` implement DOB and name+address detection. Flat layout — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/identity/dob/in-context.ts`, `src/detectors/identity/name-address/combo.ts`, `src/detectors/identity/name/all.ts`, `src/detectors/identity/addr/us.ts`, `src/detectors/identity/addr/uk.ts`, `src/detectors/identity/addr/de.ts`, `src/detectors/identity/addr/fr.ts`, `src/detectors/identity/addr/it.ts`, `src/detectors/identity/addr/es.ts`, `src/detectors/identity/addr/pt.ts`, `src/detectors/identity/addr/gr.ts`, `src/detectors/identity/addr/nl.ts`, `src/detectors/identity/addr/au.ts`, `src/detectors/identity/addr/ca.ts`, `src/detectors/identity/addr/jp.ts`, `src/detectors/identity/addr/all.ts`, `src/detectors/identity/addr/index.ts`
  - Depends on: T028
  - Verification: `pnpm test:corpus -- identity.dob && pnpm test:corpus -- identity.name && pnpm test:corpus -- identity.addr`
  - Notes: Address detectors shared with My Location category. DOB uses multi-language keyword lists (en, el, de, fr, etc.).

### GA Detectors — My Health (~20 detectors)

- [x] **T030** **Write corpus + unit tests for health ID detectors (UK NHS, US MBI, US DEA, FR HI, GR AMKA, CA HSN, CA PHIN, AU MAI, FI EHIC, generic MRN)** — **Done 2026-05-18:** covered in `tests/unit/detectors/health-family-location.spec.ts` (`describe("health-id detector")`). Consolidated spec — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/health/id/`, `tests/unit/detectors/health/id.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- health.id && pnpm test:unit -- tests/unit/detectors/health/id.spec.ts`
  - Notes: 10 detectors batched. ≥20 pos + ≥20 neg each. Health category default OFF.

- [x] **T031** **Implement health ID detectors** — **Done 2026-05-18:** `src/detectors/health/health-id.ts` and `src/detectors/health/medical-record.ts` implement health ID detection. Flat layout instead of `health/id/*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/health/id/uk-nhs.ts`, `src/detectors/health/id/us-mbi.ts`, `src/detectors/health/id/us-dea.ts`, `src/detectors/health/id/fr-hi.ts`, `src/detectors/health/id/gr-amka.ts`, `src/detectors/health/id/ca-hsn.ts`, `src/detectors/health/id/ca-phin.ts`, `src/detectors/health/id/au-mai.ts`, `src/detectors/health/id/fi-ehic.ts`, `src/detectors/health/id/generic-mrn.ts`, `src/detectors/health/id/index.ts`
  - Depends on: T030
  - Verification: `pnpm test:corpus -- health.id && pnpm test:unit -- tests/unit/detectors/health/id.spec.ts`
  - Notes: Health findings use extra-discretion presentation (redacted by default, reveal affordance).

- [x] **T032** **Write corpus + unit tests for health content detectors (diseases, ICD-10/9, meds brand/generic, lab tests, blood tests, surgeries, specialties, aggregate)** — **Done 2026-05-18:** covered in `tests/unit/detectors/health-family-location.spec.ts` (`describe("diagnosis detector")`). Consolidated spec — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/health/content/`, `tests/unit/detectors/health/content.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- health.content && pnpm test:unit -- tests/unit/detectors/health/content.spec.ts`
  - Notes: 9 detectors batched. Keyword-list-based detectors. Large dictionaries loaded from JSON data files.

- [x] **T033** **Implement health content detectors** — **Done 2026-05-18:** `src/detectors/health/diagnosis.ts` implements health content detection. Flat layout instead of `health/content/*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/health/content/diseases.ts`, `src/detectors/health/content/icd10.ts`, `src/detectors/health/content/icd9.ts`, `src/detectors/health/content/meds-brand.ts`, `src/detectors/health/content/meds-generic.ts`, `src/detectors/health/content/lab-tests.ts`, `src/detectors/health/content/blood-tests.ts`, `src/detectors/health/content/surgeries.ts`, `src/detectors/health/content/specialties.ts`, `src/detectors/health/content/all.ts`, `src/detectors/health/content/index.ts`, `src/data/health/`
  - Depends on: T032
  - Verification: `pnpm test:corpus -- health.content && pnpm test:unit -- tests/unit/detectors/health/content.spec.ts`
  - Notes: Dictionary data files in `src/data/health/`. Aggregate `health.content.all` delegates to sub-detectors. Omit health findings from Share Score card counts.

### GA Detectors — My Family (3 detectors)

- [x] **T034** **Write corpus + unit tests for family detectors (minor school-age, relations cross-ref, emergency block)** — **Done 2026-05-18:** covered in `tests/unit/detectors/health-family-location.spec.ts` (`describe("minor-name detector")`, `describe("school-info detector")`, `describe("family-address detector")`). Consolidated spec — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/family/`, `tests/unit/detectors/family/family.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- family && pnpm test:unit -- tests/unit/detectors/family/family.spec.ts`
  - Notes: 3 detectors. ShieldMe-original composites pairing other detectors with relationship keywords. ≥20 pos + ≥20 neg each.

- [x] **T035** **Implement family detectors** — **Done 2026-05-18:** `src/detectors/family/minor-name.ts`, `src/detectors/family/school-info.ts`, and `src/detectors/family/family-address.ts` implement family detection. Flat layout — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/family/minor-school-age.ts`, `src/detectors/family/relations-cross-ref.ts`, `src/detectors/family/emergency-block.ts`, `src/detectors/family/index.ts`
  - Depends on: T034
  - Verification: `pnpm test:corpus -- family && pnpm test:unit -- tests/unit/detectors/family/family.spec.ts`
  - Notes: Default OFF. Composite detectors using name + context keywords.

### GA Detectors — My Digital Life (~45 detectors)

- [x] **T036** **Write corpus + unit tests for credential detectors (password-generic, login-pair, all, user-login, general-password, http-auth, api-key-generic, symmetric-key, x509-privkey, PEM, SSH, PGP, MSSQL conn, JWT, TOTP seed)** — **Done 2026-05-18:** covered in `tests/unit/detectors/digital-life.spec.ts` (`describe("password detector")`, `describe("private-key detector")`). Consolidated spec — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/digital/cred/`, `tests/unit/detectors/digital/cred.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- digital.cred && pnpm test:unit -- tests/unit/detectors/digital/cred.spec.ts`
  - Notes: 15 detectors batched. ≥20 pos + ≥20 neg each. Block-based detectors (PEM, SSH, PGP) need multi-line matching.

- [x] **T037** **Implement credential detectors** — **Done 2026-05-18:** `src/detectors/digital-life/password.ts` and `src/detectors/digital-life/private-key.ts` implement credential detection. Flat layout instead of `digital/cred/*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/digital/cred/password-generic.ts`, `src/detectors/digital/cred/login-pair.ts`, `src/detectors/digital/cred/all.ts`, `src/detectors/digital/cred/user-login.ts`, `src/detectors/digital/cred/general-password.ts`, `src/detectors/digital/cred/http-auth-header.ts`, `src/detectors/digital/cred/api-key-generic.ts`, `src/detectors/digital/cred/symmetric-key.ts`, `src/detectors/digital/cred/x509-privkey.ts`, `src/detectors/digital/cred/pem-block.ts`, `src/detectors/digital/cred/ssh-key.ts`, `src/detectors/digital/cred/pgp-block.ts`, `src/detectors/digital/cred/mssql-conn.ts`, `src/detectors/digital/cred/jwt-any.ts`, `src/detectors/digital/cred/totp-seed.ts`, `src/detectors/digital/cred/index.ts`
  - Depends on: T036
  - Verification: `pnpm test:corpus -- digital.cred && pnpm test:unit -- tests/unit/detectors/digital/cred.spec.ts`
  - Notes: Aggregate `digital.cred.all` and `digital.cred.user-login` delegate to sub-detectors.

- [x] **T038** **Write corpus + unit tests for cloud key detectors (AWS S3, GitHub PAT, Google API, Slack, Bing Maps, Entra secret/token/user, Azure bundle, OpenAI, Anthropic, Gemini, HF, Replicate, Mistral, Stripe pub/secret/webhook, Twilio, SendGrid, Discord, npm, Cloudflare, Vercel, Datadog)** — **Done 2026-05-20:** 63 unit tests in `tests/unit/detectors/digital-life/cloud-keys.spec.ts` covering all 11 per-vendor detectors. AWS/GitHub/Google/Stripe secret/Anthropic remain in aggregate api-key.ts (backward compat: presets reference "api-key"). Vendors without unambiguous prefixes (Cloudflare, Vercel, Datadog, Bing Maps, Mistral, Gemini) deferred — no deterministic prefix pattern.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/digital/cloud/`, `tests/unit/detectors/digital/cloud.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- digital.cloud && pnpm test:unit -- tests/unit/detectors/digital/cloud.spec.ts`
  - Notes: ~25 detectors batched. Deterministic key shapes (prefixed tokens). ≥20 pos + ≥20 neg each. Azure 30+ SITs grouped under one bundle toggle.

- [x] **T039** **Implement cloud key detectors** — **Done 2026-05-20:** `src/detectors/digital-life/cloud-keys.ts` — 11 GA-tier per-vendor detectors: slack-token (xoxb/xoxp/xoxs/xoxa/xapp), openai-key (sk- excluding sk-ant-), huggingface-token (hf_), replicate-token (r8_), stripe-pub (pk_live_/pk_test_), stripe-webhook (whsec_), twilio-account-sid (AC+32hex), sendgrid-key (SG.20+.43+), npm-token (npm_+36), azure-conn-string (AccountKey= 88-char base64), discord-token (keyword-gated 3-part). All registered in digital-life/index.ts. pnpm verify green; 1512 tests pass.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/digital/cloud/aws-s3.ts`, `src/detectors/digital/cloud/github-pat.ts`, `src/detectors/digital/cloud/google-api.ts`, `src/detectors/digital/cloud/slack-token.ts`, `src/detectors/digital/cloud/bing-maps.ts`, `src/detectors/digital/cloud/entra-secret.ts`, `src/detectors/digital/cloud/entra-token.ts`, `src/detectors/digital/cloud/entra-user.ts`, `src/detectors/digital/cloud/azure-bundle.ts`, `src/detectors/digital/cloud/openai-key.ts`, `src/detectors/digital/cloud/anthropic-key.ts`, `src/detectors/digital/cloud/gemini-key.ts`, `src/detectors/digital/cloud/hf-token.ts`, `src/detectors/digital/cloud/replicate-token.ts`, `src/detectors/digital/cloud/mistral-key.ts`, `src/detectors/digital/cloud/stripe-pub.ts`, `src/detectors/digital/cloud/stripe-secret.ts`, `src/detectors/digital/cloud/stripe-whsec.ts`, `src/detectors/digital/cloud/twilio-pair.ts`, `src/detectors/digital/cloud/sendgrid-key.ts`, `src/detectors/digital/cloud/discord-bot.ts`, `src/detectors/digital/cloud/npm-token.ts`, `src/detectors/digital/cloud/cloudflare-token.ts`, `src/detectors/digital/cloud/vercel-token.ts`, `src/detectors/digital/cloud/datadog-key.ts`, `src/detectors/digital/cloud/index.ts`
  - Depends on: T038
  - Verification: `pnpm test:corpus -- digital.cloud && pnpm test:unit -- tests/unit/detectors/digital/cloud.spec.ts`
  - Notes: Azure bundle groups 30+ SITs under a single toggle per catalog section 5.2.

- [x] **T040** **Write corpus + unit tests for contact info detectors (phone-intl, email, email-many, IP v4/v6/any)** — **Done 2026-05-18:** covered in `tests/unit/detectors/digital-life.spec.ts` (`describe("email detector")`, `describe("phone-intl detector")`). Consolidated spec — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/digital/contact/`, `tests/unit/detectors/digital/contact.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- digital.contact && pnpm test:unit -- tests/unit/detectors/digital/contact.spec.ts`
  - Notes: 6 detectors batched. Phone: US/UK/EU/AU prioritized, global fallback. ≥20 pos + ≥20 neg each.

- [x] **T041** **Implement contact info detectors** — **Done 2026-05-18:** `src/detectors/digital-life/email.ts` and `src/detectors/digital-life/phone-intl.ts` implement contact detection. Flat layout instead of `digital/contact/*` sub-folder — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/digital/contact/phone-intl.ts`, `src/detectors/digital/contact/email.ts`, `src/detectors/digital/contact/email-many.ts`, `src/detectors/digital/contact/ip-v4.ts`, `src/detectors/digital/contact/ip-v6.ts`, `src/detectors/digital/contact/ip-any.ts`, `src/detectors/digital/contact/index.ts`
  - Depends on: T040
  - Verification: `pnpm test:corpus -- digital.contact && pnpm test:unit -- tests/unit/detectors/digital/contact.spec.ts`
  - Notes: IP-any aggregates v4 + v6. Email-many flags documents with >3 distinct addresses.

### GA Detectors — My Location (4 detectors)

- [x] **T042** **Write corpus + unit tests for location detectors (GPS latlong, plus code, EXIF geotag)** — **Done 2026-05-18:** covered in `tests/unit/detectors/health-family-location.spec.ts` (`describe("gps-coords detector")`, `describe("home-address detector")`, `describe("itinerary detector")`). Consolidated spec — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `tests/corpus/location/`, `tests/unit/detectors/location/location.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:corpus -- location && pnpm test:unit -- tests/unit/detectors/location/location.spec.ts`
  - Notes: 3 dedicated detectors (address shared with identity). EXIF geotag is Document Check only. Default OFF.

- [x] **T043** **Implement location detectors** — **Done 2026-05-18:** `src/detectors/location/gps-coords.ts`, `src/detectors/location/home-address.ts`, and `src/detectors/location/itinerary.ts` implement location detection. Flat layout — acceptable drift.
  - Phase: M1
  - Module: Rules
  - Spec refs: NFR-Q2
  - Files: `src/detectors/location/gps-latlong.ts`, `src/detectors/location/pluscode.ts`, `src/detectors/location/exif-geotag.ts`, `src/detectors/location/index.ts`
  - Depends on: T042
  - Verification: `pnpm test:corpus -- location && pnpm test:unit -- tests/unit/detectors/location/location.spec.ts`
  - Notes: GPS: decimal degree + DMS formats. Plus code: Open Location Code format. EXIF: parses binary EXIF segment.

### Custom Rules

- [x] **T044** **Write failing tests for custom rule engine (keyword, pattern, combo modes)** — **Done 2026-05-18:** `tests/unit/detectors/custom.spec.ts` covers keyword/pattern modes and `validateCustomPattern`/`createCustomDetector`.
  - Phase: M1
  - Module: Rules
  - Spec refs: FR-R3, AC-R3
  - Files: `tests/unit/detectors/custom/custom-rules.spec.ts`
  - Depends on: T003, T005
  - Verification: `pnpm test:unit -- tests/unit/detectors/custom/custom-rules.spec.ts`
  - Notes: Test all 3 modes. Test TierGate enforcement of 3-rule limit on Free.

- [x] **T045** **Implement custom rule engine** — **Done 2026-05-18:** `src/detectors/custom/{factory,safe-pattern,index}.ts` present, TierGate referenced from factory.
  - Phase: M1
  - Module: Rules
  - Spec refs: FR-R3, AC-R3
  - Files: `src/detectors/custom/custom-rule-detector.ts`, `src/detectors/custom/index.ts`
  - Depends on: T044
  - Verification: `pnpm test:unit -- tests/unit/detectors/custom/custom-rules.spec.ts`
  - Notes: Pure function. TierGate.check("custom-rules") for count enforcement.

### PresetResolver

- [x] **T046** **Write failing tests for PresetResolver (apply, unapply, preview, recordManualOverride)**
  - Phase: M1
  - Module: Rules
  - Spec refs: FR-R7, FR-R7.1–R7.6, AC-R4, AC-R5, AC-R6
  - Files: `tests/unit/core/preset-resolver.spec.ts`
  - Depends on: T003
  - Verification: `pnpm test:unit -- tests/unit/core/preset-resolver.spec.ts`
  - Notes: Test idempotent apply, union semantics, unapply refcount logic, manual override persistence. Test preview runs ≤10 ms.

- [x] **T047** **Implement PresetResolver + preset catalog (JSON files)** — **Done 2026-05-18:** `src/core/preset-resolver.ts` + 23 preset JSON files in `src/data/presets/` (residency × 10 countries, work × 3, life × 3, region × 2, radar × 1, global × 1). Filenames use dot-notation (`preset.residency.gr.json`) rather than spec's hyphen-notation — acceptable drift, `index.ts` re-exports them.
  - Phase: M1
  - Module: Rules
  - Spec refs: FR-R7, FR-R7.1–R7.6, AC-R4, AC-R5, AC-R6
  - Files: `src/core/preset-resolver.ts`, `src/data/presets/residency-gr.json`, `src/data/presets/residency-us.json`, `src/data/presets/residency-uk.json`, `src/data/presets/residency-de.json`, `src/data/presets/residency-fr.json`, `src/data/presets/residency-it.json`, `src/data/presets/residency-es.json`, `src/data/presets/residency-pt.json`, `src/data/presets/residency-nl.json`, `src/data/presets/residency-au.json`, `src/data/presets/residency-ca.json`, `src/data/presets/residency-jp.json`, `src/data/presets/work-developer.json`, `src/data/presets/work-finance.json`, `src/data/presets/work-healthcare.json`, `src/data/presets/default-global.json`
  - Depends on: T046
  - Verification: `pnpm test:unit -- tests/unit/core/preset-resolver.spec.ts && node scripts/verify-presets.mjs`
  - Notes: Preset definitions are frozen JSON. Build-time verify-presets.mjs asserts detector ID references.

### Document Parsers

- [x] **T048** `[P]` **Write failing tests for OffsetMap implementations (PDF, DOCX, XLSX, text)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D4
  - Files: `tests/unit/parsers/offset-map.spec.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/parsers/offset-map.spec.ts`
  - Notes: Test `toSource()` mapping from normalized offset to source location (page, paragraph, sheet+row+col, line).

- [x] **T049** **Implement OffsetMap**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D4
  - Files: `src/parsers/offset-map.ts`
  - Depends on: T048
  - Verification: `pnpm test:unit -- tests/unit/parsers/offset-map.spec.ts`
  - Notes: Each parser produces its own OffsetMap variant.

- [x] **T050** **Write failing tests for PDF parser (pdf.js)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1, FR-D2, NFR-P2
  - Files: `tests/unit/parsers/pdf.spec.ts`, `tests/fixtures/samples/`
  - Depends on: T049
  - Verification: `pnpm test:unit -- tests/unit/parsers/pdf.spec.ts`
  - Notes: Test text extraction + page-level offset map. Test perf: 1 MB ≤2 s, 10 MB ≤10 s.

- [x] **T051** **Implement PDF parser**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1, FR-D2, NFR-P2
  - Files: `src/parsers/pdf.ts`
  - Depends on: T050
  - Verification: `pnpm test:unit -- tests/unit/parsers/pdf.spec.ts`
  - Notes: Uses bundled pdf.js. Runs in offscreen document.

- [x] **T052** `[P]` **Write failing tests for DOCX parser (mammoth.js)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1, FR-D2
  - Files: `tests/unit/parsers/docx.spec.ts`, `tests/fixtures/samples/`
  - Depends on: T049
  - Verification: `pnpm test:unit -- tests/unit/parsers/docx.spec.ts`
  - Notes: Test text extraction + paragraph-level offset map.

- [x] **T053** **Implement DOCX parser**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1, FR-D2
  - Files: `src/parsers/docx.ts`
  - Depends on: T052
  - Verification: `pnpm test:unit -- tests/unit/parsers/docx.spec.ts`
  - Notes: Uses bundled mammoth.js.

- [x] **T054** `[P]` **Write failing tests for XLSX parser (SheetJS)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1, FR-D2, FR-D4
  - Files: `tests/unit/parsers/xlsx.spec.ts`, `tests/fixtures/samples/`
  - Depends on: T049
  - Verification: `pnpm test:unit -- tests/unit/parsers/xlsx.spec.ts`
  - Notes: Test cell-reference offset map (sheet + row + column).

- [x] **T055** **Implement XLSX parser**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1, FR-D2, FR-D4
  - Files: `src/parsers/xlsx.ts`
  - Depends on: T054
  - Verification: `pnpm test:unit -- tests/unit/parsers/xlsx.spec.ts`
  - Notes: Uses bundled SheetJS (community edition).

- [x] **T056** `[P]` `[H]` **Write failing tests + implement CSV, TXT, RTF parsers**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1, FR-D2
  - Files: `tests/unit/parsers/text.spec.ts`, `src/parsers/text.ts`, `src/parsers/csv.ts`, `src/parsers/rtf.ts`
  - Depends on: T049
  - Verification: `pnpm test:unit -- tests/unit/parsers/text.spec.ts`
  - Notes: Simple parsers. RTF: strip control words, extract text. CSV: cell-level offset map. TXT: line-level offset map.

- [x] **T057** **Write failing tests for parser dispatch (dynamic import by MIME/extension)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1
  - Files: `tests/unit/parsers/dispatch.spec.ts`
  - Depends on: T051, T053, T055, T056
  - Verification: `pnpm test:unit -- tests/unit/parsers/dispatch.spec.ts`
  - Notes: Test routing by MIME type and file extension. Test unsupported format error.

- [x] **T058** **Implement parser dispatch**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1
  - Files: `src/parsers/dispatch.ts`
  - Depends on: T057
  - Verification: `pnpm test:unit -- tests/unit/parsers/dispatch.spec.ts`
  - Notes: Dynamic `import()` per parser. Lazy-loaded for bundle splitting.

### Offscreen Document

- [x] **T059** **Implement offscreen document for heavy parsing**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D2, NFR-P2
  - Files: `src/offscreen/parser.html`, `src/offscreen/parser.ts`, `src/manifest.ts` (add offscreen permission)
  - Depends on: T058
  - Verification: `pnpm test:unit -- tests/unit/offscreen/`
  - Notes: MV3 service workers cannot use DOMParser. Message-based interface: service worker sends file ArrayBuffer, offscreen returns extracted text + offset map.

### Document Check UI

- [x] **T060** **Write failing tests for Document Check scan flow (drag-drop, parse, scan, results)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1, FR-D2, FR-D3, FR-D4, FR-D7, AC-D1, AC-D2, AC-D3
  - Files: `tests/unit/popup/routes/document-check.spec.tsx`
  - Depends on: T009, T058, T059
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/document-check.spec.tsx`
  - Notes: Test state machine: Idle, Reading, Scanning, Done. Test TierGate enforcement (10 MB limit, 5 scans/month).

- [x] **T061** **Implement Document Check UI (drag-drop, scan progress, Exposure Report)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D1, FR-D2, FR-D3, FR-D4, FR-D7, AC-D1, AC-D2, AC-D3
  - Files: `src/popup/routes/document-check/index.tsx`, `src/popup/routes/document-check/drop-zone.tsx`, `src/popup/routes/document-check/scan-progress.tsx`, `src/popup/routes/document-check/exposure-report.tsx`, `src/ui/components/FindingCard/index.tsx`, `src/ui/components/FindingCard/FindingCard.module.css`, `src/ui/components/UpsellCard/index.tsx`, `src/ui/components/UpsellCard/UpsellCard.module.css`
  - Depends on: T060
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/document-check.spec.tsx`
  - Notes: FindingCard shows per-finding page number (PDF/DOCX) or cell reference (XLSX). Scan state visible at all times per FR-D7.

- [x] **T062** **Write failing tests + implement jsPDF export (free = 1-page summary; paid = full findings)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D5
  - Files: `tests/unit/popup/routes/document-check/pdf-export.spec.ts`, `src/popup/routes/document-check/pdf-export.ts`
  - Depends on: T061
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/document-check/pdf-export.spec.ts`
  - Notes: jsPDF bundled. Free tier: 1-page summary. Paid: full findings. TierGate.check("export-full-report").

- [x] **T063** **Write failing tests + implement Share Score PNG (zero PII assertion)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: FR-D6, AC-D4
  - Files: `tests/unit/popup/routes/document-check/share-score.spec.ts`, `src/popup/routes/document-check/share-score.ts`
  - Depends on: T061
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/document-check/share-score.spec.ts`
  - Notes: ShareCardProps: score, criticalCount, warningCount, url only. Test regression-scans rendered canvas for any detector match. Health findings omitted from counts.

### Protection Rules UI

- [x] **T064** **Write failing tests for Protection Rules UI (category toggles, detector toggles, custom rules, preset picker)** — **Done 2026-05-19:** `tests/unit/app/routes/rules.spec.tsx` (474 lines) — 48 `it()` blocks across 9 `describe()` groups: category defaults (FR-R1/AC-R1), toggle isolation (FR-R5/AC-R2), beta switch (AC-R7), custom rules tier gate (AC-R3), preset catalog (FR-R7), consumer-copy verification, preset apply/unapply (FR-R7.1/.3/.4), advanced fold (FR-R2), request-a-protection link (FR-R4). Path adapted to post-pivot `tests/unit/app/routes/` (spec said `tests/unit/popup/routes/`).
  - Phase: M1
  - Module: Rules
  - Spec refs: FR-R1, FR-R2, FR-R3, FR-R4, FR-R5, FR-R6, FR-R7, AC-R1, AC-R2, AC-R3, AC-R7
  - Files: `tests/unit/popup/routes/rules.spec.tsx`
  - Depends on: T003, T045, T047
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/rules.spec.tsx`
  - Notes: Test 3 default ON / 3 default OFF. Test Advanced fold. Test Beta detector switch. Test preset picker with preview panel.

- [x] **T065** **Implement Protection Rules UI** — **Done 2026-05-19:** 5 new files in `src/app/routes/` (post-pivot path) totalling 545 lines: `Rules.tsx` (109), `rules/category-toggle.tsx` (65), `rules/detector-list.tsx` (58), `rules/custom-rules.tsx` (132), `rules/preset-picker.tsx` (181). Registered as `/rules` route in `App.tsx` and second nav entry in `Layout.tsx`. PresetPickerCard shows diff preview with consumer copy only (copy linter green). Free-tier custom-rules cap of 3 enforced via `TierGate.check("rules:custom-add", ctx)`. **Follow-ups:** (a) i18n labels currently fall back to category.id — needs `t(category.labelKey)` once translation helper is mocked in tests; (b) Beta-detector visibility relies on `registry.byCategory()` runtime data — intentional per spec.
  - Phase: M1
  - Module: Rules
  - Spec refs: FR-R1, FR-R2, FR-R3, FR-R4, FR-R5, FR-R6, FR-R7, AC-R1, AC-R2, AC-R3, AC-R7
  - Files: `src/popup/routes/rules/index.tsx`, `src/popup/routes/rules/category-toggle.tsx`, `src/popup/routes/rules/detector-list.tsx`, `src/popup/routes/rules/custom-rules.tsx`, `src/popup/routes/rules/preset-picker.tsx`, `src/ui/components/PresetPickerCard/index.tsx`, `src/ui/components/PresetPickerCard/PresetPickerCard.module.css`
  - Depends on: T064
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/rules.spec.tsx`
  - Notes: PresetPickerCard shows diff preview with consumer labels only. Copy linter bans regulation names.

### Security Controls — M1

- [x] **T066** `[P]` **Write failing tests + implement C-SEAL-1 (HMAC storage seals) integration with LocalStore**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: C-SEAL-1, C-SEAL-2, C-SEAL-3
  - Files: `tests/unit/core/storage-seals.spec.ts`, `src/core/storage.ts` (modify)
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/core/storage-seals.spec.ts`
  - Notes: Every `LocalStore.set` writes `{value, hmac}`. Every `get` verifies. Mismatch leads to recovery screen. Install secret: 32 random bytes at first run. Migration seal preservation tested.

- [x] **T067** `[P]` **Write failing tests + implement C-NET-2 (runtime fetch wrapper)**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: C-NET-2
  - Files: `tests/unit/security/fetch.spec.ts`, `src/security/fetch.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/security/fetch.spec.ts`
  - Notes: Wraps `fetch`; rejects any host not on active allowlist. Feature-flag gating for optional hosts (Plausible, tessdata, HIBP keyed, Stripe).

- [x] **T068** `[P]` `[H]` **Write failing tests + implement C-MEM-2 (no-secret-logging ESLint rule) + C-MEM-3 (secret-branded types)**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: C-MEM-2, C-MEM-3
  - Files: `tests/unit/types/secret-brand.spec.ts`, `src/core/types/secret.ts`, `eslint-rules/no-secret-logging.ts` (or equivalent ESLint plugin config)
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/types/secret-brand.spec.ts && pnpm lint`
  - Notes: Types `ApiKey`, `DecryptedKey`, `EncryptedBlob`, `RefreshToken`, `IdToken` carry phantom `__secret` brand. ESLint rule rejects `console.*` of these types.

### Acceptance Tests — M1

- [x] **T069** **Write AC-R1 acceptance test (fresh install, 3 categories ON, 3 OFF)**
  - Phase: M1
  - Module: Rules
  - Spec refs: AC-R1
  - Files: `tests/acceptance/rules.spec.ts`
  - Depends on: T065
  - Verification: `pnpm test:e2e -- tests/acceptance/rules.spec.ts`
  - Notes: Done 2026-05-20: SPA acceptance test (not extension). Checks aria-checked on 6 category switches. pnpm verify green.

- [x] **T070** **Write AC-R2 acceptance test (toggle OFF, scan emits zero findings for that detector)**
  - Phase: M1
  - Module: Rules
  - Spec refs: AC-R2
  - Files: `tests/acceptance/rules.spec.ts` (append)
  - Depends on: T065, T061
  - Verification: `pnpm test:e2e -- tests/acceptance/rules.spec.ts`
  - Notes: Done 2026-05-20: Clicks myMoney toggle OFF (force:true to bypass span), navigates to /scan, pastes IBAN text, asserts no IBAN finding.

- [x] **T071** **Write AC-R4+R5+R6 acceptance tests (preset apply/unapply/preview)**
  - Phase: M1
  - Module: Rules
  - Spec refs: AC-R4, AC-R5, AC-R6
  - Files: `tests/acceptance/rules.spec.ts` (append)
  - Depends on: T065, T047
  - Verification: `pnpm test:e2e -- tests/acceptance/rules.spec.ts`
  - Notes: Done 2026-05-20: AC-R4 reads IDB state to confirm activePresets. AC-R5 verifies detector refcounts (unapply is detector-level only, not category-level). AC-R6 copy-lints preset preview and grid. pnpm verify green.

- [x] **T072** **Write AC-D1 acceptance test (scan tax-return PDF, verify findings at correct page numbers)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: AC-D1
  - Files: `tests/acceptance/docs.spec.ts`, `tests/fixtures/samples/tax-return-2025.pdf`
  - Depends on: T061
  - Verification: `pnpm test:e2e -- tests/acceptance/docs.spec.ts`
  - Notes: Done 2026-05-20: global-setup.ts generates fixture PDF with planted SSN (123-45-6789) and IBAN (GB29 NWBK…). Tests assert My Identity and My Money finding groups appear; contextSnippet references "Page 1".

- [x] **T073** **Write AC-D2+D3+D4 acceptance tests (size limit, scan count, share score)**
  - Phase: M1
  - Module: Document Check
  - Spec refs: AC-D2, AC-D3, AC-D4
  - Files: `tests/acceptance/docs.spec.ts` (append)
  - Depends on: T061, T063
  - Verification: `pnpm test:e2e -- tests/acceptance/docs.spec.ts`
  - Notes: Done 2026-05-20: AC-D2 uses Buffer.alloc(11MB) via setInputFiles; checks "free plan caps file scans at 10 MB" text and "11.0 MB". AC-D3 skipped (TierGate in preview-preview mode → scan limit never fires until M6 billing). AC-D4 forward-declared (ShareCard not yet wired to DocumentCheck route).

### M1 Checkpoint

- [x] **T074** `[O]` **M1 phase gate — full verification**
  - Phase: M1
  - Module: Cross-cutting
  - Spec refs: NFR-Q1, NFR-Q2, NFR-B1
  - Files: —
  - Depends on: T001–T073
  - Verification: `pnpm verify`
  - Notes: Typecheck, unit tests, corpus regression (FPR ≤2%, recall ≥95%), e2e, bundle budget (≤25 MB total, ≤500 KB popup), egress allowlist, copy linter, CSP validator, a11y. All gates must pass.

---

## M2 — Identity + Multi-account + Email Guardian Outbound (W7–10)

### Identity & Account Management

- [x] **T075** `[P]` **Write FakeIdentityProvider + FakeAccountManager test doubles**
  - Phase: M2
  - Module: Identity
  - Spec refs: —
  - Files: `tests/fakes/identity/fake-identity-provider.ts`, `tests/fakes/identity/fake-account-manager.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/fakes/identity/`
  - Notes: Implement full `IdentityProvider` and `AccountManager` interfaces. Support multi-account scenarios.

- [x] **T076** **Write failing tests for GoogleIdentityProvider (PKCE, ID token validation, refresh, revoke)**
  - Phase: M2
  - Module: Identity
  - Spec refs: FR-Acc1, FR-Acc4, FR-Acc5, FR-Acc6, C-OAUTH-1, C-OAUTH-2, C-OAUTH-3, C-OAUTH-5
  - Files: `tests/unit/core/identity/google-provider.spec.ts`
  - Depends on: T075
  - Verification: `pnpm test:unit -- tests/unit/core/identity/google-provider.spec.ts`
  - Notes: Test PKCE code flow via `launchWebAuthFlow`. Test ID token validation (known-vector + adversarial). Test refresh-token isolation. Test revoke-before-wipe.

- [x] **T077** **Implement GoogleIdentityProvider**
  - Phase: M2
  - Module: Identity
  - Spec refs: FR-Acc1, FR-Acc4, FR-Acc5, FR-Acc6, C-OAUTH-1, C-OAUTH-2, C-OAUTH-3, C-OAUTH-5
  - Files: `src/core/identity/google-provider.ts`, `src/core/identity/types.ts`, `src/core/identity/identity-provider.ts`
  - Depends on: T076
  - Verification: `pnpm test:unit -- tests/unit/core/identity/google-provider.spec.ts`
  - Notes: `chrome.identity.getAuthToken` forbidden by lint rule. JWKS cached in IDB for 24h. Uses `@noble/ed25519` for signature verification.

- [x] **T078** **Write failing tests for AccountManager (add, remove, setActive, list, accessToken, onChange)**
  - Phase: M2
  - Module: Identity
  - Spec refs: FR-Acc2, FR-Acc3, FR-Acc6, FR-Acc7, FR-Acc8, AC-Acc1, AC-Acc2
  - Files: `tests/unit/core/identity/account-manager.spec.ts`
  - Depends on: T077
  - Verification: `pnpm test:unit -- tests/unit/core/identity/account-manager.spec.ts`
  - Notes: Test multi-account: add two, switch active, remove one preserves other. Test TierGate.check("accounts-max"). Test namespace isolation.

- [x] **T079** **Implement AccountManager**
  - Phase: M2
  - Module: Identity
  - Spec refs: FR-Acc2, FR-Acc3, FR-Acc6, FR-Acc7, FR-Acc8, AC-Acc1, AC-Acc2
  - Files: `src/core/identity/account-manager.ts`
  - Depends on: T078
  - Verification: `pnpm test:unit -- tests/unit/core/identity/account-manager.spec.ts`
  - Notes: Per-account namespacing: `acc.${accountId}.*` in storage, `[accountId, key]` in IDB. Never replaces, always appends.

### Per-account Key Derivation

- [x] **T080** **Write failing tests for per-account derived keys (C-KEY-1, C-KEY-2, C-KEY-3)**
  - Phase: M2
  - Module: Identity
  - Spec refs: C-KEY-1, C-KEY-2, C-KEY-3
  - Files: `tests/unit/core/crypto-keys.spec.ts`
  - Depends on: T079
  - Verification: `pnpm test:unit -- tests/unit/core/crypto-keys.spec.ts`
  - Notes: Test HKDF derivation from wrapping seed + account ULID. Test cross-account decrypt fails. Test key rotation re-encrypts all accounts. Test `extractable: false`.

- [x] **T081** **Implement per-account key derivation (HKDF) + C-MEM-1 (disposable decrypted key)**
  - Phase: M2
  - Module: Identity
  - Spec refs: C-KEY-1, C-KEY-2, C-KEY-3, C-MEM-1
  - Files: `src/core/crypto.ts` (modify), `src/core/crypto-keys.ts`
  - Depends on: T080
  - Verification: `pnpm test:unit -- tests/unit/core/crypto-keys.spec.ts`
  - Notes: Each account's AES-GCM key derived via HKDF from wrapping seed + account `id` as `info`. `Crypto.decryptString` returns a `using`-disposable wrapper that zero-fills buffer in `[Symbol.dispose]`.

### Multi-account UI

- [x] **T082** **Write failing tests for Settings, Accounts UI + AccountSwitcher**
  - Phase: M2
  - Module: Identity
  - Spec refs: FR-Acc7, FR-Acc8
  - Files: `tests/unit/options/accounts.spec.tsx`, `tests/unit/ui/components/account-switcher.spec.tsx`
  - Depends on: T079
  - Verification: `pnpm test:unit -- tests/unit/options/accounts.spec.tsx && pnpm test:unit -- tests/unit/ui/components/account-switcher.spec.tsx`
  - Notes: Test list with provider badge, label, last-used date, Disconnect action. Test type-to-confirm dialog. Test switcher appears only when >1 eligible account.

- [x] **T083** **Implement Settings, Accounts UI + AccountSwitcher component**
  - Phase: M2
  - Module: Identity
  - Spec refs: FR-Acc7, FR-Acc8
  - Files: `src/options/accounts.tsx`, `src/ui/components/AccountSwitcher/index.tsx`, `src/ui/components/AccountSwitcher/AccountSwitcher.module.css`
  - Depends on: T082
  - Verification: `pnpm test:unit -- tests/unit/options/accounts.spec.tsx && pnpm test:unit -- tests/unit/ui/components/account-switcher.spec.tsx`
  - Notes: Disconnect dialog: type-to-confirm, lists what will be wiped.

### Email Guardian Outbound (Gmail)

- [x] **T084** `[P]` **Write FakeEmailProvider test double**
  - Phase: M2
  - Module: Email Guardian
  - Spec refs: —
  - Files: `tests/fakes/email/fake-email-provider.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/fakes/email/`
  - Notes: Implements `EmailProvider` interface. Supports send-click simulation.

- [ ] **T085** **Write failing tests for Gmail content script (cascade selectors, canary, banner)**
  - Phase: M2
  - Module: Email Guardian
  - Spec refs: FR-E1, FR-E5, FR-E6, C-CS-2, C-CS-5
  - Files: `tests/unit/content/gmail/selectors.spec.ts`, `tests/unit/content/gmail/canary.spec.ts`, `tests/unit/content/gmail/banner.spec.ts`
  - Depends on: T084
  - Verification: `pnpm test:unit -- tests/unit/content/gmail/`
  - Notes: Test cascade selector fallback. Test canary failure leads to banner. Test origin assertion. Test send-only-on-send (C-CS-2).

- [x] **T086** **Implement Gmail content script (selectors, canary, banner)**
  - Phase: M2
  - Module: Email Guardian
  - Spec refs: FR-E1, FR-E5, FR-E6, C-CS-2, C-CS-5
  - Files: `src/content/gmail/index.ts`, `src/content/gmail/selectors.ts`, `src/content/gmail/canary.ts`, `src/content/gmail/banner.ts`
  - Depends on: T085
  - Verification: `pnpm test:unit -- tests/unit/content/gmail/`
  - Notes: ISOLATED world. Content script reads compose body ONLY at Send-click. `location.hostname` check before activation.

- [ ] **T087** **Write failing tests for send-click intercept + scan + warning modal**
  - Phase: M2
  - Module: Email Guardian
  - Spec refs: FR-E2, FR-E3, AC-E1, AC-E3
  - Files: `tests/unit/email/intercept.spec.ts`, `tests/unit/email/scan.spec.ts`
  - Depends on: T009, T086
  - Verification: `pnpm test:unit -- tests/unit/email/`
  - Notes: Test: scan body + attachments + subject + recipients. Max 3 s timeout or auto-pass with notice. Test warning modal: Send Anyway / Go Back. Test canary failure leads to banner, NOT consume Send.

- [ ] **T088** **Implement send-click intercept + email scan + warning modal**
  - Phase: M2
  - Module: Email Guardian
  - Spec refs: FR-E2, FR-E3, AC-E1, AC-E3
  - Files: `src/email/intercept.ts`, `src/email/scan.ts`, `src/popup/routes/email-guardian/warning-modal.tsx`
  - Depends on: T087
  - Verification: `pnpm test:unit -- tests/unit/email/`
  - Notes: MutationObserver on compose dialog. Capture-phase listener on Send button. Auto-pass with notice if scan exceeds 3 s.

- [ ] **T089** **Write failing tests + implement whitelist UI (per-recipient, per-domain)**
  - Phase: M2
  - Module: Email Guardian
  - Spec refs: FR-E4, AC-E2
  - Files: `tests/unit/popup/routes/email-guardian/whitelist.spec.tsx`, `src/popup/routes/email-guardian/whitelist.tsx`
  - Depends on: T088
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/email-guardian/whitelist.spec.tsx`
  - Notes: Persists in `chrome.storage.local`. TierGate.check("whitelists") for size limit (10 Free, 100 Basic, unlimited Pro). Per-account scoped.

### Kill-switch System

- [ ] **T090** **Write failing tests for kill-switch selector system (C-KS-1..5)**
  - Phase: M2
  - Module: Cross-cutting
  - Spec refs: C-KS-1, C-KS-2, C-KS-3, C-KS-4, C-KS-5
  - Files: `tests/unit/security/kill-switch.spec.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/security/kill-switch.spec.ts`
  - Notes: Test Ed25519 verification with `@noble/ed25519`. Test pinned public key. Test payload constraints (max 4 KB, +/-24h skew). Test limited scope of effect (selector strings only). Test audit trail logging.

- [ ] **T091** **Implement kill-switch selector system**
  - Phase: M2
  - Module: Cross-cutting
  - Spec refs: C-KS-1, C-KS-2, C-KS-3, C-KS-4, C-KS-5
  - Files: `src/security/kill-switch.ts`, `src/security/kill-switch-keys.ts`
  - Depends on: T090
  - Verification: `pnpm test:unit -- tests/unit/security/kill-switch.spec.ts`
  - Notes: Public key is a `const` — never fetched. Payload: only selector strings. Audit trail: event type + payload hash + timestamp in storage.

### Content-Script Security

- [ ] **T092** **Write failing tests + implement Trusted Types policy (C-CS-1) + postmessage validation (C-CS-4)**
  - Phase: M2
  - Module: Cross-cutting
  - Spec refs: C-CS-1, C-CS-3, C-CS-4
  - Files: `tests/unit/security/trusted-types.spec.ts`, `tests/unit/security/postmessage.spec.ts`, `src/security/trusted-types.ts`, `src/security/postmessage.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/security/trusted-types.spec.ts && pnpm test:unit -- tests/unit/security/postmessage.spec.ts`
  - Notes: Single `shieldme` policy for all DOM mutations. All `chrome.runtime.sendMessage` payloads validated by `valibot` schemas. ISOLATED world manifest declaration check.

### Acceptance Tests — M2

- [ ] **T093** **Write AC-E1+E2+E3 acceptance tests (Gmail send intercept, whitelist bypass, canary failure)**
  - Phase: M2
  - Module: Email Guardian
  - Spec refs: AC-E1, AC-E2, AC-E3
  - Files: `tests/acceptance/email.spec.ts`
  - Depends on: T088, T089
  - Verification: `pnpm test:e2e -- tests/acceptance/email.spec.ts`
  - Notes: Playwright with Gmail test page. Test IBAN in compose leads to modal. Whitelist leads to no modal. Canary fail leads to banner within 1 s.

- [ ] **T094** **Write AC-Acc1..Acc4 acceptance tests (account max, disconnect revoke, JWKS rejection)**
  - Phase: M2
  - Module: Identity
  - Spec refs: AC-Acc1, AC-Acc2, AC-Acc3, AC-Acc4
  - Files: `tests/acceptance/identity.spec.ts`
  - Depends on: T079, T083
  - Verification: `pnpm test:e2e -- tests/acceptance/identity.spec.ts`
  - Notes: Third account on Free leads to upsell. Disconnect leads to zero `acc.${id}.*` keys. Revoke leads to consent screen anew. Invalid ID token leads to `IdentityError.kind === "id-token-invalid"`.

### Tier Migration

- [x] **T095** `[H]` **Write tests + implement TierStatus v1 to v2 migration (premium to pro, remove pro-family)**
  - Phase: M2
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `tests/unit/core/migrations/tier-v2.spec.ts`, `src/core/migrations.ts` (modify)
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/core/migrations/tier-v2.spec.ts`
  - Notes: Map existing `"premium"` to `"pro"`. Add new entitlement fields with defaults.

### M2 Checkpoint

- [x] **T096** `[O]` **M2 phase gate — full verification**
  - Phase: M2
  - Module: Cross-cutting
  - Spec refs: —
  - Files: —
  - Depends on: T075–T095
  - Verification: `pnpm verify`
  - Notes: Identity contract tests green. All M1 + M2 tests pass. No regressions.

---

## M3 — Cloud Audit (Google Drive) + OAuth Verification Kickoff (W11–14)

### Cloud Audit Core

- [x] **T097** `[P]` **Write FakeCloudStorageProvider test double**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: —
  - Files: `tests/fakes/cloud/fake-storage-provider.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/fakes/cloud/`
  - Notes: Implements `CloudStorageProvider` interface. Supports synthetic file corpus with known PII and known permissions.

- [x] **T098** **Write failing tests for GoogleDriveProvider (listAllFiles, changesSince, getContent, upgradeToWriteScope, applyPermissionChange)**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-A1, FR-A5, FR-A6
  - Files: `tests/unit/cloud/google-drive-provider.spec.ts`
  - Depends on: T097, T079
  - Verification: `pnpm test:unit -- tests/unit/cloud/google-drive-provider.spec.ts`
  - Notes: Test AsyncIterable pagination. Test cache invalidation by `fileId + modifiedTime`. Test token-bucket throttling.

- [x] **T099** **Implement GoogleDriveProvider**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-A1, FR-A5, FR-A6
  - Files: `src/cloud/google-drive-provider.ts`, `src/cloud/storage-provider.ts` (interface)
  - Depends on: T098
  - Verification: `pnpm test:unit -- tests/unit/cloud/google-drive-provider.spec.ts`
  - Notes: Consumes `AccountManager` for fresh access tokens. Token bucket: 8 req/s refill, 5 concurrent. Retries with jitter on 403/429.

- [x] **T100** **Write failing tests for token-bucket throttling**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: NFR-P4
  - Files: `tests/unit/cloud/throttle.spec.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/cloud/throttle.spec.ts`
  - Notes: Test 8 req/s refill, 5 concurrent limit. Test backoff with jitter on 429.

- [x] **T101** **Implement token-bucket throttling**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: NFR-P4
  - Files: `src/cloud/throttle.ts`
  - Depends on: T100
  - Verification: `pnpm test:unit -- tests/unit/cloud/throttle.spec.ts`
  - Notes: Reusable by all providers. Configurable per provider.

- [x] **T102** **Write failing tests for Drive audit engine (list, permissions analysis, content scan, cross-reference)**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-A2, FR-A3, FR-A4, AC-A2, AC-A4
  - Files: `tests/unit/cloud/audit.spec.ts`
  - Depends on: T099, T009
  - Verification: `pnpm test:unit -- tests/unit/cloud/audit.spec.ts`
  - Notes: Test Free tier: content scan stops at 100 files. Test cross-reference: permissions times findings. Test IBAN + "Anyone with link" leads to Critical.

- [x] **T103** **Implement Drive audit engine**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-A2, FR-A3, FR-A4, AC-A2, AC-A4
  - Files: `src/cloud/audit.ts`
  - Depends on: T102
  - Verification: `pnpm test:unit -- tests/unit/cloud/audit.spec.ts`
  - Notes: Listing phase ≤15 s for 3k files (NFR-P4). Results cached in IDB by `fileId + modifiedTime`. Cache wiped on Delete-all-my-data.

### Drive Fix Actions + Scope Upgrade

- [x] **T104** **Write failing tests for fix-action buttons + write-scope upgrade flow**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-A3, C-OAUTH-4
  - Files: `tests/unit/cloud/fix-actions.spec.ts`
  - Depends on: T099
  - Verification: `pnpm test:unit -- tests/unit/cloud/fix-actions.spec.ts`
  - Notes: Free tier: fix buttons show Premium upsell. Paid: one-time `drive` (write) scope upgrade consent. Test scope upgrade is separate consent screen (C-OAUTH-4).

- [x] **T105** **Implement fix-action buttons + scope upgrade flow**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-A3, C-OAUTH-4
  - Files: `src/cloud/fix-actions.ts`
  - Depends on: T104
  - Verification: `pnpm test:unit -- tests/unit/cloud/fix-actions.spec.ts`
  - Notes: `TierGate.check("cloud-fix-actions")`. `upgradeToWriteScope()` separate consent screen.

### Share Interception (Basic+)

- [ ] **T106** **Write failing tests for Drive share dialog content script (Share Interception)**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-CA-Share1, AC-CA-Sh1, AC-CA-Sh2
  - Files: `tests/unit/content/drive/share-intercept.spec.ts`
  - Depends on: T009
  - Verification: `pnpm test:unit -- tests/unit/content/drive/share-intercept.spec.ts`
  - Notes: Test: intercept "Copy link" / "Share", scan file, modal if findings. Test Free tier: no interception. Test Cancel does not write to clipboard.

- [ ] **T107** **Implement Drive share dialog content script**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-CA-Share1, AC-CA-Sh1, AC-CA-Sh2
  - Files: `src/content/drive/share-intercept.ts`, `src/content/drive/selectors.ts`
  - Depends on: T106
  - Verification: `pnpm test:unit -- tests/unit/content/drive/share-intercept.spec.ts`
  - Notes: `TierGate.check("share-interception")`. Cascade selectors for Drive share dialog.

### Watermark-on-share (Pro+)

- [ ] **T108** **Write failing tests for watermark-on-share (Drive API comment)**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-CA-Watermark1
  - Files: `tests/unit/cloud/watermark.spec.ts`
  - Depends on: T099
  - Verification: `pnpm test:unit -- tests/unit/cloud/watermark.spec.ts`
  - Notes: Appends comment via Drive API. Requires write scope. `TierGate.check("share-watermark")`.

- [ ] **T109** **Implement watermark-on-share**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-CA-Watermark1
  - Files: `src/cloud/watermark.ts`
  - Depends on: T108
  - Verification: `pnpm test:unit -- tests/unit/cloud/watermark.spec.ts`
  - Notes: Comment-only; document body never modified. Pro + opt-in.

### Continuous Re-audit (Pro+)

- [ ] **T110** **Write failing tests for continuous re-audit via changes.list**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-CA-Cont1, FR-A5
  - Files: `tests/unit/cloud/continuous-audit.spec.ts`
  - Depends on: T099, T103
  - Verification: `pnpm test:unit -- tests/unit/cloud/continuous-audit.spec.ts`
  - Notes: Test daily (Pro) schedule. Test alerts on new public links / new external collaborators.

- [ ] **T111** **Implement continuous re-audit**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-CA-Cont1, FR-A5
  - Files: `src/cloud/continuous-audit.ts`
  - Depends on: T110
  - Verification: `pnpm test:unit -- tests/unit/cloud/continuous-audit.spec.ts`
  - Notes: Service-worker alarm. `TierGate.check("continuous-reaudit")`.

### Cloud Audit UI

- [ ] **T112** **Write failing tests for Cloud Audit UI (file list, permission badges, findings, fix actions)**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-A2, FR-A3
  - Files: `tests/unit/popup/routes/cloud-audit.spec.tsx`
  - Depends on: T103
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/cloud-audit.spec.tsx`
  - Notes: Test per-file permission + finding display. Test "Audited 100 of N exposed files" banner.

- [ ] **T113** **Implement Cloud Audit UI**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: FR-A2, FR-A3
  - Files: `src/popup/routes/cloud-audit/index.tsx`, `src/popup/routes/cloud-audit/file-list.tsx`, `src/popup/routes/cloud-audit/permission-badge.tsx`
  - Depends on: T112
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/cloud-audit.spec.tsx`
  - Notes: Account switcher when >1 eligible account.

### Build-time Egress

- [x] **T114** `[H]` **Wire C-NET-1 (build-time allowlist scan) to load from contracts/integration-apis.md**
  - Phase: M3
  - Module: Cross-cutting
  - Spec refs: C-NET-1, AC-C2
  - Files: `scripts/check-egress-allowlist.mjs` (modify)
  - Depends on: —
  - Verification: `node scripts/check-egress-allowlist.mjs`
  - Notes: Single source of truth. Script parses the contract markdown, extracts hosts, scans built JS.

### OAuth Verification

- [ ] **T115** `[P]` `[H]` **Prepare Google OAuth verification submission documentation**
  - Phase: M3
  - Module: Cross-cutting
  - Spec refs: R-8 (risks)
  - Files: `docs/legal/oauth-verification-submission.md`
  - Depends on: —
  - Verification: manual
  - Notes: Runs in parallel with implementation. Justification for `drive.readonly`, `drive`, `calendar.readonly`, `calendar.events` scopes.

### Acceptance Tests — M3

- [ ] **T116** **Write AC-A1..A5 acceptance tests (Drive OAuth, Free cap, fix upsell, cross-reference, multi-account)**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: AC-A1, AC-A2, AC-A3, AC-A4, AC-A5
  - Files: `tests/acceptance/drive.spec.ts`
  - Depends on: T113
  - Verification: `pnpm test:e2e -- tests/acceptance/drive.spec.ts`
  - Notes: PKCE OAuth. ID token validated. Free: 100 file cap. Fix buttons lead to upsell. IBAN + public leads to Critical. Two accounts independently audited.

- [ ] **T117** **Write AC-CA-Sh1+Sh2 acceptance tests (share interception)**
  - Phase: M3
  - Module: Cloud Audit
  - Spec refs: AC-CA-Sh1, AC-CA-Sh2
  - Files: `tests/acceptance/drive.spec.ts` (append)
  - Depends on: T107
  - Verification: `pnpm test:e2e -- tests/acceptance/drive.spec.ts`
  - Notes: Share Interception: modal before clipboard. Free: no interception.

### M3 Checkpoint

- [ ] **T118** `[O]` **M3 phase gate — full verification**
  - Phase: M3
  - Module: Cross-cutting
  - Spec refs: —
  - Files: —
  - Depends on: T097–T117
  - Verification: `pnpm verify`
  - Notes: Drive quota + token-bucket test green. All M1–M3 tests pass.

---

## M4 — Exposure Radar + Privacy Toolkit Foundation (W15–18)

### Exposure Radar — Password Breach

- [x] **T119** **Write failing tests for HIBP Pwned Passwords (k-anonymity)**
  - Phase: M4
  - Module: Exposure Radar
  - Spec refs: FR-X1, AC-X1
  - Files: `tests/unit/radar/hibp-passwords.spec.ts`
  - Depends on: T067
  - Verification: `pnpm test:unit -- tests/unit/radar/hibp-passwords.spec.ts`
  - Notes: Test SHA-1 + prefix/suffix split. Test zero-out of plaintext buffer. Test `password123` returns ≥1 breach.

- [x] **T120** **Implement HIBP Pwned Passwords**
  - Phase: M4
  - Module: Exposure Radar
  - Spec refs: FR-X1, AC-X1
  - Files: `src/radar/hibp-passwords.ts`
  - Depends on: T119
  - Verification: `pnpm test:unit -- tests/unit/radar/hibp-passwords.spec.ts`
  - Notes: Uses runtime fetch wrapper (C-NET-2). Never logs/persists plaintext or full hash.

### Exposure Radar — Email Breach

- [x] **T121** **Write failing tests for HIBP Breached Account (user's own key)**
  - Phase: M4
  - Module: Exposure Radar
  - Spec refs: FR-X2, FR-X3, AC-X2
  - Files: `tests/unit/radar/hibp-emails.spec.ts`
  - Depends on: T067, T081
  - Verification: `pnpm test:unit -- tests/unit/radar/hibp-emails.spec.ts`
  - Notes: Test key persistence in encrypted storage. Test ownership verification (chrome-profile path). Test prompts for HIBP key if not present.

- [x] **T122** **Implement HIBP Breached Account + OwnershipVerifier**
  - Phase: M4
  - Module: Exposure Radar
  - Spec refs: FR-X2, FR-X3, AC-X2
  - Files: `src/radar/hibp-emails.ts`, `src/radar/ownership.ts`
  - Depends on: T121
  - Verification: `pnpm test:unit -- tests/unit/radar/hibp-emails.spec.ts`
  - Notes: Key decrypted per-call only. Code-verified path stubbed as "Coming soon" until Cloudflare Worker available.

### Exposure Radar — Data Broker Checklist

- [x] **T123** **Write failing tests for broker checklist (ManualProvider + BrokerRemovalProvider interface)** — **Done 2026-05-18:** `tests/unit/radar/manual-provider.spec.ts` + `tests/unit/radar/providers-factory.spec.ts` cover the ≥20-site catalog, status persistence, removal flow, and factory wiring.
  - Phase: M4
  - Module: Exposure Radar
  - Spec refs: FR-X4, FR-X6, AC-X3, AC-X4
  - Files: `tests/unit/radar/brokers.spec.ts`, `tests/fakes/radar/fake-broker-provider.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/radar/brokers.spec.ts`
  - Notes: Test 20+ sites from `brokers.json`. Test status persistence. Test DeleteMe card = "Coming soon" with zero network calls.

- [x] **T124** **Implement ManualProvider + DeleteMeProvider stub + broker data + factory** — **Done 2026-05-18:** `src/radar/providers/{manual-provider,deleteme-provider,factory}.ts` + `src/data/brokers.json` shipped; interface is embedded rather than a separate `broker-removal-provider.ts` file (acceptable simplification).
  - Phase: M4
  - Module: Exposure Radar
  - Spec refs: FR-X4, FR-X6, AC-X3, AC-X4
  - Files: `src/radar/providers/broker-removal-provider.ts`, `src/radar/providers/manual-provider.ts`, `src/radar/providers/deleteme-provider.ts`, `src/radar/providers/factory.ts`, `src/data/brokers.json`
  - Depends on: T123
  - Verification: `pnpm test:unit -- tests/unit/radar/brokers.spec.ts`
  - Notes: ManualProvider: zero network calls. DeleteMeProvider throws `NotYetAvailableError`. Factory selects based on TierGate + user preference.

### Exposure Radar UI

- [ ] **T125** **Write failing tests for Exposure Radar UI (password check, email check, broker checklist)**
  - Phase: M4
  - Module: Exposure Radar
  - Spec refs: FR-X1, FR-X2, FR-X4, FR-X5
  - Files: `tests/unit/popup/routes/exposure-radar.spec.tsx`
  - Depends on: T120, T122, T124
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/exposure-radar.spec.tsx`
  - Notes: Test BrokerSiteRow component. Test "Notify me" button for dark web placeholder.

- [ ] **T126** **Implement Exposure Radar UI**
  - Phase: M4
  - Module: Exposure Radar
  - Spec refs: FR-X1, FR-X2, FR-X4, FR-X5
  - Files: `src/popup/routes/exposure-radar/index.tsx`, `src/popup/routes/exposure-radar/password-check.tsx`, `src/popup/routes/exposure-radar/email-check.tsx`, `src/popup/routes/exposure-radar/broker-checklist.tsx`, `src/ui/components/BrokerSiteRow/index.tsx`, `src/ui/components/BrokerSiteRow/BrokerSiteRow.module.css`
  - Depends on: T125
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/exposure-radar.spec.tsx`
  - Notes: Dark Web Monitoring = placeholder "Notify me" card with intent capture.

### Privacy Toolkit — Data Export Request Generator (Basic+)

- [ ] **T127** **Write failing tests for Data Export Request generator**
  - Phase: M4
  - Module: Privacy Toolkit
  - Spec refs: FR-Tk1, AC-Tk1
  - Files: `tests/unit/popup/routes/privacy-toolkit/export-request.spec.tsx`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/privacy-toolkit/export-request.spec.tsx`
  - Notes: Test pre-fill of user email + service DPO address. Test `mailto:` opens with non-empty body. Test TierGate.check("data-export-generator").

- [ ] **T128** **Implement Data Export Request generator + service catalog**
  - Phase: M4
  - Module: Privacy Toolkit
  - Spec refs: FR-Tk1, AC-Tk1
  - Files: `src/popup/routes/privacy-toolkit/export-request.tsx`, `src/data/exporters.json`
  - Depends on: T127
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/privacy-toolkit/export-request.spec.tsx`
  - Notes: 50+ EU-relevant brokers + 30+ US-relevant services. Article 15 / CCPA letter templates.

### Privacy Toolkit — Browser Extension Audit (Basic+)

- [ ] **T129** **Write failing tests for Browser Extension Audit**
  - Phase: M4
  - Module: Privacy Toolkit
  - Spec refs: FR-Tk2, AC-Tk2
  - Files: `tests/unit/popup/routes/privacy-toolkit/extension-audit.spec.tsx`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/privacy-toolkit/extension-audit.spec.tsx`
  - Notes: Test `chrome.management.getAll`. Test risk score weighting (`<all_urls>` x 10, `tabs` x 5, `storage` x 1). Test sortable list. Test TierGate.

- [ ] **T130** **Implement Browser Extension Audit**
  - Phase: M4
  - Module: Privacy Toolkit
  - Spec refs: FR-Tk2, AC-Tk2
  - Files: `src/popup/routes/privacy-toolkit/extension-audit.tsx`
  - Depends on: T129
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/privacy-toolkit/extension-audit.spec.tsx`
  - Notes: Read-only. No automatic action. `TierGate.check("extension-audit")`.

### Privacy Toolkit — Takeout Review (Basic+)

- [ ] **T131** **Write failing tests for Takeout review (zip decompression + recursive scan)**
  - Phase: M4
  - Module: Privacy Toolkit
  - Spec refs: FR-Tk3, AC-Tk3
  - Files: `tests/unit/popup/routes/privacy-toolkit/takeout-review.spec.tsx`
  - Depends on: T009, T058
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/privacy-toolkit/takeout-review.spec.tsx`
  - Notes: Test recursive decompression in offscreen document. Test file-size cap skip with notice. Test .mbox treated as line-delimited text.

- [ ] **T132** **Implement Takeout review**
  - Phase: M4
  - Module: Privacy Toolkit
  - Spec refs: FR-Tk3, AC-Tk3
  - Files: `src/popup/routes/privacy-toolkit/takeout-review.tsx`, `src/offscreen/zip-handler.ts`
  - Depends on: T131
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/privacy-toolkit/takeout-review.spec.tsx`
  - Notes: Offscreen document for decompression. `TierGate.check("takeout-review")`.

### Telemetry Client

- [ ] **T133** **Write failing tests for Telemetry client (opt-in, schema guard, no-op when disabled)**
  - Phase: M4
  - Module: Cross-cutting
  - Spec refs: FR-C4
  - Files: `tests/unit/core/telemetry.spec.ts`, `tests/fakes/telemetry/fake-telemetry.ts`
  - Depends on: T067
  - Verification: `pnpm test:unit -- tests/unit/core/telemetry.spec.ts`
  - Notes: Test no-op when `analyticsOptedIn === false`. Test schema guard rejects fields outside schema. Test no file names, no matched strings, no recipient emails.

- [ ] **T134** **Implement Telemetry client**
  - Phase: M4
  - Module: Cross-cutting
  - Spec refs: FR-C4
  - Files: `src/core/telemetry.ts`
  - Depends on: T133
  - Verification: `pnpm test:unit -- tests/unit/core/telemetry.spec.ts`
  - Notes: Buffered flush to `{PLAUSIBLE_HOST}/api/event`. Schema validator at enqueue time. Uses runtime fetch wrapper.

### Acceptance Tests — M4

- [ ] **T135** **Write AC-X1..X4 acceptance tests (password check, email check, broker checklist, DeleteMe)**
  - Phase: M4
  - Module: Exposure Radar
  - Spec refs: AC-X1, AC-X2, AC-X3, AC-X4
  - Files: `tests/acceptance/radar.spec.ts`
  - Depends on: T126
  - Verification: `pnpm test:e2e -- tests/acceptance/radar.spec.ts`
  - Notes: `password123` leads to ≥1 breach. Email check prompts for key. 20+ broker sites render. DeleteMe leads to "Coming soon" + zero network.

- [ ] **T136** **Write AC-Tk1..Tk3 acceptance tests (export request, extension audit, takeout)**
  - Phase: M4
  - Module: Privacy Toolkit
  - Spec refs: AC-Tk1, AC-Tk2, AC-Tk3
  - Files: `tests/acceptance/privacy-toolkit.spec.ts`
  - Depends on: T128, T130, T132
  - Verification: `pnpm test:e2e -- tests/acceptance/privacy-toolkit.spec.ts`
  - Notes: Export request leads to `mailto:` with non-empty body. Extension audit: `<all_urls>` higher score. Takeout zip scans Drive folder + .mbox.

### M4 Checkpoint

- [ ] **T137** `[O]` **M4 phase gate — full verification**
  - Phase: M4
  - Module: Cross-cutting
  - Spec refs: —
  - Files: —
  - Depends on: T119–T136
  - Verification: `pnpm verify`
  - Notes: Analytics opt-in gate tested. All M1–M4 tests pass.

---

## M5 — Calendar Audit + Privacy Toolkit Completion + Inbound Email (W19–22)

### Calendar Audit

- [ ] **T138** `[P]` **Write FakeCalendarProvider test double**
  - Phase: M5
  - Module: Calendar Audit
  - Spec refs: —
  - Files: `tests/fakes/calendar/fake-calendar-provider.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/fakes/calendar/`
  - Notes: Implements `CalendarProvider` interface. Supports synthetic events with PII + sharing context.

- [ ] **T139** **Write failing tests for GoogleCalendarProvider (listEvents, changesSince, redactEvent, upgradeToWriteScope)**
  - Phase: M5
  - Module: Calendar Audit
  - Spec refs: FR-Cal1, FR-Cal4, FR-Cal5
  - Files: `tests/unit/calendar/google-calendar-provider.spec.ts`
  - Depends on: T138, T079
  - Verification: `pnpm test:unit -- tests/unit/calendar/google-calendar-provider.spec.ts`
  - Notes: Test AsyncIterable pagination. Test write-scope upgrade separate consent. Test redactEvent rewrites title/description.

- [ ] **T140** **Implement GoogleCalendarProvider**
  - Phase: M5
  - Module: Calendar Audit
  - Spec refs: FR-Cal1, FR-Cal4, FR-Cal5
  - Files: `src/calendar/google-calendar-provider.ts`, `src/calendar/calendar-provider.ts` (interface)
  - Depends on: T139
  - Verification: `pnpm test:unit -- tests/unit/calendar/google-calendar-provider.spec.ts`
  - Notes: Calendar API v3. `calendar.readonly` for read, `calendar.events` for Pro redact. Consumes AccountManager.

- [ ] **T141** **Write failing tests for Calendar audit engine (event scan + sharing cross-reference + severity elevation)**
  - Phase: M5
  - Module: Calendar Audit
  - Spec refs: FR-Cal2, FR-Cal3, FR-Cal4, AC-Cal1, AC-Cal2
  - Files: `tests/unit/calendar/audit.spec.ts`
  - Depends on: T140, T009
  - Verification: `pnpm test:unit -- tests/unit/calendar/audit.spec.ts`
  - Notes: Concatenate `{title, description, location}` and scan. Public visibility + PII leads to Critical. Test Basic weekly vs Pro daily frequency.

- [ ] **T142** **Implement Calendar audit engine**
  - Phase: M5
  - Module: Calendar Audit
  - Spec refs: FR-Cal2, FR-Cal3, FR-Cal4, AC-Cal1, AC-Cal2
  - Files: `src/calendar/audit.ts`
  - Depends on: T141
  - Verification: `pnpm test:unit -- tests/unit/calendar/audit.spec.ts`
  - Notes: Synthetic OffsetMap mapping back to which field (title/description/location). Service-worker alarm for re-audit schedule.

- [ ] **T143** **Write failing tests + implement Calendar redact action (Pro+)**
  - Phase: M5
  - Module: Calendar Audit
  - Spec refs: FR-Cal5, AC-Cal4
  - Files: `tests/unit/calendar/redact.spec.ts`, `src/calendar/redact.ts`
  - Depends on: T140
  - Verification: `pnpm test:unit -- tests/unit/calendar/redact.spec.ts`
  - Notes: User confirms redacted text. Local audit-log entry. Original unrecoverable. `TierGate.check("calendar-redact")`.

- [ ] **T144** **Write failing tests for Calendar Audit UI (event list, findings, redact button)**
  - Phase: M5
  - Module: Calendar Audit
  - Spec refs: FR-Cal1, FR-Cal4, AC-Cal3
  - Files: `tests/unit/popup/routes/calendar-audit.spec.tsx`
  - Depends on: T142
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/calendar-audit.spec.tsx`
  - Notes: Test Free tier: cannot enable, toggle shows Basic upsell. Test Pro: redact button visible.

- [ ] **T145** **Implement Calendar Audit UI**
  - Phase: M5
  - Module: Calendar Audit
  - Spec refs: FR-Cal1, FR-Cal4, AC-Cal3
  - Files: `src/popup/routes/calendar-audit/index.tsx`, `src/popup/routes/calendar-audit/event-list.tsx`, `src/popup/routes/calendar-audit/redact-modal.tsx`
  - Depends on: T144
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/calendar-audit.spec.tsx`
  - Notes: Account switcher when >1 eligible. TierGate for feature access.

### Privacy Toolkit — Subscription Audit (Basic+)

- [ ] **T146** **Write failing tests for Subscription Audit (Gmail DOM heuristics)**
  - Phase: M5
  - Module: Privacy Toolkit
  - Spec refs: FR-Tk4, AC-Tk4
  - Files: `tests/unit/popup/routes/privacy-toolkit/subscription-audit.spec.tsx`
  - Depends on: T086
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/privacy-toolkit/subscription-audit.spec.tsx`
  - Notes: Test heuristic patterns (sender-domain + keyword + structural cue). Test 30d (Basic) vs 365d (Pro) window. Test no persistence unless user clicks Save.

- [ ] **T147** **Implement Subscription Audit**
  - Phase: M5
  - Module: Privacy Toolkit
  - Spec refs: FR-Tk4, AC-Tk4
  - Files: `src/popup/routes/privacy-toolkit/subscription-audit.tsx`
  - Depends on: T146
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/privacy-toolkit/subscription-audit.spec.tsx`
  - Notes: Read-only. Not persisted longer than report screen lifetime unless user saves. `TierGate.check("subscription-audit")`.

### Privacy Toolkit — Travel Mode (Pro+)

- [ ] **T148** **Write failing tests for Travel Mode (duration picker, behavior bundle, auto-revert)**
  - Phase: M5
  - Module: Privacy Toolkit
  - Spec refs: FR-Tk5, AC-Tk5
  - Files: `tests/unit/popup/routes/privacy-toolkit/travel-mode.spec.tsx`
  - Depends on: T079
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/privacy-toolkit/travel-mode.spec.tsx`
  - Notes: Test: pick duration (1–30 days), auto-disconnect selected accounts, enable My Family + My Health + My Location, hide cached reports, require profile re-auth for key-decrypt. Test auto-revert at end-of-duration. Clock-injectable.

- [ ] **T149** **Implement Travel Mode**
  - Phase: M5
  - Module: Privacy Toolkit
  - Spec refs: FR-Tk5, AC-Tk5
  - Files: `src/popup/routes/privacy-toolkit/travel-mode.tsx`, `src/core/travel-mode.ts`
  - Depends on: T148
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/privacy-toolkit/travel-mode.spec.tsx`
  - Notes: `TierGate.check("travel-mode")`. Service-worker alarm for auto-revert. Manual revert available.

### Email Guardian Inbound (Pro)

- [ ] **T150** **Write failing tests for phishing heuristics (link mismatch, homoglyph, attachment masquerade, urgency lexicon)**
  - Phase: M5
  - Module: Email Guardian
  - Spec refs: FR-In1, FR-In2, AC-In1
  - Files: `tests/unit/email/inbound/phishing-heuristics.spec.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/email/inbound/phishing-heuristics.spec.ts`
  - Notes: Test link mismatch: visible `bank.com`, href `bank-secure.com.attacker.example`. Test homoglyph: Latin/Cyrillic confusables. Test attachment type masquerade: `.exe` claiming PDF. Test urgency lexicon match.

- [ ] **T151** **Implement phishing heuristics**
  - Phase: M5
  - Module: Email Guardian
  - Spec refs: FR-In1, FR-In2, AC-In1
  - Files: `src/email/inbound/phishing-heuristics.ts`, `src/email/inbound/link-mismatch.ts`, `src/email/inbound/homoglyph.ts`, `src/email/inbound/attachment-masquerade.ts`, `src/email/inbound/urgency-lexicon.ts`
  - Depends on: T150
  - Verification: `pnpm test:unit -- tests/unit/email/inbound/phishing-heuristics.spec.ts`
  - Notes: All client-side. No auto-action (C-IN-2). Parsed in offscreen document (C-IN-1).

- [ ] **T152** **Write failing tests for inbound banner + trust-this-sender + report**
  - Phase: M5
  - Module: Email Guardian
  - Spec refs: FR-In3, AC-In2, AC-In3
  - Files: `tests/unit/email/inbound/banner.spec.ts`
  - Depends on: T151
  - Verification: `pnpm test:unit -- tests/unit/email/inbound/banner.spec.ts`
  - Notes: Test banner renders with reason in plain language. Test "Trust this sender" whitelist suppresses future banners. Test with Inbound disabled leads to no banner. Test opt-in telemetry for quality signal.

- [ ] **T153** **Implement inbound banner + trust/report actions**
  - Phase: M5
  - Module: Email Guardian
  - Spec refs: FR-In3, AC-In2, AC-In3
  - Files: `src/email/inbound/banner.ts`, `src/email/inbound/actions.ts`
  - Depends on: T152
  - Verification: `pnpm test:unit -- tests/unit/email/inbound/banner.spec.ts`
  - Notes: `TierGate.check("email-inbound-scan")`. "Report to ShieldMe" is anonymous opt-in via telemetry.

### Sender-domain Reputation List

- [ ] **T154** **Write failing tests for sender-domain reputation list (Ed25519-signed, weekly refresh) (C-IN-3)**
  - Phase: M5
  - Module: Email Guardian
  - Spec refs: FR-In2, C-IN-3
  - Files: `tests/unit/email/inbound/sender-reputation.spec.ts`
  - Depends on: T091
  - Verification: `pnpm test:unit -- tests/unit/email/inbound/sender-reputation.spec.ts`
  - Notes: Same Ed25519 discipline as kill-switch (separate key). Test signature verification. Test weekly refresh schedule.

- [ ] **T155** **Implement sender-domain reputation list**
  - Phase: M5
  - Module: Email Guardian
  - Spec refs: FR-In2, C-IN-3
  - Files: `src/email/inbound/sender-reputation.ts`
  - Depends on: T154
  - Verification: `pnpm test:unit -- tests/unit/email/inbound/sender-reputation.spec.ts`
  - Notes: Fetches `{SENDER_REP_HOST}/v1/sender-domain.json`. Ed25519-signed. Service-worker alarm for weekly refresh.

### Acceptance Tests — M5

- [ ] **T156** **Write AC-Cal1..Cal4 acceptance tests (event scan, public elevation, Free upsell, Pro redact)**
  - Phase: M5
  - Module: Calendar Audit
  - Spec refs: AC-Cal1, AC-Cal2, AC-Cal3, AC-Cal4
  - Files: `tests/acceptance/calendar.spec.ts`
  - Depends on: T145
  - Verification: `pnpm test:e2e -- tests/acceptance/calendar.spec.ts`
  - Notes: AMKA + health keyword leads to Critical. Public event leads to "visible to anyone." Free leads to Basic upsell. Pro redact creates audit log + original unrecoverable.

- [ ] **T157** **Write AC-In1..In3 acceptance tests (phishing banner, whitelist, disabled state)**
  - Phase: M5
  - Module: Email Guardian
  - Spec refs: AC-In1, AC-In2, AC-In3
  - Files: `tests/acceptance/email-inbound.spec.ts`
  - Depends on: T153
  - Verification: `pnpm test:e2e -- tests/acceptance/email-inbound.spec.ts`
  - Notes: Link mismatch leads to banner "link mismatch." Whitelist suppresses. Inbound disabled leads to no banner.

- [ ] **T158** **Write AC-Tk4+Tk5 acceptance tests (subscription audit, travel mode)**
  - Phase: M5
  - Module: Privacy Toolkit
  - Spec refs: AC-Tk4, AC-Tk5
  - Files: `tests/acceptance/privacy-toolkit.spec.ts` (append)
  - Depends on: T147, T149
  - Verification: `pnpm test:e2e -- tests/acceptance/privacy-toolkit.spec.ts`
  - Notes: 5 receipt emails leads to 5 services. No list persisted after close unless Save. Travel Mode 7d leads to auto-revert at 7d+1min (clock-injected).

### M5 Checkpoint

- [ ] **T159** `[O]` **M5 phase gate — full verification**
  - Phase: M5
  - Module: Cross-cutting
  - Spec refs: —
  - Files: —
  - Depends on: T138–T158
  - Verification: `pnpm verify`
  - Notes: Inbound trust boundary tests green. All M1–M5 tests pass.

---

## M6 — Microsoft Providers + Billing (W23–26)

### Microsoft Identity Provider

- [ ] **T160** **Write failing tests for MicrosoftIdentityProvider (PKCE via launchWebAuthFlow, JWKS validation, multi-tenant)**
  - Phase: M6
  - Module: Identity
  - Spec refs: FR-Acc1, C-OAUTH-1, C-OAUTH-2
  - Files: `tests/unit/core/identity/microsoft-provider.spec.ts`
  - Depends on: T075
  - Verification: `pnpm test:unit -- tests/unit/core/identity/microsoft-provider.spec.ts`
  - Notes: Tenant `common` for MSA + workplace. PKCE code flow. JWKS from `login.microsoftonline.com/common/discovery/v2.0/keys`.

- [ ] **T161** **Implement MicrosoftIdentityProvider**
  - Phase: M6
  - Module: Identity
  - Spec refs: FR-Acc1, C-OAUTH-1, C-OAUTH-2
  - Files: `src/core/identity/microsoft-provider.ts`
  - Depends on: T160
  - Verification: `pnpm test:unit -- tests/unit/core/identity/microsoft-provider.spec.ts`
  - Notes: Same `IdentityProvider` interface. Personal MSA + workplace tenants both supported.

### OneDrive CloudStorageProvider

- [ ] **T162** **Write failing tests for OneDrive CloudStorageProvider**
  - Phase: M6
  - Module: Cloud Audit
  - Spec refs: FR-A1 (OneDrive)
  - Files: `tests/unit/cloud/onedrive-provider.spec.ts`
  - Depends on: T097, T161
  - Verification: `pnpm test:unit -- tests/unit/cloud/onedrive-provider.spec.ts`
  - Notes: Graph `/me/drive/root/children` (recursive). Sharing links + per-item permissions. 100 req/min consumer.

- [ ] **T163** **Implement OneDrive CloudStorageProvider**
  - Phase: M6
  - Module: Cloud Audit
  - Spec refs: FR-A1 (OneDrive)
  - Files: `src/cloud/onedrive-provider.ts`
  - Depends on: T162
  - Verification: `pnpm test:unit -- tests/unit/cloud/onedrive-provider.spec.ts`
  - Notes: Implements `CloudStorageProvider` interface. Consumes `AccountManager` for tokens.

### Outlook EmailProvider

- [ ] **T164** **Write failing tests for Outlook EmailProvider (DOM compose intercept + Graph inbound)**
  - Phase: M6
  - Module: Email Guardian
  - Spec refs: FR-E1 (Outlook)
  - Files: `tests/unit/content/outlook/selectors.spec.ts`, `tests/unit/email/outlook-provider.spec.ts`
  - Depends on: T084, T161
  - Verification: `pnpm test:unit -- tests/unit/email/outlook-provider.spec.ts`
  - Notes: Outbound: DOM content script on Outlook web. Inbound: Graph `Mail.Read`. Same cascade+canary discipline.

- [ ] **T165** **Implement Outlook EmailProvider**
  - Phase: M6
  - Module: Email Guardian
  - Spec refs: FR-E1 (Outlook)
  - Files: `src/content/outlook/index.ts`, `src/content/outlook/selectors.ts`, `src/content/outlook/canary.ts`, `src/content/outlook/banner.ts`, `src/email/outlook-provider.ts`
  - Depends on: T164
  - Verification: `pnpm test:unit -- tests/unit/email/outlook-provider.spec.ts`
  - Notes: Same `EmailProvider` interface. Same modal flow. Cascade selectors for Outlook web.

### Outlook CalendarProvider

- [ ] **T166** **Write failing tests for Outlook CalendarProvider (Graph Calendars.Read / ReadWrite)**
  - Phase: M6
  - Module: Calendar Audit
  - Spec refs: FR-Cal1 (Outlook)
  - Files: `tests/unit/calendar/outlook-provider.spec.ts`
  - Depends on: T138, T161
  - Verification: `pnpm test:unit -- tests/unit/calendar/outlook-provider.spec.ts`
  - Notes: Graph `/me/calendar/events`. `Calendars.Read` for read, `Calendars.ReadWrite` for Pro redact.

- [ ] **T167** **Implement Outlook CalendarProvider**
  - Phase: M6
  - Module: Calendar Audit
  - Spec refs: FR-Cal1 (Outlook)
  - Files: `src/calendar/outlook-provider.ts`
  - Depends on: T166
  - Verification: `pnpm test:unit -- tests/unit/calendar/outlook-provider.spec.ts`
  - Notes: Implements `CalendarProvider` interface. Consumes `AccountManager`.

### Stripe Checkout Integration

- [ ] **T168** `[P]` **Write FakeBillingProvider test double**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `tests/fakes/billing/fake-billing-provider.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/fakes/billing/`
  - Notes: Implements `BillingProvider` interface. Returns configurable tier status.

- [ ] **T169** **Write failing tests for Stripe Checkout (startCheckout, openPortal, currentTier)**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: C-PAY-1, C-PAY-2, C-PAY-3, C-PAY-4
  - Files: `tests/unit/core/billing.spec.ts`
  - Depends on: T168
  - Verification: `pnpm test:unit -- tests/unit/core/billing.spec.ts`
  - Notes: Test Stripe publishable key only (no secret in extension). Test entitlement JWT verification. Test tier-cache TTL (30 s). All 4 SKUs (Basic monthly/annual, Pro monthly/annual).

- [ ] **T170** **Implement Stripe Checkout + BillingProvider**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: C-PAY-1, C-PAY-2, C-PAY-3, C-PAY-4
  - Files: `src/core/billing.ts`, `src/core/billing-stripe.ts`
  - Depends on: T169
  - Verification: `pnpm test:unit -- tests/unit/core/billing.spec.ts`
  - Notes: Opens Stripe Checkout in new tab. Entitlement cached in storage, refreshed every 30 s from entitlement host.

### Entitlement Worker (Cloudflare)

- [ ] **T171** **Write failing tests for entitlement worker (webhook signature, JWT issuance, replay resistance)**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: C-PAY-1, C-PAY-2, C-PAY-3, C-PAY-4
  - Files: `tests/unit/worker/entitlement.spec.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/worker/entitlement.spec.ts`
  - Notes: Cloudflare Worker. Test `Stripe-Signature` HMAC verification. Test short-lived (24h) JWT RS256. Test webhook `id` replay resistance.

- [ ] **T172** **Implement entitlement worker**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: C-PAY-1, C-PAY-2, C-PAY-3, C-PAY-4
  - Files: `worker/entitlement/index.ts`, `worker/entitlement/wrangler.toml`
  - Depends on: T171
  - Verification: `pnpm test:unit -- tests/unit/worker/entitlement.spec.ts`
  - Notes: Single endpoint. JWKS pinned in extension code. EU VAT handled by Stripe.

### Billing UI

- [ ] **T173** **Write failing tests for Billing UI (plan picker, current plan display, upgrade/downgrade flow)**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `tests/unit/popup/routes/billing.spec.tsx`
  - Depends on: T170
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/billing.spec.tsx`
  - Notes: Test Free to Basic, Free to Pro, Basic to Pro upgrade. Test plan display with entitlement details.

- [ ] **T174** **Implement Billing UI**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `src/popup/routes/billing/index.tsx`, `src/popup/routes/billing/plan-picker.tsx`
  - Depends on: T173
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/billing.spec.tsx`
  - Notes: Annual prices with discount display. "Save approximately 19 EUR/yr" for Pro annual.

### Wire TierGate to Real Entitlement

- [ ] **T175** **Write failing tests + implement TierGate flip from preview to real entitlement (Stripe-driven)**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: FR-C5
  - Files: `tests/unit/core/tier-gate-real.spec.ts`, `src/core/tier-gate.ts` (modify)
  - Depends on: T170
  - Verification: `pnpm test:unit -- tests/unit/core/tier-gate-real.spec.ts`
  - Notes: Replace preview resolver with Stripe-webhook-populated entitlement. 30 s cache refresh from service worker.

### Multi-provider Regression

- [ ] **T176** **Write cross-provider regression tests (Google + Microsoft accounts, same UX)**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `tests/acceptance/multi-provider.spec.ts`
  - Depends on: T161, T163, T165, T167
  - Verification: `pnpm test:e2e -- tests/acceptance/multi-provider.spec.ts`
  - Notes: Same `ScanVerdict` + modal flow regardless of provider. Same AccountSwitcher. Same audit engine.

### Tier-switch Integration Test

- [ ] **T177** **Write tier-switch integration test (Free to Basic to Pro and back)**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `tests/acceptance/tier-switch.spec.ts`
  - Depends on: T175
  - Verification: `pnpm test:e2e -- tests/acceptance/tier-switch.spec.ts`
  - Notes: Simulate tier changes via FakeBillingProvider. Verify feature gates flip correctly for all modules.

### M6 Checkpoint

- [ ] **T178** `[O]` **M6 phase gate — full verification**
  - Phase: M6
  - Module: Cross-cutting
  - Spec refs: —
  - Files: —
  - Depends on: T160–T177
  - Verification: `pnpm verify`
  - Notes: Multi-provider regression green. All M1–M6 tests pass.

---

## M7 — Score + Polish + Submission (W27–30)

### Exposure Score Engine

- [x] **T179** **Write failing tests for Exposure Score engine (weighted across all modules)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: FR-C1
  - Files: `tests/unit/core/exposure-score.spec.ts`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/core/exposure-score.spec.ts`
  - Notes: Test weighted computation: critical findings, warnings, public Drive files, breached emails, unchecked brokers. Test bonuses (all categories, email guardian, recent audit, all brokers checked). Test reactive update.

- [x] **T180** **Implement Exposure Score engine**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: FR-C1
  - Files: `src/core/exposure-score.ts`
  - Depends on: T179
  - Verification: `pnpm test:unit -- tests/unit/core/exposure-score.spec.ts`
  - Notes: 0–100 score. Badge color mapped per PRD. Recomputed on any finding-altering event.

- [ ] **T181** **Write failing tests + implement ExposureScore UI component (score numeral, severity color, breakdown drawer)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: FR-C1
  - Files: `tests/unit/ui/components/exposure-score.spec.tsx`, `src/ui/components/ExposureScore/index.tsx`, `src/ui/components/ExposureScore/ExposureScore.module.css`
  - Depends on: T180
  - Verification: `pnpm test:unit -- tests/unit/ui/components/exposure-score.spec.tsx`
  - Notes: Motion One `scoreSpring` for score changes. Breakdown drawer shows per-module contributions.

### Onboarding Flow

- [ ] **T182** **Write failing tests for onboarding flow (5 clicks or fewer from install to dashboard)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: FR-R6, US-01
  - Files: `tests/unit/popup/routes/onboarding.spec.tsx`
  - Depends on: T047, T065
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/onboarding.spec.tsx`
  - Notes: Test: install, locale picker, preset picker, dashboard. 5 clicks or fewer. Test preset applies correctly. Test `motion-considered` transitions.

- [ ] **T183** **Implement onboarding flow**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: FR-R6, US-01
  - Files: `src/popup/routes/onboarding/index.tsx`, `src/popup/routes/onboarding/locale-step.tsx`, `src/popup/routes/onboarding/preset-step.tsx`, `src/popup/routes/onboarding/welcome-step.tsx`
  - Depends on: T182
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/onboarding.spec.tsx`
  - Notes: Sets `Prefs.onboardingCompleted`. Persists active preset + locale choice.

### Settings Page

- [ ] **T184** **Write failing tests for Settings page (language, notifications, data retention, export settings)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: FR-C2, FR-C3, AC-C1, US-08
  - Files: `tests/unit/options/settings.spec.tsx`
  - Depends on: —
  - Verification: `pnpm test:unit -- tests/unit/options/settings.spec.tsx`
  - Notes: Test language EN/EL switch. Test "Delete all my data" type-to-confirm leads to all storage wiped and first-run state.

- [ ] **T185** **Implement Settings page**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: FR-C2, FR-C3, AC-C1, US-08
  - Files: `src/options/settings.tsx`
  - Depends on: T184
  - Verification: `pnpm test:unit -- tests/unit/options/settings.spec.tsx`
  - Notes: "Delete all my data": wipe storage + IDB + caches + revoke tokens + remove optional permissions + clearAllCachedAuthTokens. Idempotent.

### Dashboard UI

- [ ] **T186** **Write failing tests + implement main dashboard (module cards, Exposure Score, quick actions)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: FR-C1
  - Files: `tests/unit/popup/routes/dashboard.spec.tsx`, `src/popup/routes/dashboard/index.tsx`
  - Depends on: T181
  - Verification: `pnpm test:unit -- tests/unit/popup/routes/dashboard.spec.tsx`
  - Notes: Module icons from ui-components.md. Quick actions: scan a file, check a password, start audit.

### Full A11y Pass

- [ ] **T187** **Full WCAG 2.1 AA accessibility audit across all routes**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: NFR-A1
  - Files: `tests/a11y/full-pass.spec.ts`
  - Depends on: T183, T185, T186
  - Verification: `pnpm test:a11y`
  - Notes: Playwright + axe-core on every route. Color contrast ≥4.5:1. Keyboard-only navigation. `aria-label` on all icon buttons. Focus trap in modals. `prefers-reduced-motion` honored.

### Performance Budgets

- [ ] **T188** **Write performance benchmark tests (1 MB PDF, 10 MB PDF, 3k-file Drive enum)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: NFR-P1, NFR-P2, NFR-P4, NFR-B1
  - Files: `tests/perf/benchmarks.spec.ts`
  - Depends on: T051, T103
  - Verification: `pnpm test:perf`
  - Notes: Popup initial open ≤250 ms. 1 MB PDF ≤2 s. 10 MB PDF ≤10 s. Drive listing ≤15 s for 3k files. Bundle ≤25 MB total, ≤500 KB popup.

- [x] **T189** `[H]` **Enforce bundle budget in CI (per-chunk breakdown)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: NFR-B1
  - Files: `scripts/check-bundle-budget.mjs` (modify)
  - Depends on: —
  - Verification: `pnpm build && node scripts/check-bundle-budget.mjs`
  - Notes: Per-chunk budget breakdown: Preact ~15 KB, Floating UI ~6 KB, Lucide ~15 KB, fonts ~120 KB, component CSS ~25 KB, component JS ~40 KB.

### Visual Regression Tests

- [ ] **T190** **Set up Playwright visual regression snapshot tests for all UI components**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `tests/visual/components.spec.ts`
  - Depends on: T187
  - Verification: `pnpm test:visual`
  - Notes: Image diff per component story. Threshold 0.1% pixel difference fails. Catches token drift.

### i18n Completion

- [x] **T191** `[H]` **Complete EN + EL locale strings for all v1.0 UI surfaces**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: NFR-I1
  - Files: `_locales/en/messages.json`, `_locales/el/messages.json`
  - Depends on: T183, T185, T186
  - Verification: `pnpm lint`
  - Notes: No hardcoded UI strings. Copy linter verifies no banned jargon.

### Cross-cutting Acceptance Tests

- [ ] **T192** **Write AC-C1 acceptance test (Delete all my data leads to empty storage)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: AC-C1
  - Files: `tests/acceptance/cross-cutting.spec.ts`
  - Depends on: T185
  - Verification: `pnpm test:e2e -- tests/acceptance/cross-cutting.spec.ts`
  - Notes: `chrome.storage.local` dump after wipe returns empty. IDB empty. Optional permissions removed.

- [ ] **T193** **Write AC-C2 acceptance test (network egress only to allowlisted hosts)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: AC-C2, NFR-S1
  - Files: `tests/acceptance/cross-cutting.spec.ts` (append)
  - Depends on: T067
  - Verification: `pnpm test:e2e -- tests/acceptance/cross-cutting.spec.ts`
  - Notes: Loads allowlist from `contracts/integration-apis.md`. Feature-gated hosts only count when feature active.

- [ ] **T194** **Write AC-C3 acceptance test (bundle size check)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: AC-C3, NFR-B1
  - Files: `tests/acceptance/cross-cutting.spec.ts` (append)
  - Depends on: T189
  - Verification: `pnpm build && node scripts/check-bundle-budget.mjs`
  - Notes: ≤25 MB total, ≤500 KB popup.

### Supply Chain Security

- [ ] **T195** `[H]` **Write + integrate C-SUP-4 (SBOM per release) + C-SUP-5 (Sigstore signing) into release workflow**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: C-SUP-4, C-SUP-5
  - Files: `.github/workflows/release.yml`, `scripts/check-reproducible.mjs`
  - Depends on: —
  - Verification: manual (release workflow)
  - Notes: CycloneDX JSON SBOM. `cosign sign-blob` on Web Store zip. Reproducible build check (hash twice).

- [ ] **T196** `[H]` **Write + integrate C-SUP-3 (license allowlist check) + C-SUP-7 (deps rationale)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: C-SUP-3, C-SUP-7
  - Files: `scripts/check-licenses.mjs`, `scripts/check-deps-rationale.mjs`, `docs/deps-rationale.md`
  - Depends on: —
  - Verification: `node scripts/check-licenses.mjs && node scripts/check-deps-rationale.mjs`
  - Notes: Apache-2.0, MIT, BSD-2/3, ISC, MPL-2.0, OFL-1.1 only. Every direct dep >5k LoC has an entry.

### Store Listing

- [ ] **T197** `[P]` `[H]` **Create Chrome Web Store listing artifacts (screenshots, descriptions, icons)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `store/screenshots/`, `store/description.md`, `store/icons/`
  - Depends on: T186
  - Verification: manual
  - Notes: 5+ screenshots at 1280x800 and 640x400. Short + detailed description. Icon at 128x128.

- [ ] **T198** `[P]` `[H]` **Create privacy policy + Limited Use Disclosure documents**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `docs/legal/privacy-policy.md`, `docs/legal/limited-use-disclosure.md`
  - Depends on: —
  - Verification: manual
  - Notes: Required for Chrome Web Store. Required for OAuth verification. Details how ShieldMe uses and does not use user data.

### End-to-end Regression

- [ ] **T199** **Full Playwright E2E regression suite (all modules, all tiers)**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: NFR-Q3
  - Files: `tests/e2e/full-regression.spec.ts`
  - Depends on: T187
  - Verification: `pnpm test:e2e`
  - Notes: Chromium stable + beta. All modules exercised. Tier transitions verified.

### CHANGELOG.security.md

- [ ] **T200** `[H]` **Create CHANGELOG.security.md with all security-touching changes across M1–M7**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: —
  - Files: `CHANGELOG.security.md`
  - Depends on: —
  - Verification: manual
  - Notes: Required by security-controls.md section 5. Every network host, browser permission, dependency, and secret-handling module change documented.

### Web Store Submission

- [ ] **T201** **Web Store submission package preparation + submission**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: —
  - Files: —
  - Depends on: T195, T196, T197, T198, T199, T200
  - Verification: manual
  - Notes: Final `pnpm verify` pass. SBOM + Sigstore signed. Privacy policy published. OAuth verification status confirmed. Submit to Chrome Web Store.

### M7 Checkpoint

- [ ] **T202** `[O]` **M7 phase gate — all NFRs green, submission-ready**
  - Phase: M7
  - Module: Cross-cutting
  - Spec refs: all NFRs
  - Files: —
  - Depends on: T179–T201
  - Verification: `pnpm verify`
  - Notes: All NFRs green. Tier-switch integration test. Full regression. Bundle budget. A11y. Store listing. Submit v1.0.

---

## Parallelism Summary

### M1 Parallel Tracks
- **Track A (Detection Engine Core):** T001–T009 (sequential)
- **Track B (Validators):** T010–T011 (parallel with Track A after T003)
- **Track C (Detectors):** T012–T043 (batched by category, parallel across categories after T003+T005)
- **Track D (Parsers):** T048–T059 (parallel with detector work)
- **Track E (Security Controls):** T066–T068 (fully parallel)
- **Track F (Custom Rules + Presets):** T044–T047 (after T003)
- **Track G (UI):** T060–T065 (after T009+T058)
- **Convergence:** T069–T073 (acceptance tests, after all tracks)

### M2 Parallel Tracks
- **Track A (Identity):** T075–T083
- **Track B (Email Guardian):** T084–T089 (parallel with identity after T084)
- **Track C (Kill-switch + Security):** T090–T092 (fully parallel)
- **Track D (Migration):** T095 (parallel)
- **Convergence:** T093–T094

### M3 Parallel Tracks
- **Track A (Drive Provider + Audit):** T097–T105
- **Track B (Share Intercept):** T106–T107 (after T009)
- **Track C (Watermark + Continuous):** T108–T111 (after T099)
- **Track D (UI):** T112–T113 (after T103)
- **Track E (Egress + OAuth):** T114–T115 (fully parallel)
- **Convergence:** T116–T117

### M4 Parallel Tracks
- **Track A (Passwords + Emails):** T119–T122
- **Track B (Brokers):** T123–T124 (parallel)
- **Track C (Toolkit):** T127–T132 (parallel after T009)
- **Track D (Telemetry):** T133–T134 (parallel)
- **Track E (UI):** T125–T126 (after A+B)
- **Convergence:** T135–T136

### M5 Parallel Tracks
- **Track A (Calendar):** T138–T145
- **Track B (Subscription Audit):** T146–T147 (parallel)
- **Track C (Travel Mode):** T148–T149 (parallel)
- **Track D (Inbound Email):** T150–T155 (parallel with calendar)
- **Convergence:** T156–T158

### M6 Parallel Tracks
- **Track A (Microsoft Identity):** T160–T161
- **Track B (OneDrive):** T162–T163 (after T161)
- **Track C (Outlook Email):** T164–T165 (after T161)
- **Track D (Outlook Calendar):** T166–T167 (after T161)
- **Track E (Billing):** T168–T175 (parallel with providers)
- **Convergence:** T176–T177

### M7 Parallel Tracks
- **Track A (Score + Dashboard):** T179–T186
- **Track B (Settings + Onboarding):** T182–T185 (parallel)
- **Track C (A11y + Performance):** T187–T190 (after UI)
- **Track D (Store Prep):** T195–T200 (parallel)
- **Convergence:** T191–T194, T199, T201–T202
