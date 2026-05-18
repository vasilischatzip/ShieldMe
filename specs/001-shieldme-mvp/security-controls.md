# Security Controls — Implementation Map

**Status:** binding · **Updated:** 2026-05-12 · **Constitution:** §XII Threat Model & Supply Chain, §XV Inbound Content Trust

This file pins concrete, verifiable controls to the risks in [`threat-model.md`](./threat-model.md). Every Critical and High risk has at least one control here with a test reference and an owner. CI verifies each control's invariants on every PR.

---

## 1. Defense-in-depth layers

```
┌────────────────────────────────────────────────────────────────────┐
│  L1 — Browser sandbox (Chrome trust boundary; not ours to control) │
├────────────────────────────────────────────────────────────────────┤
│  L2 — Extension CSP                                                │
│       script-src 'self' 'wasm-unsafe-eval'; object-src 'self';     │
│       style-src 'self' 'unsafe-inline'; img-src 'self' data:;      │
│       connect-src <egress-allowlist>; default-src 'none';          │
│       trusted-types shieldme; require-trusted-types-for 'script';  │
├────────────────────────────────────────────────────────────────────┤
│  L3 — Trusted Types in content scripts                             │
│       Every DOM injection goes through the `shieldme` policy.      │
│       Raw innerHTML assignment fails at runtime.                   │
├────────────────────────────────────────────────────────────────────┤
│  L4 — Process isolation                                            │
│       Popup ↔ Service Worker ↔ Offscreen ↔ Content Script          │
│       (each its own world; messages typed + validated).            │
├────────────────────────────────────────────────────────────────────┤
│  L5 — Memory hygiene                                               │
│       Decrypted secrets pass through closures; ESLint bans logs;   │
│       Web Crypto buffer zero-fill after every encrypt/decrypt.     │
├────────────────────────────────────────────────────────────────────┤
│  L6 — Per-account key derivation                                   │
│       Each account has its own derived key from the wrapping seed; │
│       compromising one account's namespace can't decrypt another.  │
├────────────────────────────────────────────────────────────────────┤
│  L7 — Anti-tamper seals                                            │
│       Every storage read verifies an HMAC seal against the install │
│       secret; tampered state → recovery screen, never silent.      │
└────────────────────────────────────────────────────────────────────┘
```

Each layer is independently verified. Bypassing one (e.g., a Trusted Types regression) doesn't expose user data; the next layer holds.

## 2. Risk → Control map

Each row maps a threat-model risk ID to one or more controls. Tests live where listed.

### 2.1 Supply chain (R-CRIT-1)

| Control | Spec | Owner | Test |
|---|---|---|---|
| **C-SUP-1** Frozen lockfile | `pnpm install --frozen-lockfile` in CI; PR review required for lockfile diffs | eng | `.github/workflows/ci.yml` step |
| **C-SUP-2** Audit gate | `pnpm audit --prod --audit-level=high`; Critical fails, High requires acknowledgement | eng | CI step |
| **C-SUP-3** License allowlist | Apache-2.0, MIT, BSD-2/3, ISC, MPL-2.0, OFL-1.1 only | eng | `scripts/check-licenses.mjs` |
| **C-SUP-4** SBOM per release | CycloneDX JSON, committed to `releases/<version>/sbom.cdx.json` | eng | release workflow |
| **C-SUP-5** Sigstore signing | `cosign sign-blob` on the Web Store zip from M2 onward | eng | release workflow |
| **C-SUP-6** Manual upgrade discipline | Dependabot in alert-only mode; humans approve every minor/major bump | eng | branch protection |
| **C-SUP-7** "Why this dep" inventory | Every direct dep >5,000 LoC has an entry in `docs/deps-rationale.md` | eng | `scripts/check-deps-rationale.mjs` |
| **C-SUP-8** Reproducible builds | Vite build is deterministic given identical inputs; CI builds the same `dist/` hash twice as a sanity check | eng | `scripts/check-reproducible.mjs` |
| **C-SUP-9** No `postinstall` scripts | `pnpm install --ignore-scripts` in CI; reviewed exceptions only | eng | CI step |

### 2.2 Memory hygiene (R-CRIT-2)

| Control | Spec | Owner | Test |
|---|---|---|---|
| **C-MEM-1** No module-level decrypted state | Decrypted keys travel through closures; `Crypto.decryptString` returns a `using`-disposable wrapper that zero-fills the buffer in its `[Symbol.dispose]` | eng | unit test asserts buffer is zero after dispose |
| **C-MEM-2** Banned logging of secrets | ESLint rule `no-secret-logging` rejects `console.*` of types `ApiKey | EncryptedBlob | DecryptedKey | RefreshToken | IdToken` | eng | lint step |
| **C-MEM-3** Secret-tagged types | Types `ApiKey`, `DecryptedKey`, etc. carry a phantom `__secret` brand; structurally equivalent but nominally distinct, makes accidental logging type-detectable | eng | `tests/unit/types/secret-brand.spec.ts` |
| **C-MEM-4** Crypto buffer zeroing | Web Crypto inputs/outputs zero-filled where the API permits; documented exceptions in `docs/engineering/crypto-zeroing.md` | eng | unit test |
| **C-MEM-5** Short-lived sessions | Decrypted access tokens live only for the duration of a single fetch; no caching | eng | integration test |

