# Threat Model — ShieldMe

**Status:** binding · **Updated:** 2026-05-09 · **Owners:** eng + product

Companion to [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`contracts/integration-apis.md`](./contracts/integration-apis.md). Constitution §XII (Threat Model & Supply Chain) requires this file to exist and to be updated whenever a new external surface, dependency, or scope is added.

---

## 1. Assets we protect

| Asset | Where it lives | Why it matters |
|---|---|---|
| Document/email/Drive content under scan | RAM only, during scan | If leaked, the user's secrets ship somewhere else. The product's whole promise. |
| Detected findings (matched values) | RAM only, never persisted | Same as above; a leak here = a database of breach-ready PII keyed by the user. |
| User's HIBP API key | `chrome.storage.local`, AES-GCM | Costs $3.50/mo to replace; signed with HIBP T&C the user agreed to. |
| Google OAuth refresh tokens (Drive) | `chrome.identity` Chromium-encrypted store | Account takeover vector. |
| Future ShieldMe identity (ask 4) | OIDC tokens, encrypted | Cross-device attribution risk if compromised. |
| Wrapping key (per install) | `chrome.storage.local` (`meta.wrappingKey`) | Compromise here decrypts every stored API key. |
| Stored preferences, rules, whitelists | `chrome.storage.local` | Reveals user's threat model to an attacker. |
| Scan history summary | IndexedDB | Reveals which documents the user scanned and when. |
| Tessdata blobs (post-OCR-v1.5) | IndexedDB | Not sensitive, but supply-chain target if served by us. |

## 2. Adversaries

| Adversary | Capability | Goal | Treat as |
|---|---|---|---|
| **A1 — Network observer** | Reads/MITM-attempts traffic between extension and HIBP/Drive/etc. | Correlate user identity to scan activity. | In-scope; mitigated by HTTPS + k-anonymity + OAuth |
| **A2 — Malicious extension on same profile** | Has `storage`, sometimes `<all_urls>`, runs in parallel | Read decrypted state, inject into Gmail tab | In-scope; partial mitigation |
| **A3 — Compromised dependency (supply chain)** | Code execution at install/build time | Exfiltrate scan content via egress, plant backdoor | In-scope; full mitigation aim |
| **A4 — Compromised ShieldMe-controlled host** (selectors, Plausible, future entitlement) | Serves malicious payload | Push bad selectors → Gmail content exfiltration; falsify entitlements | In-scope; mitigated by signing |
| **A5 — Phishing** of the user | Tricks user into installing fake "ShieldMe" or pasting their HIBP key elsewhere | Account takeover | Out-of-scope mitigation; in-scope user education |
| **A6 — Gmail/Google itself** | Has total control over the page | Could read compose contents directly via DOM | Trust boundary: Google. Not threat-modeled. |
| **A7 — User's local malware** | Arbitrary access to browser process | Total compromise | Out-of-scope; users are advised to use Chrome on a clean OS |
| **A8 — Web Store / Chrome itself** | Reviews, signs, distributes | Could replace our extension | Trust boundary: Google. Not threat-modeled. |
| **A9 — Insider** (project maintainer) | Can ship code | Could ship a backdoor | Mitigated by source-maps-shipped + Web Store review + Sigstore signing (M2) |
| **A10 — HIBP server-side observer** | Logs full prefix + remote IP | Re-identify user by cross-referencing leaked password DB | Documented; user-acceptable |

## 3. Risks (severity-rated)

Severity = (Likelihood) × (Impact). Each risk is owned and mitigated.

