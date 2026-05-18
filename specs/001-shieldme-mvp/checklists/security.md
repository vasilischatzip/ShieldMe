# Security Review Checklist — ShieldMe MVP

**Scope:** PR-level security review gate. Every PR that touches a security-sensitive code path must evaluate every applicable item before merge.
**Version:** 1.0 · **Updated:** 2026-05-15
**Authorities:** Constitution §I/II/III/VIII/IX/XII/XV · `threat-model.md` · `security-controls.md` · `contracts/integration-apis.md §1`

---

## How to use this checklist

1. Scan your diff. Identify which **layers** (L1–L7) and **sections** your change touches.
2. For each applicable item, mark one of:
   - `[x]` — confirmed green
   - `[-]` — not applicable (add a one-line reason in the PR comment)
   - `[!]` — violation found — **blocks merge**
3. Paste the relevant section(s) into your PR description.
4. The **Threat Model Residual Risk Sign-off** table at the bottom applies to every PR that touches a CRIT or HIGH risk area; the reviewer checks the row, not the author.

Items marked *(M6+)* or *(v1.5+)* apply only from that phase onward.

---

## L1 — Browser Sandbox

> Chrome trust boundary — not ours to control. Document residual risks; do not assume stronger isolation than the model provides.

- [ ] **L1-1.** The PR does not assume stronger sandbox isolation than Chrome's standard MV3 extension model. Any new reliance on a Chrome-internal guarantee (e.g., `chrome.identity` session isolation) is called out in the PR description.
  - *Constitution:* §XII — threat model updated when new modules handle secrets/OAuth
  - *Threat model:* A2 (malicious extension on same profile — in-scope, partial mitigation), A7 (local malware — out-of-scope)
  - *Verification:* Code review. No new `chrome.runtime.sendMessage` receiver accepts callers without valibot schema validation (see L4-2).

- [ ] **L1-2.** If this PR introduces reliance on any new Chrome API, `threat-model.md` records the new trust boundary and any residual risk.
  - *Constitution:* §XII — "updated whenever a new module handles secrets, OAuth, or scan content"
  - *Verification:* Code review. `threat-model.md` `Updated:` date is within 90 days; if the date is older, file a freshness update as part of this PR.

---

## L2 — Extension CSP

> `script-src 'self' 'wasm-unsafe-eval'` — no inline scripts, no CDN, no eval.

- [ ] **L2-1.** The `content_security_policy` in `src/manifest.ts` is exactly:
  ```
  script-src 'self' 'wasm-unsafe-eval';
  object-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src <egress-allowlist>;
  default-src 'none';
  trusted-types shieldme;
  require-trusted-types-for 'script';
  ```
  No deviation — not even additive.
  - *Constitution:* §VIII (zero runtime external deps) · §I (no code from remote)
  - *Security control:* L2 (security-controls.md §1)
  - *Verification:* `node scripts/verify-csp.mjs` — CI gate, blocks merge on mismatch.

- [ ] **L2-2.** No new `eval()`, `new Function()`, `document.write()`, dynamically constructed `<script>`, or `Function` constructor call is introduced anywhere in `src/`.
  - *Constitution:* §VIII
  - *Threat model:* R-CRIT-1 (supply-chain injected code)
  - *Verification:* ESLint `no-eval` rule. `pnpm lint` — CI gate.

- [ ] **L2-3.** No new CDN `<script>`, `<link rel="stylesheet">`, or `<img>` source pointing to an external origin appears in any HTML or manifest file.
  - *Constitution:* §VIII — "All libraries bundled at build time. No CDN requests."
  - *Security control:* C-NET-3 (SRI for any pinned remote resource)
  - *Verification:* `node scripts/check-egress-allowlist.mjs` + manual grep of `dist/` for external `src` / `href` attributes.

- [ ] **L2-4.** The `connect-src` in the built CSP is consistent with the active egress allowlist — no host appears in `connect-src` that is not in `contracts/integration-apis.md §1`, and vice versa.
  - *Security control:* C-NET-1, C-NET-2
  - *Verification:* `node scripts/verify-csp.mjs` cross-checks against the contract at build time — CI gate.

---

## L3 — Trusted Types

> All DOM mutations go through the `shieldme` Trusted Types policy. Direct `innerHTML` assignment is a lint error in `src/`.