### 2.3 Kill-switch tamper (R-CRIT-3)

| Control | Spec | Owner | Test |
|---|---|---|---|
| **C-KS-1** Pinned Ed25519 public key | The verification public key is a `const` in `src/security/kill-switch-keys.ts`, never fetched | eng | CI grep blocks any code change to this file outside a release-rotation PR |
| **C-KS-2** Strict RFC 8032 verification | Use `@noble/ed25519` (audited) — not browser-native (some implementations had bypass bugs); reject signatures with non-canonical encoding | eng | known-vector tests + adversarial signature tests |
| **C-KS-3** Payload constraints | Max 4 KB; `signedAt` within ±24h skew; selector strings only (no script-like fields) | eng | unit test rejects oversize / stale / off-schema payloads |
| **C-KS-4** Limited scope of effect | Kill-switch can only mutate selector strings in `chrome.storage.local.gmailSelectors`; never code, never CSP, never permissions | eng | integration test |
| **C-KS-5** Audit trail | Every kill-switch apply logs a local event (event type, payload hash, timestamp); visible in Settings → Diagnostics | eng | unit test |

### 2.4 OAuth & identity (R-CRIT-4)

| Control | Spec | Owner | Test |
|---|---|---|---|
| **C-OAUTH-1** PKCE code flow only | `chrome.identity.launchWebAuthFlow` with code challenge + nonce; `chrome.identity.getAuthToken` is forbidden by lint rule | eng | grep CI check |
| **C-OAUTH-2** ID token client-side validation | JWKS verified via `@noble/...` libraries; nonce match enforced; `aud` matches our client ID; `exp` not expired | eng | known-vector tests + adversarial token tests |
| **C-OAUTH-3** Refresh-token isolation | Refresh tokens stored only encrypted with the *per-account derived key* (see C-KEY-1) | eng | unit test |
| **C-OAUTH-4** Scope upgrade is explicit | Drive/Calendar write-scope upgrade is a separate consent screen, never bundled with read-scope | eng | E2E test |
| **C-OAUTH-5** Revoke on disconnect | Every disconnect calls the IDP's revoke endpoint **before** wiping local tokens | eng | E2E test with mocked IDP |

### 2.5 Content-script isolation (R-CRIT-5)

| Control | Spec | Owner | Test |
|---|---|---|---|
| **C-CS-1** Trusted Types policy | Single `shieldme` policy in `src/security/trusted-types.ts`; all DOM mutations go through it; `innerHTML` direct assignment is a lint error | eng | E2E test attempts raw innerHTML and asserts CSP violation |
| **C-CS-2** Send-only on Send | Compose body read only at Send-click, never proactively (R-CRIT-5 residual) | eng | integration test |
| **C-CS-3** Same-world isolation | Content script runs in ISOLATED world (manifest declaration); no shared globals with page or other extensions | eng | manifest schema check |
| **C-CS-4** Postmessage validation | All `chrome.runtime.sendMessage` payloads typed + validated by `valibot` schemas before being processed | eng | unit test |
| **C-CS-5** Origin assertion | Content script asserts `location.hostname` matches the declared host before activating | eng | integration test |

### 2.6 Per-account encryption (new for multi-account)

| Control | Spec | Owner | Test |
|---|---|---|---|
| **C-KEY-1** Per-account derived key | Each `Account` has its own AES-GCM key derived via HKDF from the wrapping seed + the account's `id` (ULID) as `info`. Compromising one account's namespace doesn't decrypt another's. | eng | unit test verifies cross-account decrypt fails |
| **C-KEY-2** Wrapping seed rotation | `Crypto.rotateWrappingKey()` re-derives all account keys and re-encrypts; idempotent; testable | eng | integration test |
| **C-KEY-3** Key never extractable | All `CryptoKey` instances imported with `extractable: false` | eng | unit test |

### 2.7 Anti-tamper seals

