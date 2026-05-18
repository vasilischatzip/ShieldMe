# Contract — External Integration APIs

External services ShieldMe talks to, the **exact** egress allowlist, and the adapter interfaces that keep them swappable.

---

## 1. Egress Allowlist (authoritative)

Enforced at runtime by the service worker `fetch` wrapper *and* at build time by `scripts/check-egress-allowlist.mjs` scanning built JS for string-literal URLs.

| Host | Module | When | Auth |
|---|---|---|---|
| `https://api.pwnedpasswords.com` | Radar / Passwords | Always available | None (k-anonymity) |
| `https://haveibeenpwned.com/api/v3/*` | Radar / Emails | Only when user saves HIBP key | `hibp-api-key` header |
| `https://www.googleapis.com/drive/v3/*` | Drive Audit | Only when Drive connected | OAuth bearer |
| `https://accounts.google.com/*` | Drive Audit | OAuth flow | — |
| `https://oauth2.googleapis.com/revoke` | Wipe | On revoke | OAuth token param |
| `https://tessdata.projectnaptha.com/4.0.0/*` | OCR (non-English) | User opts into extra OCR lang | None |
| `https://{PLAUSIBLE_HOST}/api/event` | Telemetry | Only when analytics opted in | None |
| `https://{SELECTORS_HOST}/shieldme/gmail-selectors.json` | Gmail kill-switch | Only on canary failure | None (Ed25519-signed) |
| `https://api.stripe.com/*` | Billing | Tier upgrade | Stripe publishable key |
| `https://{ENTITLEMENT_HOST}/v1/entitlement` | Billing | After Stripe checkout | Short-lived JWT |
| `https://www.googleapis.com/calendar/v3/*` | Calendar Audit | When Calendar connected | OAuth bearer |
| `https://graph.microsoft.com/v1.0/me/calendar*` | Calendar Audit (Outlook) | When Microsoft Calendar connected | OAuth bearer |
| `https://graph.microsoft.com/v1.0/me/messages*` | Email Guardian Inbound (Outlook) | When Outlook inbound enabled | OAuth bearer |
| `https://{SENDER_REP_HOST}/v1/sender-domain.json` | Email Guardian Inbound | Weekly refresh of bundled list | None (Ed25519-signed) |

**Anything else** fetched by the extension = CI failure.

## 2. HIBP — Pwned Passwords (no key)

```ts
// src/radar/hibp-passwords.ts
export interface PwnedPasswords {
  /** Accepts plaintext only in memory; hashes before any network I/O. */
  check(plaintext: string): Promise<PwnedResult>;
}
export type PwnedResult =
  | { status: "clean" }
  | { status: "breached"; count: number };
```

**Flow:**
1. `sha1 = SHA1(plaintext)` in Web Crypto.
2. `prefix = sha1.slice(0, 5)`; `suffix = sha1.slice(5)`.
3. `GET https://api.pwnedpasswords.com/range/{prefix}` (text/plain; list of `suffix:count`).
4. Linear search for the user's suffix. Return `count` or `clean`.
5. Zero-out the plaintext buffer before resolving.

**Contract:** Never log, never persist, the plaintext or the full hash.

## 3. HIBP — Breached Account (user key)

```ts
// src/radar/hibp-emails.ts
export interface BreachedAccount {
  setKey(key: string): Promise<void>;   // persists encrypted
  clearKey(): Promise<void>;
  check(email: string, ownership: OwnershipProof): Promise<BreachList>;
}
export type OwnershipProof =
  | { kind: "chrome-profile" }          // email on signed-in Chrome profile
  | { kind: "code-verified"; tokenId: string };
export type BreachList = Array<{
  name: string; domain: string; breachDate: string; dataClasses: string[];
}>;
```

**Flow:**
1. Verify `OwnershipProof` (see §7 below) before calling HIBP.
2. `GET https://haveibeenpwned.com/api/v3/breachedaccount/{email}?truncateResponse=false` with header `hibp-api-key: {decryptedKey}` and `user-agent: ShieldMe-Extension`.
3. Parse; return. Key stays in memory only for the fetch.

## 4. Google Drive Client

```ts
// src/drive/client.ts
export interface DriveClient {
  connect(): Promise<{ emailAddress: string }>;
  disconnect(): Promise<void>;
  listAllFiles(opts?: { pageSize?: number }): AsyncIterable<DriveFileMeta>;
  changes(startPageToken: string): AsyncIterable<DriveChange>;
  getFileContent(fileId: string, mimeType: string): Promise<ArrayBuffer>;
  upgradeToWriteScope(): Promise<boolean>;  // returns granted
  setPermission(fileId: string, change: PermissionChange): Promise<void>;
}
```

`setPermission` is Premium-only and gated by `TierGate.check("drive-fix-actions")`.

**Throttling** (per Q4): token bucket, 8 req/s refill, 5 concurrent for content reads. Retries with jitter on `403 rateLimitExceeded` and `429`.

## 5. Broker Removal Provider (forward-compat for DeleteMe)