- [ ] **L3-1.** No new `element.innerHTML = <value>` assignment, `insertAdjacentHTML()`, or `document.write()` call is introduced in `src/`. All DOM injection goes through the `shieldme` policy in `src/security/trusted-types.ts`.
  - *Constitution:* §I (no injection path for exfiltration)
  - *Security control:* C-CS-1
  - *Threat model:* R-CRIT-5 (compose-content leak via injected sibling script)
  - *Verification:* ESLint rule bans direct `innerHTML` assignment. `pnpm lint` — CI gate.

- [ ] **L3-2.** The `shieldme` Trusted Types policy validates its input — it is not a pass-through wrapper.
  - *Security control:* C-CS-1
  - *Verification:* E2E test attempts raw `innerHTML` assignment and asserts a Trusted Types CSP violation is thrown, not silently allowed. `pnpm test:e2e` — CI gate.

- [ ] **L3-3.** Drive API responses, calendar event fields, and email body content pass through a typed `valibot` validator before reaching any renderer or DOM insertion point.
  - *Constitution:* §I (scan content stays client-side and unmodified-by-the-extension)
  - *Threat model:* R-CRIT-4 (OAuth XSS path via Drive content)
  - *Verification:* Unit test: feed a malformed Drive/calendar/email API response to the validator and assert it is rejected before the renderer is called. `pnpm test:unit`.

---

## L4 — Process Isolation

> Popup ↔ Service Worker ↔ Offscreen ↔ Content Script — each its own world; messages typed and validated.

- [ ] **L4-1.** Heavy parsing (PDF, DOCX, XLSX, Tesseract) executes in the offscreen document, not in the popup, service worker, or content script. Parsers are dynamically imported only from `src/offscreen/`.
  - *Constitution:* §XV (inbound content trust) · §I (scan content does not leak to accessible workers)
  - *Security control:* C-IN-1
  - *Verification:* `pnpm build` — assert parser chunks (pdf.js, mammoth, SheetJS) are absent from the popup initial bundle. Integration test confirms parser module is not reachable from the service worker context.

- [ ] **L4-2.** Every `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` receiver validates incoming payloads with a `valibot` schema before processing. Unknown message types are silently dropped.
  - *Security control:* C-CS-4
  - *Threat model:* A2 (malicious extension injecting into our message bus)
  - *Verification:* Unit test: send a malformed payload to every message receiver and assert it is rejected (typed error, no side effects). `pnpm test:unit`.

- [ ] **L4-3.** The Gmail content script is declared with `"world": "ISOLATED"` in `src/manifest.ts`. No global variables are shared with the page or other extensions.
  - *Security control:* C-CS-3
  - *Threat model:* R-CRIT-5
  - *Verification:* CI grep of `src/manifest.ts` asserts `world: "ISOLATED"` (or its CRXJS equivalent) for every content-script entry. `pnpm typecheck`.

- [ ] **L4-4.** The content script asserts `location.hostname === "mail.google.com"` (or the declared host) before activating any logic. It exits silently if the assertion fails.
  - *Security control:* C-CS-5
  - *Verification:* Integration test: load the content script on a non-Gmail origin and confirm it performs no DOM operations. `pnpm test:e2e`.

- [ ] **L4-5.** Inbound email and Drive content scanning is initiated from the offscreen document — never from the popup or content script directly.
  - *Constitution:* §XV — "Inbound parsing happens in the offscreen document, not the popup or content script"
  - *Security control:* C-IN-1
  - *Verification:* Code review: trace the inbound scan call path end-to-end. Integration test. `pnpm test:e2e`.

---

## L5 — Memory Hygiene

> Decrypted secrets travel through closures only. Never module-level state. Logs banned. Buffers zero-filled.

- [ ] **L5-1.** No decrypted secret — API key, OAuth token, wrapping key material, account derived key — is assigned to a module-level `let`, `const`, or exported variable. Decrypted values travel only as closure-local variables or through the `using`-disposable wrapper.
  - *Security control:* C-MEM-1 (disposable wrapper), C-MEM-5 (short-lived sessions)
  - *Threat model:* R-CRIT-2 (malicious extension on same profile reads module state)
  - *Verification:* Code review of any new `Crypto.decryptString` call site. ESLint `no-secret-logging`. `pnpm lint` — CI gate.

- [ ] **L5-2.** No `console.log`, `console.debug`, `console.trace`, `console.info`, or `console.warn` call receives a value of type `ApiKey | EncryptedBlob | DecryptedKey | RefreshToken | IdToken` — even in error paths.
  - *Security control:* C-MEM-2 (banned logging), C-MEM-3 (phantom-branded types make this type-detectable)
  - *Threat model:* R-CRIT-2
  - *Verification:* ESLint rule `no-secret-logging` (configured in `eslint.config.js`). `pnpm lint` — CI gate.