### 3.1 Critical

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-CRIT-1** | Supply-chain compromise of a bundled lib (typo-squat, hijacked maintainer, malicious release) | Medium-low (annual industry incidents) | Total scan-content exfil | (a) `pnpm install --frozen-lockfile` in CI; (b) `pnpm audit --prod` blocks on Critical; (c) Sigstore-sign release zips before Web Store upload (M2); (d) SBOM generated and committed per release; (e) review every dep upgrade > minor in PR (no auto-bump) |
| **R-CRIT-2** | Malicious extension on same profile reads decrypted secrets from memory | Low | API key + scan content theft | (a) Decrypted key never stored in a module-level variable, only passed through closures; (b) zero `console.log`/`tracelog` of objects of type `ApiKey` (CI grep); (c) buffer zero-fill after encryption helpers return; (d) document residual risk in privacy policy |
| **R-CRIT-3** | Kill-switch JSON spoofed if Ed25519 verification has a bypass | Low | Selector exfil → compose-content leak | (a) Ed25519 public key is a `const` in `src/security/kill-switch-keys.ts`, never fetched; (b) signature scheme is Ed25519 with strict RFC 8032 verification; (c) selectors JSON max-size 4 KB; (d) reject any payload missing `signedAt` within ±24h skew; (e) the kill-switch can ONLY mutate selector strings, never code paths |
| **R-CRIT-4** | OAuth refresh token theft via XSS in Drive content path | Low | Account takeover | (a) refresh tokens never enter our code — `chrome.identity` retains them; (b) all Drive responses parsed by typed validator before reaching renderers; (c) CSP `script-src 'self' 'wasm-unsafe-eval'`; (d) Drive client wrapped in trusted-types boundary |
| **R-CRIT-5** | Gmail content script reads compose content; an injected sibling script reads the same DOM before us | Medium | Compose-content leak | (a) Email Guardian operates only on user-initiated Send click; (b) we don't proactively read compose body except at Send time; (c) document residual risk: any extension with `mail.google.com` host permission can read the same DOM; this is a Chrome trust boundary |