```ts
// src/radar/providers/broker-removal-provider.ts
export type BrokerSite = {
  id: string;
  name: string;
  optOutUrl: string;
  formDifficulty: "easy" | "medium" | "hard";
  automationSupported: boolean;
};

export type RemovalStatus =
  | { state: "unchecked" }
  | { state: "requested"; requestedAt: string; providerTicket?: string }
  | { state: "in-progress"; providerTicket: string }
  | { state: "confirmed"; confirmedAt: string }
  | { state: "failed"; reason: string };

export interface BrokerRemovalProvider {
  readonly kind: "manual" | "deleteme";
  listSites(): Promise<BrokerSite[]>;
  status(siteId: string): Promise<RemovalStatus>;
  requestRemoval(siteId: string): Promise<RemovalStatus>;
  sync?(): Promise<void>;  // pull latest status from external (DeleteMe only)
}
```

### 5a. ManualProvider (ships in MVP)

- Reads `src/data/brokers.json` (20+ sites).
- `status` / `requestRemoval` mutate `BrokerProgress` in `chrome.storage.local`.
- `sync` not implemented.
- Zero network calls.

### 5b. DeleteMeProvider (scaffold — Premium, M6+)

- `requestRemoval` → POST to DeleteMe partner API (stubbed; returns `{ state: "requested" }` today).
- `sync` → GET DeleteMe removal statuses, map to `RemovalStatus`.
- Adds DeleteMe host to egress allowlist **only** when this provider is active.
- Active provider selected by `TierGate` + user preference: Free = Manual. Premium = user choice (Manual | DeleteMe) with DeleteMe as default after connect.

```ts
// src/radar/providers/deleteme-provider.ts (stub shape — not wired in MVP)
export class DeleteMeProvider implements BrokerRemovalProvider {
  readonly kind = "deleteme" as const;
  constructor(private apiKey: EncryptedBlob) {}
  // methods throw NotYetAvailableError() in MVP
}
```

**Why interface-first:** Flipping from Manual → DeleteMe is one factory line in `src/radar/providers/factory.ts`. No call-site changes.

## 6. Tier Gate

```ts
// src/core/tier-gate.ts
export type Feature =
  // Document Check
  | "document-scan"
  | "file-size"
  | "ocr"
  // Email Guardian
  | "whitelists"
  | "email-inbound-scan"
  // Cloud Audit
  | "cloud-audit-files"
  | "cloud-fix-actions"
  | "share-interception"
  | "share-watermark"
  | "continuous-reaudit"
  // Calendar Audit
  | "calendar-audit"
  | "calendar-redact"
  // Exposure Radar
  | "deleteme-bridge"
  | "broker-catalog-extended"
  // Privacy Toolkit
  | "data-export-generator"
  | "data-export-tracking"
  | "extension-audit"
  | "takeout-review"
  | "subscription-audit"
  | "travel-mode"
  // Cross-cutting
  | "custom-rules"
  | "accounts-max"
  | "export-full-report"
  | "scheduled-reports"
  | "priority-rule-requests";

export type TierCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "monthly-quota" | "size-cap" | "count-cap" | "premium-only";
      current?: number;
      limit?: number;
      upsell: { headline: string; ctaLabel: string };
    };

export interface TierGate {
  status(): Promise<TierStatus>;
  check(feature: Feature, ctx?: { bytes?: number; count?: number }): Promise<TierCheckResult>;
  notePreviewEndDate(d: string): Promise<void>;
  setTier(t: TierStatus): Promise<void>;  // called by billing webhook worker
}
```

Every module calls `check` **before** a bounded action. The UI renders the upsell card from the returned `reason`/`upsell`.

## 7. Ownership Proof for Breach Email Check

```ts
// src/radar/ownership.ts
export interface OwnershipVerifier {
  chromeProfileEmails(): Promise<string[]>;
  requestCode(email: string): Promise<{ tokenId: string }>;
  confirmCode(tokenId: string, code: string): Promise<boolean>;
}
```

**No server** for MVP: the Chrome-profile path covers the common case (most users want to check their signed-in address). The code-verified path is stubbed behind `"Coming soon for non-profile addresses"` until we have a Cloudflare Worker for email sending.

## 8. Telemetry Client

```ts
// src/core/telemetry.ts
export interface Telemetry {
  track(event: TelemetryEvent): Promise<void>;    // buffered
  flush(): Promise<void>;
  purge(): Promise<void>;                         // wipe queue
}
```

No-op when `Prefs.analyticsOptedIn === false`. Never accepts fields outside the schema in `docs/analytics-schema.md`; a schema guard throws at enqueue time.

## 9. Billing (M6+)

```ts
// src/core/billing.ts
export interface BillingProvider {
  startCheckout(plan: "monthly" | "annual"): Promise<void>;  // opens Stripe Checkout in a new tab
  openPortal(): Promise<void>;
  currentTier(): Promise<TierStatus>;                        // delegates to entitlement host
}
```

Implementation in MVP: `PreviewBillingProvider` returns `"premium-preview"` for everyone. Real Stripe implementation slots in at M6 with no call-site change.