- [ ] **L5-3.** All random number generation in security-sensitive paths uses `crypto.getRandomValues`. No `Math.random()` call appears in `src/` (except in test utilities where it is explicitly permitted).
  - *Threat model:* R-MED-4 (wrapping key seed predictable via Math.random)
  - *Verification:* CI grep: `Math.random` outside `tests/` fails the build. `pnpm lint`.

- [ ] **L5-4.** Web Crypto input and output `ArrayBuffer`s are zero-filled after use where the API permits (i.e., after `encrypt` the plaintext buffer is zeroed; after `decrypt` the ciphertext buffer is zeroed).
  - *Security control:* C-MEM-4
  - *Threat model:* R-CRIT-2
  - *Verification:* Unit test: call `Crypto.decryptString`, let the disposable resolve, then inspect the underlying buffer and assert it is all zeros. `pnpm test:unit`.

- [ ] **L5-5.** The Gmail content script reads the compose body **only** at the moment the user clicks Send — not proactively, not in a `MutationObserver` callback, not on compose-window open.
  - *Constitution:* §XII (memory hygiene binding rule) · §XV
  - *Security control:* C-MEM-5, C-CS-2
  - *Threat model:* R-CRIT-5 residual (compose content readable by other extensions with same host permission)
  - *Verification:* Integration test: open a compose window, type text, do not click Send — assert the content script has not read the body. `pnpm test:e2e`.

---

## L6 — Per-account Key Derivation

> Each account gets an AES-GCM key derived via HKDF from the wrapping seed + account ULID. Compromising one account's namespace cannot decrypt another's.

- [ ] **L6-1.** Every new account's tokens and scoped secrets are encrypted with a key derived via HKDF from the per-install wrapping seed and the account's ULID as the `info` parameter — not the global wrapping key directly.
  - *Security control:* C-KEY-1
  - *Threat model:* R-CRIT-2 (cross-account key leakage)
  - *Verification:* Unit test: derive two account keys from the same seed (different ULIDs), encrypt with key A, assert decryption with key B fails with `InvalidAccessError` or equivalent. `pnpm test:unit`.

- [ ] **L6-2.** Every `CryptoKey` instance created by `src/core/crypto.ts` is imported with `extractable: false`.
  - *Security control:* C-KEY-3
  - *Verification:* Unit test: call `crypto.subtle.exportKey("raw", key)` on every `CryptoKey` produced by the crypto module and assert it throws `InvalidAccessError`. `pnpm test:unit`.

- [ ] **L6-3.** `Crypto.rotateWrappingKey()` re-derives all existing account keys and re-encrypts all stored secrets atomically. A simulated mid-rotation failure leaves the old wrapping key intact (all secrets still decryptable; no partial state).
  - *Security control:* C-KEY-2
  - *Verification:* Unit test: inject a failure mid-rotation and assert (a) the old wrapping key still decrypts all secrets, and (b) no partial new-key ciphertext was persisted. `pnpm test:unit`.

---

## L7 — Anti-tamper Seals

> Every `LocalStore.set` writes an HMAC-SHA-256 seal. Every `LocalStore.get` verifies it. Mismatch triggers the recovery screen — never silent.

- [ ] **L7-1.** Every write to `chrome.storage.local` via `LocalStore.set` includes an HMAC-SHA-256 seal computed over `JSON(value)` with the per-install secret. Every read via `LocalStore.get` verifies the seal before returning.
  - *Constitution:* §II (auditability — storage is tamper-evident)
  - *Security control:* C-SEAL-1
  - *Threat model:* A2 (malicious extension modifies raw `chrome.storage.local` entries)
  - *Verification:* Unit test: write a value via `LocalStore.set`, mutate the raw entry directly in the mock storage, call `LocalStore.get`, and assert the recovery flow is triggered (not silent, not silently returning the mutated value). `pnpm test:unit`.

- [ ] **L7-2.** The install secret (`meta.installSecret`) is 32 random bytes from `crypto.getRandomValues`, generated exactly once at first run. It is never logged, never transmitted, and never readable outside `src/core/storage.ts`.
  - *Security control:* C-SEAL-2
  - *Threat model:* R-CRIT-2
  - *Verification:* Unit test: confirm `meta.installSecret` does not appear in any telemetry payload, egress fetch body, or log statement (ESLint `no-secret-logging`). `pnpm test:unit && pnpm lint`.