### 3.2 High

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-HIGH-1** | Tesseract WASM CSP regression after v1.5 OCR ships | Medium | OCR breaks, no scan | Unit test that explicitly loads the OCR worker under production CSP and asserts success; canary in CI |
| **R-HIGH-2** | Drive write scope misuse — Premium fix-action mass-modifies user files | Low | Data loss | (a) every write action shows a per-file confirmation modal; (b) batch fix limited to 50 files; (c) write scope auto-revokes after 24h idle (chrome.identity scopes don't auto-revoke; we revoke manually on next load if no fix performed) |
| **R-HIGH-3** | HIBP k-anonymity prefix correlation | Low (requires both prefix log + leaked DB) | Re-identification | Documented; users informed in copy: "Only the first 5 chars of a SHA-1 hash leave your device" |
| **R-HIGH-4** | False-positive flood erodes trust → uninstalls | Medium | Product death | Constitution §VII: corpus gate FPR ≤2% in CI |
| **R-HIGH-5** | Web Store rejection on `identity` scope | Low | Drive Audit ships late | Engineering-qa Q6 mitigation; OAuth verification starts M3 |
| **R-HIGH-6** | Stripe webhook auth bypass at M6 | Medium | Free users get Premium | (a) webhook validates `Stripe-Signature` HMAC; (b) entitlement worker rejects unsigned payloads; (c) entitlement JWT signed by worker, validated client-side via JWKS |
| **R-HIGH-7** | Telemetry payload contains scan content (developer error) | Medium | Privacy-promise breach | Schema validator at enqueue-time rejects any field outside the allowlist; CI test ships a malformed payload and asserts rejection |
| **R-HIGH-8** | Detector regression silently raises FPR | Medium | False-positive flood | Corpus gate; CI fails on regression; thresholds per detector in `docs/detector-status.md` |

### 3.3 Medium

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-MED-1** | Migration runner fails mid-flight, leaves storage in inconsistent state | Low | User locked out, must wipe | Migration is transactional within IDB; on error, set `recoveryRequired` flag + UI; never partially commit |
| **R-MED-2** | OCR (post-v1.5) tessdata served from `tessdata.projectnaptha.com` is replaced by attacker | Low | OCR-derived findings tampered | Pin sha256 of every traineddata binary; verify on download; block on mismatch |
| **R-MED-3** | jsPDF report includes raw matched values via developer error | Medium | "Export Report" leaks PII to disk | Same dual-layer guarantee as Share Card: only structured `{score, criticalCount, warningCount, …}` reach the renderer; OCR-scan the rendered PDF in tests |
| **R-MED-4** | Per-install random seed predictable due to `Math.random()` | Low | Wrapping key derivable | Use `crypto.getRandomValues` only; CI grep bans `Math.random` outside `tests/` |
| **R-MED-5** | Session-bound service-worker context loses tier-cache and over-allows | Medium | Free user briefly bypasses limits | TierGate reads from `chrome.storage.local` on every check; cache TTL ≤30s |
| **R-MED-6** | OAuth scope creep over time (drive.metadata.readonly → drive.readonly → drive) | Medium | Permission creep concerns | Constitution §III; scope upgrade is a separate user prompt, never bundled |
| **R-MED-7** | EXIF GPS leak from the user's image when they share Score PNG | Low | Geolocation leak | Share PNG is generated from canvas, not from user input; never includes uploaded image |

### 3.4 Low (documented, accepted)

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-LOW-1** | Local Chromium debugger user reads decrypted state | Low | Data exposure | Out of mitigation scope; physical-access threat |
| **R-LOW-2** | Plausible self-hosted endpoint compromised, opt-in users' coarse events tracked | Low | Coarse event leak (no scan content) | Telemetry off by default; opt-in users informed |
| **R-LOW-3** | Detector pattern proven over-broad in field, post-launch | Medium | UX irritation | Community feedback loop; thumb-up/down per finding (with consent) |

## 4. Trust boundaries

```
┌─────────────────────────────────────────────────────────────┐
│  Chrome Browser Process (Google trust boundary)             │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │  ShieldMe Extension      │  │  Other extensions        │ │
│  │  (our code)              │  │  (untrusted siblings)    │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Web pages (mail.google.com, etc.)                   │   │
│  │  — content script runs here under page CSP           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                                  ↓ HTTPS only
┌─────────────────────────────────────────────────────────────┐
│  External services (each its own trust boundary):           │
│  HIBP · Google Drive API · Plausible · selectors host ·     │
│  Stripe · entitlement host · tessdata (post-v1.5)           │
└─────────────────────────────────────────────────────────────┘
```

## 5. Supply-chain controls (binding)

1. `pnpm install --frozen-lockfile` in CI; lockfile changes require PR review.
2. `pnpm audit --audit-level=high --prod` runs in CI; Critical fails the build, High requires explicit acknowledgement comment in the PR.
3. SBOM (`syft` or `cyclonedx-pnpm`) generated per release, committed to `releases/<version>/sbom.cdx.json`.
4. Release artifacts (the Chrome Web Store zip) signed with Sigstore (`cosign`) starting M2; signature published alongside the SBOM.
5. No dep auto-upgrade. Dependabot/Renovate runs in alert-only mode; humans approve every bump.
6. Dependency licenses checked in CI against an allowlist (Apache-2.0, MIT, BSD-2/3, ISC, MPL-2.0). GPL-family fails the build.
7. Every direct dependency >5,000 LoC must have a "why this dep" entry in `docs/deps-rationale.md`.
8. The egress allowlist contract (`contracts/integration-apis.md` §1) is the single source of truth; egress check verifies built JS against it.

## 6. Memory-hygiene controls

1. Decrypted secrets travel through closures, never module-level state.
2. CI grep bans `console.log`/`debug`/`trace`/`info` of values typed `ApiKey | EncryptedBlob | DecryptedKey`.
3. Web Crypto operations zero-fill input buffers after use where the API permits.
4. The Email Guardian content script reads compose body only at Send-click; never proactively.
5. Scan findings live in RAM for the duration of the report screen; cleared on route change.

## 7. Verification

| Control | Verification | Owner |
|---|---|---|
| Egress allowlist | `scripts/check-egress-allowlist.mjs` in CI | eng |
| CSP | `scripts/verify-csp.mjs` in CI | eng |
| Banned-terms (memory hygiene) | ESLint rule `no-secret-logging` | eng |
| Lockfile integrity | `pnpm install --frozen-lockfile` in CI | eng |
| SBOM generated | release workflow | eng |
| Sigstore signature | release workflow (M2+) | eng |
| Threat-model freshness | this file's `Updated:` date checked at every release; if >90 days old, blocker | product |

## 8. When to update this file

- Any new external host added to the egress allowlist.
- Any new permission requested.
- Any new dependency added to `package.json`.
- Any new module that handles secrets, OAuth, or scan content.
- Quarterly review for staleness regardless.