| Control | Spec | Owner | Test |
|---|---|---|---|
| **C-SEAL-1** Storage HMAC | Every `LocalStore.set` writes `{value, hmac}` where `hmac = HMAC-SHA-256(installSecret, JSON(value))`. Every `LocalStore.get` verifies; mismatch → recovery screen, never silent | eng | unit test mutates raw storage and asserts recovery flow |
| **C-SEAL-2** Install secret | 32 random bytes from `crypto.getRandomValues`, generated at first run, stored under `meta.installSecret`, never logged, never sent | eng | unit test |
| **C-SEAL-3** Migration seal preservation | Migrations rewrite seals atomically; partial migration leaves a `recoveryRequired: true` flag | eng | unit test |

### 2.8 Network egress (R-HIGH-7, R-MED-2)

| Control | Spec | Owner | Test |
|---|---|---|---|
| **C-NET-1** Build-time allowlist scan | `scripts/check-egress-allowlist.mjs` greps built JS for any URL not in `contracts/integration-apis.md` §1 | eng | CI step |
| **C-NET-2** Runtime allowlist wrapper | `src/security/fetch.ts` wraps `fetch`; rejects any host not on the active allowlist (gates Plausible, tessdata, etc. by feature flag) | eng | unit test |
| **C-NET-3** SRI for any pinned remote resource | If a non-`'self'` resource is ever loaded, it must declare an SRI hash | eng | manifest + CSP check |
| **C-NET-4** Tessdata pinning (v1.5) | Every traineddata file pinned by SHA-256 before download; mismatch blocks | eng | unit test |

### 2.9 Inbound content (Constitution §XV)

| Control | Spec | Owner | Test |
|---|---|---|---|
| **C-IN-1** Offscreen parsing | Inbound email/Drive content parsed in the offscreen document, never in popup or content script | eng | integration test |
| **C-IN-2** No auto-action | Every protective response (warn, redact, block) requires user activation; no automatic remediation | eng | E2E test |
| **C-IN-3** Sender-domain reputation list signed | Weekly list refresh from `{SENDER_REP_HOST}/v1/sender-domain.json` Ed25519-signed by the same kill-switch key authority discipline (separate key) | eng | unit test |

### 2.10 Stripe webhook integrity (M6+)

| Control | Spec | Owner | Test |
|---|---|---|---|
| **C-PAY-1** Webhook signature | Entitlement worker (Cloudflare) verifies `Stripe-Signature` HMAC before any state mutation | eng | unit test on worker |
| **C-PAY-2** Entitlement JWT | Worker issues short-lived (24h) JWTs signed RS256; extension verifies via JWKS pinned in code | eng | known-vector test |
| **C-PAY-3** Tier-cache TTL | Cached entitlement in `chrome.storage.local` expires every 30 s; service worker refetches from the worker | eng | unit test |
| **C-PAY-4** Replay-resistance | Webhook payload `id` is recorded; duplicates ignored | eng | unit test on worker |

## 3. Cross-cutting security gates (CI)

| Gate | What it verifies | Blocks merge? |
|---|---|---|
| Typecheck | TS strict | Yes |
| Unit tests | All security-control unit tests in this file | Yes |
| Egress allowlist | C-NET-1 | Yes |
| CSP validator | L2 manifest CSP matches spec | Yes |
| License audit | C-SUP-3 | Yes |
| Lockfile integrity | C-SUP-1 | Yes |
| `pnpm audit` Critical | C-SUP-2 | Yes |
| `pnpm audit` High | C-SUP-2 | Acknowledgement required |
| Copy linter | banned-terms list | Yes |
| No-secret-logging lint | C-MEM-2 | Yes |
| No-raw-color-tokens lint | design discipline | Yes |
| Trusted Types violations in tests | C-CS-1 | Yes |
| Reproducible build | C-SUP-8 | Yes (release workflow) |
| SBOM generated | C-SUP-4 | Yes (release workflow) |
| Sigstore signature (M2+) | C-SUP-5 | Yes (release workflow) |

## 4. Security disclosure

A `security.txt` per RFC 9116 ships at the published privacy-policy host: `https://shieldme.app/.well-known/security.txt`. Includes:

- `Contact:` security@ email + GPG key fingerprint
- `Preferred-Languages: en`
- `Canonical:`
- `Policy:` link to coordinated disclosure policy
- `Acknowledgments:` link to a CHANGELOG.security.md
- 90-day disclosure timeline; 24h ack target

## 5. Threat-model maintenance hook

Every PR that adds or modifies:
- A network host (egress allowlist)
- A browser permission
- A direct dependency
- A module that handles secrets, tokens, or scan content

…must include an entry in `CHANGELOG.security.md` describing what changed and which controls cover the change. CI checks the entry exists; merge blocked otherwise.

## 6. What this file is NOT

- Not a substitute for the [`threat-model.md`](./threat-model.md) (which describes adversaries + risks).
- Not the constitution (which sets principles).
- Not a compliance document for regulators (privacy policy + Limited Use Disclosure cover that).

It is the **operational mapping** from the threat model to enforceable engineering invariants.