- [ ] **L7-3.** Migrations rewrite seals atomically. A migration failure (simulated by injecting a throw mid-run) sets `meta.recoveryRequired = true` and does not leave partially migrated, partially sealed data accessible through normal `LocalStore.get` calls.
  - *Security control:* C-SEAL-3
  - *Verification:* Unit test: run a migration with an injected mid-run failure; assert `recoveryRequired === true`; assert all pre-migration data is still readable with the old seals; assert no post-migration partial data is accessible. `pnpm test:unit`.

---

## Supply Chain

> R-CRIT-1: typosquatting, hijacked maintainer, malicious release. Controls: C-SUP-1 through C-SUP-9.

- [ ] **SC-1.** `pnpm-lock.yaml` is updated in this PR **only** if `package.json` dependencies changed. A lockfile-only diff requires an explicit explanation in the PR description.
  - *Security control:* C-SUP-1
  - *Verification:* CI: `pnpm install --frozen-lockfile` — blocks merge if lockfile is out of sync.

- [ ] **SC-2.** `pnpm audit --prod --audit-level=high` reports zero Critical vulnerabilities. Any High severity vulnerability has an explicit acknowledgement comment in the PR body.
  - *Security control:* C-SUP-2
  - *Verification:* CI gate — Critical blocks merge automatically; High requires PR comment to merge. `pnpm verify`.

- [ ] **SC-3.** Every new direct dependency's license is in the allowlist: Apache-2.0, MIT, BSD-2, BSD-3, ISC, MPL-2.0, OFL-1.1. GPL-family, AGPL, SSPL, or proprietary licenses block the build.
  - *Constitution:* §XIV (free-for-commercial assets only) · §VIII (bundled, no CDN)
  - *Security control:* C-SUP-3
  - *Verification:* `scripts/check-licenses.mjs` — CI gate.

- [ ] **SC-4.** Every new direct dependency with >5,000 lines of code has a "why this dep" entry in `docs/deps-rationale.md`.
  - *Security control:* C-SUP-7
  - *Verification:* `scripts/check-deps-rationale.mjs` — CI gate.

- [ ] **SC-5.** No new dependency introduces a `postinstall` script. Any existing `postinstall` exceptions remain in the reviewed allow-list.
  - *Security control:* C-SUP-9
  - *Verification:* CI: `pnpm install --ignore-scripts` succeeds without error.

- [ ] **SC-6.** No dependency version bump is merged without a human-authored PR comment explaining the reason. Auto-bump PRs from Dependabot require at least one human approval beyond the bot.
  - *Security control:* C-SUP-6 (alert-only mode; humans approve every bump)
  - *Verification:* Branch protection: Dependabot PRs require 1 human approval.

- [ ] **SC-7.** *(Release PRs only)* The SBOM is regenerated via `cyclonedx-pnpm` and committed to `releases/<version>/sbom.cdx.json` before the release tag is created.
  - *Security control:* C-SUP-4
  - *Verification:* Release workflow CI step. File is present and non-empty at the tag commit.

- [ ] **SC-8.** *(Release PRs, M2+)* The Web Store zip is Sigstore-signed via `cosign sign-blob` and the signature published alongside the SBOM at `releases/<version>/shieldme.zip.sig`.
  - *Security control:* C-SUP-5
  - *Verification:* Release workflow CI step. `cosign verify-blob` passes against the published signature.

- [ ] **SC-9.** *(Release PRs)* The build is reproducible: CI builds `dist/` twice from identical inputs and asserts identical output hashes.
  - *Security control:* C-SUP-8
  - *Verification:* `scripts/check-reproducible.mjs` — release workflow CI step.

---

## Egress Allowlist

> Single source of truth: `contracts/integration-apis.md §1`. Any host not listed = CI failure. C-NET-1 (build-time) + C-NET-2 (runtime).

- [ ] **EG-1.** No new network host is contacted by the extension unless it appears verbatim in `contracts/integration-apis.md §1`.
  - *Constitution:* §I — "External API calls transmit only hashed/anonymized identifiers OR the user's own OAuth key against their own account"
  - *Security control:* C-NET-1, C-NET-2
  - *Threat model:* R-CRIT-1 (exfiltration via compromised dep), R-HIGH-7 (telemetry leaks scan content)
  - *Verification:* `node scripts/check-egress-allowlist.mjs` — scans built JS for string-literal URLs. CI gate; blocks merge on any unlisted host.

- [ ] **EG-2.** If this PR adds a new host: `contracts/integration-apis.md §1` and `threat-model.md` are both updated **in the same PR**. No code reaches a new host before the contract is updated.
  - *Constitution:* §XII — "update threat-model whenever a new external host is added"
  - *Security control:* C-NET-1 (allowlist is the contract, not the code)
  - *Verification:* Code review. `node scripts/check-egress-allowlist.mjs` will fail if code reaches a host not yet in the contract.

- [ ] **EG-3.** Opt-in-gated hosts are unreachable when their feature flag is disabled. They do not appear in any fetch call path that can be reached without the corresponding user action.
  - Gated hosts: Plausible (`analyticsOptedIn`), tessdata (`non-English OCR lang selected`), HIBP keyed (`hibp key saved`), selectors host (`canary failure only`), Stripe and entitlement host (`M6 billing only`), sender-rep host (`inbound enabled`).
  - *Constitution:* §III (least-privilege — host permissions on-demand)
  - *Security control:* C-NET-2 (runtime wrapper with feature gate)
  - *Verification:* Unit test per gated host: disable its feature flag and assert `src/security/fetch.ts` rejects the host. `pnpm test:unit`.

- [ ] **EG-4.** Authoritative allowlist (check against `contracts/integration-apis.md §1` at review time):

  | Host | Module | Auth | Opt-in gate |
  |---|---|---|---|
  | `https://api.pwnedpasswords.com` | Radar/passwords | None (k-anon) | Always |
  | `https://haveibeenpwned.com/api/v3/*` | Radar/emails | `hibp-api-key` header | HIBP key saved |
  | `https://www.googleapis.com/drive/v3/*` | Drive Audit | OAuth bearer | Drive connected |
  | `https://accounts.google.com/*` | Drive OAuth flow | — | Drive connected |
  | `https://oauth2.googleapis.com/revoke` | Wipe | OAuth token param | Always (wipe action) |
  | `https://www.googleapis.com/calendar/v3/*` | Calendar Audit | OAuth bearer | Calendar connected |
  | `https://graph.microsoft.com/v1.0/me/calendar*` | Outlook Calendar (M6) | OAuth bearer | Outlook connected |
  | `https://graph.microsoft.com/v1.0/me/messages*` | Outlook Inbound (M6) | OAuth bearer | Outlook inbound enabled |
  | `https://tessdata.projectnaptha.com/4.0.0/*` | OCR extra langs (v1.5) | None | User selects non-EN OCR lang |
  | `https://{PLAUSIBLE_HOST}/api/event` | Telemetry | None | `analyticsOptedIn === true` |
  | `https://{SELECTORS_HOST}/shieldme/gmail-selectors.json` | Gmail kill-switch | None (Ed25519-signed) | Canary failure only |
  | `https://{SENDER_REP_HOST}/v1/sender-domain.json` | Inbound phishing list | None (Ed25519-signed) | Inbound enabled |
  | `https://api.stripe.com/*` | Billing (M6) | Stripe publishable key | Tier upgrade flow |
  | `https://{ENTITLEMENT_HOST}/v1/entitlement` | Billing (M6) | Short-lived JWT | After Stripe checkout |

  *Verification:* Cross-check this table against the live contract before approving.

---

## OAuth & Identity

> PKCE code flow only. No implicit flow. No client secret in the extension. Refresh tokens encrypted with the per-account derived key.

- [ ] **OA-1.** All OAuth flows use `chrome.identity.launchWebAuthFlow` with a PKCE code challenge and nonce. `chrome.identity.getAuthToken` is not called anywhere in `src/`.
  - *Constitution:* §XIII (PKCE flow, public client)
  - *Security control:* C-OAUTH-1
  - *Threat model:* R-CRIT-4 (OAuth token theft)
  - *Verification:* CI lint rule bans `getAuthToken` in `src/`. `pnpm lint` — CI gate.

- [ ] **OA-2.** ID tokens are validated client-side via JWKS: signature (RS256/ES256), issuer, audience, expiration, and nonce all verified. A token signed with a key not in the JWKS cache is rejected.
  - *Security control:* C-OAUTH-2
  - *Threat model:* R-CRIT-4
  - *Verification:* Unit tests with known-vector tokens + adversarial tokens (wrong key, expired `exp`, wrong `aud`, mismatched nonce). `pnpm test:unit`.

- [ ] **OA-3.** Refresh tokens are stored encrypted with the per-account derived key (C-KEY-1, HKDF-derived per account ULID), not the global wrapping key.
  - *Security control:* C-OAUTH-3
  - *Verification:* Unit test: store a token under account A's key; attempt to decrypt with account B's key; assert failure. `pnpm test:unit`.

- [ ] **OA-4.** Drive or Calendar write-scope upgrade is a separate, explicitly user-triggered consent screen — never bundled with the initial read-scope grant.
  - *Constitution:* §III (least privilege) · §VI (write scope is Premium-only)
  - *Security control:* C-OAUTH-4
  - *Threat model:* R-MED-6 (scope creep over time)
  - *Verification:* E2E test: complete the initial Drive connect flow and assert the access token has no `drive` (write) scope. Separate E2E test: trigger the fix-action flow and confirm a new consent screen for write scope appears. `pnpm test:e2e`.

- [ ] **OA-5.** Disconnecting an account calls the IDP revoke endpoint (`oauth2.googleapis.com/revoke` for Google, equivalent for Microsoft) **before** any local token deletion.
  - *Constitution:* §XIII — "Disconnecting an identity revokes its tokens at the IDP and wipes its account-scoped local state in one action"
  - *Security control:* C-OAUTH-5
  - *Verification:* E2E test with a mocked IDP: assert the revoke network call precedes any `chrome.storage.local` deletion of `tokens.${accountId}`. `pnpm test:e2e`.

---

## Kill-Switch Integrity

> Selector data only — no code, no CSP, no permissions. Ed25519 signed, ±24h freshness window, 4 KB max payload.

- [ ] **KS-1.** The Ed25519 verification public key for the kill-switch is a `const` in `src/security/kill-switch-keys.ts`. It is never fetched, derived, or configurable at runtime.
  - *Security control:* C-KS-1
  - *Threat model:* R-CRIT-3 (kill-switch JSON spoofed)
  - *Verification:* CI grep: any diff touching `src/security/kill-switch-keys.ts` outside a release-rotation PR triggers a reviewer alert (enforced via CODEOWNERS or branch-protection rule).

- [ ] **KS-2.** Kill-switch signature verification uses `@noble/ed25519` (audited implementation), not a browser-native Ed25519 API. Signatures with non-canonical encoding (malleable signatures) are rejected.
  - *Security control:* C-KS-2
  - *Verification:* Unit tests: known-vector signature passes; adversarial signatures (wrong key, non-canonical `S` value, bit-flipped) are rejected. `pnpm test:unit`.

- [ ] **KS-3.** Kill-switch payloads are rejected if any of the following: payload size > 4 KB; `signedAt` field is outside ±24h of local clock; any field beyond the approved selector string fields is present in the JSON.
  - *Security control:* C-KS-3
  - *Verification:* Unit tests assert rejection for each constraint independently. `pnpm test:unit`.

- [ ] **KS-4.** The kill-switch effect is strictly limited to mutating selector strings in `chrome.storage.local.gmailSelectors`. It cannot alter CSP, permissions, extension code, or any other storage key.
  - *Security control:* C-KS-4
  - *Verification:* Integration test: apply a kill-switch payload that contains a non-selector field (e.g., a fake `cspOverride` key) and assert (a) it is stripped before storage, (b) no CSP change is observed. `pnpm test:e2e`.

- [ ] **KS-5.** Every kill-switch application writes a local diagnostic log entry: event type, payload hash (not content), and timestamp — visible in Settings → Diagnostics.
  - *Security control:* C-KS-5
  - *Verification:* Unit test: apply a valid kill-switch payload and assert a diagnostic entry is written with the correct shape. `pnpm test:unit`.

---

## Inbound Content Trust

> Constitution §XV: parsing in offscreen, no auto-action, reputation lookups k-anonymized.

- [ ] **IN-1.** All inbound email and Drive content parsing is initiated from the offscreen document. No inbound scan function is callable directly from the popup or content script.
  - *Constitution:* §XV — "Inbound parsing happens in the offscreen document, not the popup or content script"
  - *Security control:* C-IN-1
  - *Verification:* Code review: trace the `inbound-scan` call path. Integration test confirms offscreen document is the execution site. `pnpm test:e2e`.

- [ ] **IN-2.** No protective response (phishing banner, redact suggestion, blocking overlay) is applied automatically to inbound content without the user explicitly opening the message or activating the feature. No background auto-action.
  - *Constitution:* §XV — "No automatic action; every protective response is user-initiated or user-pre-authorized"
  - *Security control:* C-IN-2
  - *Verification:* E2E test: receive a test email matching the phishing heuristics without opening it; assert no UI change in the extension popup or Gmail page. `pnpm test:e2e`.

- [ ] **IN-3.** The weekly sender-domain reputation list is Ed25519-signed by a separate key pair from the Gmail kill-switch. The payload is rejected if the signature is invalid or `signedAt` is outside ±7 days of local clock.
  - *Security control:* C-IN-3
  - *Verification:* Unit tests: known-vector payload passes; adversarial payloads (wrong key, stale `signedAt`, payload tampered) are rejected. `pnpm test:unit`.

- [ ] **IN-4.** *(v1.5+ when reputation lookups ship)* Sender-domain reputation lookups transmit only the first N characters of the SHA-256 hash of the sender domain — never the full email address, the full domain, or any user identifier.
  - *Constitution:* §I — "transmit only hashed/anonymized identifiers"
  - *Threat model:* FR-In4 k-anonymity discipline
  - *Verification:* Unit test asserts the reputation lookup function constructs a URL containing only a hash prefix, not the cleartext domain or email. `pnpm test:unit`. *(advisory until v1.5)*

---

## Billing Webhook Integrity *(M6+)*

> Stripe `Stripe-Signature` HMAC, RS256-signed entitlement JWTs, 30s TTL cache, replay-resistant webhook IDs.

- [ ] **BW-1.** The Cloudflare entitlement worker verifies `Stripe-Signature` HMAC-SHA-256 before mutating any entitlement state. Unsigned or tampered webhooks return `400` without side effects.
  - *Security control:* C-PAY-1
  - *Threat model:* R-HIGH-6 (Stripe webhook auth bypass → free users get Premium)
  - *Verification:* Unit test on the Worker: unsigned payload → `400`; validly signed payload → state updated. `pnpm test:unit` (worker). *(M6+)*

- [ ] **BW-2.** The entitlement worker issues JWTs signed RS256 with a 24-hour expiry. The extension verifies the JWT via a JWKS URL pinned in `src/security/entitlement-keys.ts` (never fetched at runtime).
  - *Security control:* C-PAY-2
  - *Verification:* Unit tests: known-vector JWT passes; adversarial (wrong key, expired `exp`, modified payload) rejected. `pnpm test:unit`. *(M6+)*

- [ ] **BW-3.** The cached entitlement in `chrome.storage.local` has a 30-second TTL. `TierGate.check()` triggers a refetch from the entitlement worker before the cache expires. A stale or missing cache entry is treated as Free tier, not the last known tier.
  - *Security control:* C-PAY-3
  - *Threat model:* R-MED-5 (SW loses tier-cache, over-allows)
  - *Verification:* Unit test: inject an expired cache entry, call `TierGate.check()`, assert a network refetch is triggered and the gate applies the freshly fetched tier. `pnpm test:unit`. *(M6+)*

- [ ] **BW-4.** Stripe webhook payload `id` is recorded in a deduplication store. A duplicate webhook (same `id`) is acknowledged `200` but produces no further entitlement state change.
  - *Security control:* C-PAY-4
  - *Verification:* Unit test: deliver the same webhook `id` twice; assert entitlement state mutated exactly once. `pnpm test:unit`. *(M6+)*

---

## Cross-cutting Constitution Checks

> These apply to every security-touching PR regardless of which layer is modified.

- [ ] **CC-1.** No scan content — file text, email body, matched values, recipient addresses, Drive file names, calendar event text — appears in any `fetch` payload, telemetry event, or log statement.
  - *Constitution:* §I — "No raw user data ever leaves the device"
  - *Threat model:* R-HIGH-7 (telemetry payload contains scan content)
  - *Verification:* Unit test: attempt to enqueue a telemetry event with a `content` or `matchedValue` field and assert the schema validator rejects it at enqueue time. `node scripts/check-egress-allowlist.mjs`. `pnpm test:unit`.

- [ ] **CC-2.** Every capacity-bounded action (scan, fix, rule creation, broker lookup) goes through `TierGate.check()`. No inline `if (tier === "free")` or equivalent string comparison exists in module code outside `src/core/tier-gate.ts`.
  - *Constitution:* §VI — "Tier checks go through a single `TierGate` abstraction. Changing what a tier includes requires changing one entitlement, never rewriting modules."
  - *Verification:* ESLint rule bans string-literal tier comparisons outside `src/core/tier-gate.ts`. `pnpm lint` — CI gate.

- [ ] **CC-3.** "Delete all my data" is reachable in ≤2 clicks from the main popup and performs a complete wipe: `chrome.storage.local` (all keys), all IndexedDB stores, cached tessdata, all optional permissions revoked, and OAuth tokens revoked at the IDP — even when individual steps fail (maximal cleanup).
  - *Constitution:* §II — "wipes every byte in one action; reachable in ≤2 clicks"
  - *Verification:* E2E test: invoke wipe via the Settings UI (2 clicks max), assert `chrome.storage.local` is empty, all IDB stores are empty, and the IDP revoke endpoint was called. Unit test: `wipeAll()` continues through all steps even when a prior step throws. `pnpm test:e2e && pnpm test:unit`.

- [ ] **CC-4.** If this PR introduces a new external host, new browser permission, new direct dependency, or new module that handles secrets/OAuth/scan content: `threat-model.md` is updated in the same PR.
  - *Constitution:* §XII — four specific triggers for threat-model updates
  - *Verification:* PR author self-certifies in the PR description: `threat-model updated: yes / N/A — <reason>`.

- [ ] **CC-5.** No hex color literal, hard-coded pixel value, or magic number appears in any new component CSS. All visual values come from `src/ui/tokens/` CSS custom properties.
  - *Constitution:* §XIV — "No hex literals in component CSS. ESLint rule `no-raw-color-tokens` enforces."
  - *Verification:* `pnpm lint` (ESLint `no-raw-color-tokens` + stylelint `no-magic-pixels`) — CI gate.

- [ ] **CC-6.** No banned UI term appears in any new user-facing string: DLP, regex, PII, classifier, entropy, OAuth scope, HIPAA, GDPR, PCI, PIPEDA, APPI, PIPA.
  - *Constitution:* §IV — "UI strings contain zero security jargon"
  - *Verification:* `node scripts/lint-copy.mjs` — CI gate.

- [ ] **CC-7.** Source maps are present in the built `dist/` for all security-sensitive paths: detection engine, storage, crypto. No minification or identifier mangling is applied to these paths.
  - *Constitution:* §II — "No obfuscation or minification of security-sensitive code paths. Source maps shipped."
  - *Verification:* `pnpm build && ls dist/assets/*.map` — assert source maps are present. Vite config `sourcemap: true` for security-sensitive chunks. `pnpm verify`.

---

## Threat Model Residual Risk Sign-off

> Reviewers complete this table for PRs that touch a CRIT or HIGH risk area. Authors do not sign off on their own risks.

| Risk ID | Risk area | Triggered by | Reviewer sign-off |
|---|---|---|---|
| **R-CRIT-1** | Supply chain | New or bumped dep | `[ ]` Dep reviewed, lockfile frozen, audit clean, license OK |
| **R-CRIT-2** | Memory hygiene | Crypto / secret handling | `[ ]` No module-level decrypted state; C-MEM-1..5 items checked |
| **R-CRIT-3** | Kill-switch spoof | Selectors host / kill-switch key | `[ ]` Ed25519 key is a `const`; payload constraints enforced |
| **R-CRIT-4** | OAuth XSS | Drive / identity path | `[ ]` PKCE only; typed validators before renderers; no `getAuthToken` |
| **R-CRIT-5** | Compose-content leak | Email Guardian content script | `[ ]` Send-only on Send; Trusted Types active; ISOLATED world |
| **R-HIGH-1** | Tesseract CSP regression | OCR path (v1.5+) | `[ ]` OCR worker loads under production CSP — CI unit test green |
| **R-HIGH-2** | Drive write misuse | Fix actions / write-scope upgrade | `[ ]` Per-file confirmation modal; batch ≤50; scope explicit consent |
| **R-HIGH-4** | FPR flood | Detector change | `[ ]` Corpus gate: FPR ≤2%, recall ≥95% — CI corpus test green |
| **R-HIGH-6** | Stripe webhook bypass | Billing (M6+) | `[ ]` HMAC verified; replay-resistance tested (BW-1, BW-4) |
| **R-HIGH-7** | Telemetry content leak | Telemetry schema | `[ ]` Schema validator rejects any non-allowlist field (CC-1) |
| **R-MED-4** | Weak random seed | Crypto init | `[ ]` `crypto.getRandomValues` only; `Math.random` banned in `src/` |
| **R-MED-5** | Tier-cache over-allows | TierGate | `[ ]` Cache TTL ≤30s; fail-closed on stale/missing cache (BW-3) |
| **R-MED-6** | OAuth scope creep | Drive scope upgrade | `[ ]` Write scope requires separate explicit user consent (OA-4) |

---

*Maintained by: engineering · Reviewed: quarterly or on any constitution amendment · Authority: constitution §XII*
