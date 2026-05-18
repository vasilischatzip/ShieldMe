# Data Model — ShieldMe MVP

All entities are **local to the user's browser**. No server-side schema. Storage split: see [research.md#R5](./research.md). Crypto: see [research.md#R6](./research.md).

Conventions: IDs are ULIDs unless noted. All timestamps are ISO-8601 UTC. `VERSION` field on every root entity enables forward migration.

---

## 1. Preferences (chrome.storage.local `prefs`)

```ts
type Prefs = {
  version: 1;
  locale: "en" | "el";
  theme: "system" | "light" | "dark";
  notifications: {
    documentCheck: boolean;
    emailGuardian: boolean;
    driveAudit: boolean;
    exposureRadar: boolean;
  };
  analyticsOptedIn: boolean;      // default false
  onboardingCompleted: boolean;
  onboardingStep: number;
  firstRunAt: string;
};
```

## 2. Protection Rules (chrome.storage.local `rules`)

```ts
type Rules = {
  version: 2;
  categories: Record<CategoryId, CategoryState>;
  customRules: CustomRule[];
  whitelists: {
    recipients: string[];           // emails
    domains: string[];              // e.g. "@mycompany.com"
  };
  activePresets: PresetId[];        // ordered by apply time; see docs/protection-presets.md
  presetLocale: LocaleTag;          // "gr" | "us" | "eu" | "global" | ...
  includeBetaDetectors: boolean;    // master switch for Tier-2 (non-Tier-1) detectors
  manualOverrides: {
    // Detector IDs the user toggled manually AFTER a preset applied.
    // Wins over preset reconciliation. Unapplying a preset never clears these.
    enabled: DetectorId[];
    disabled: DetectorId[];
  };
};

type CategoryId =
  | "my-money" | "my-identity" | "my-health"
  | "my-family" | "my-digital-life" | "my-location";

type CategoryState = {
  enabled: boolean;                 // master toggle
  detectors: Record<DetectorId, boolean>; // effective state (Advanced view)
};

type PresetId = string;             // e.g. "preset.residency.gr", "preset.work.developer"
type LocaleTag = string;            // ISO-3166-1 alpha-2 | "eu" | "global"

type CustomRule = {
  id: string;
  type: "keyword" | "pattern" | "combo";
  label: string;
  keyword?: string;                 // for keyword + combo
  pattern?: string;                 // regex source for pattern + combo
  createdAt: string;
  active: boolean;
};
```

**Migration v1 → v2** (applied by `src/core/migrations.ts`):
- Set `activePresets` to `["preset.default.global"]` if the user had no custom toggles; else `[]` (they picked per-detector — respect it).
- Infer `presetLocale` from `Prefs.locale`: `"en"→"global"`, `"el"→"gr"`.
- Set `includeBetaDetectors` to `false`.
- Set `manualOverrides` to `{enabled: [], disabled: []}`; any per-detector state that differs from default baseline gets re-expressed as an override.

## 2a. Preset Snapshot (chrome.storage.local `presetSnapshot`)

Reverse index used by `PresetResolver.unapply()` to know which detectors were enabled uniquely by which preset (for correct refcount-based removal).

```ts
type PresetSnapshot = {
  version: 1;
  // For each active preset, the set of detector IDs it directly enabled
  // at apply-time (before manual-override reconciliation).
  byPreset: Record<PresetId, DetectorId[]>;
  // Reverse map — who-enables-who — kept in sync for O(1) refcount.
  detectorRefCount: Record<DetectorId, PresetId[]>;
};
```

Invariant: `byPreset[p].includes(d) ⇔ detectorRefCount[d].includes(p)`.
Rebuilt from `activePresets[]` on migration or wipe; not user-editable.

## 3. Tier Status (chrome.storage.local `tier`)

Migration v1→v2 (applied 2026-05-09, revised 2026-05-12): existing `"premium"` maps to `"pro"`; new entitlement keys default to false. The `pro-family` tier proposed 2026-05-09 was removed 2026-05-12; no migration path for it exists in shipped data (the proposal never reached production).

```ts
type Tier = "free" | "basic" | "pro" | "preview";

type TierStatus = {
  version: 2;
  tier: Tier;
  source: "default" | "stripe" | "preview";
  since: string;
  stripeCustomerId?: string;
  entitlements: {
    // Document Check
    scansPerMonth: number;            // -1 = unlimited
    maxFileSizeBytes: number;
    ocrEnabled: boolean;              // false for free until OCR ships in v1.5

    // Email Guardian
    whitelistMax: number;             // -1 = unlimited
    emailInboundScan: boolean;

    // Cloud Audit
    cloudAuditMaxFiles: number;       // -1 = unlimited
    cloudFixActionsPerMonth: number;  // -1 = unlimited
    shareInterception: boolean;
    shareWatermark: boolean;
    continuousReaudit: "off" | "weekly" | "daily" | "hourly";

    // Calendar Audit
    calendarAudit: boolean;
    calendarRedact: boolean;
    calendarFrequency: "off" | "weekly" | "daily";

    // Exposure Radar
    deleteMeBridge: boolean;
    brokerCatalogSize: number;        // 20 free/basic, 50+ pro

    // Privacy Toolkit
    dataExportGenerator: boolean;
    dataExportTracking: boolean;      // pro only
    extensionAudit: boolean;
    takeoutReview: boolean;
    subscriptionAudit: boolean;
    subscriptionAuditWindowDays: number; // 0 = disabled, 30 basic, 365 pro

    // Travel Mode
    travelMode: boolean;

    // Custom rules
    customRulesMax: number;

    // Multi-account — the headline Pro differentiator
    accountsMax: number;              // 1 free/basic, -1 (unlimited) pro

    // Reports
    exportFullReports: boolean;
    scheduledReports: boolean;        // pro+

    // Priority
    priorityRuleRequests: boolean;
  };
};
```

**Free defaults:**
```ts
{
  scansPerMonth: 5, maxFileSizeBytes: 10_485_760, ocrEnabled: false,
  whitelistMax: 10, emailInboundScan: false,
  cloudAuditMaxFiles: 100, cloudFixActionsPerMonth: 0,
  shareInterception: false, shareWatermark: false, continuousReaudit: "off",
  calendarAudit: false, calendarRedact: false, calendarFrequency: "off",
  deleteMeBridge: false, brokerCatalogSize: 20,
  dataExportGenerator: false, dataExportTracking: false,
  extensionAudit: false, takeoutReview: false,
  subscriptionAudit: false, subscriptionAuditWindowDays: 0,
  travelMode: false,
  customRulesMax: 3, accountsMax: 1,
  exportFullReports: false, scheduledReports: false,
  priorityRuleRequests: false,
}
```

**Basic defaults:**
```ts
{
  scansPerMonth: 25, maxFileSizeBytes: 26_214_400, ocrEnabled: true,
  whitelistMax: 100, emailInboundScan: false,
  cloudAuditMaxFiles: 500, cloudFixActionsPerMonth: 1,
  shareInterception: true, shareWatermark: false, continuousReaudit: "weekly",
  calendarAudit: true, calendarRedact: false, calendarFrequency: "weekly",
  deleteMeBridge: false, brokerCatalogSize: 20,
  dataExportGenerator: true, dataExportTracking: false,
  extensionAudit: true, takeoutReview: true,
  subscriptionAudit: true, subscriptionAuditWindowDays: 30,
  travelMode: false,
  customRulesMax: 10, accountsMax: 1,
  exportFullReports: true, scheduledReports: false,
  priorityRuleRequests: false,
}
```

**Pro defaults:**
```ts
{
  scansPerMonth: -1, maxFileSizeBytes: 104_857_600, ocrEnabled: true,
  whitelistMax: -1, emailInboundScan: true,
  cloudAuditMaxFiles: -1, cloudFixActionsPerMonth: -1,
  shareInterception: true, shareWatermark: true, continuousReaudit: "daily",
  calendarAudit: true, calendarRedact: true, calendarFrequency: "daily",
  deleteMeBridge: true, brokerCatalogSize: 50,
  dataExportGenerator: true, dataExportTracking: true,
  extensionAudit: true, takeoutReview: true,
  subscriptionAudit: true, subscriptionAuditWindowDays: 365,
  travelMode: true,
  customRulesMax: -1, accountsMax: -1,
  exportFullReports: true, scheduledReports: true,
  priorityRuleRequests: true,
}
```

## 4. Usage Meter (chrome.storage.local `usage`)

```ts
type Usage = {
  version: 1;
  monthKey: string;                // "2026-04"
  scansThisMonth: number;
  lastScanAt?: string;
  resetAt: string;                 // first of next month
};
```

## 5. Encrypted API Keys (chrome.storage.local `keys`)

```ts
type EncryptedKey = {
  version: 1;
  provider: "hibp" | "deleteme";
  iv: string;                      // base64
  ciphertext: string;              // base64 (AES-GCM 256)
  addedAt: string;
};
type Keys = Record<EncryptedKey["provider"], EncryptedKey | null>;
```

Encryption key itself (wrapping key) stored under `meta.wrappingKey` as a random 32-byte value base64-encoded, generated at first write. Rotating the wrapping key rotates all stored provider keys.

## 6. Scan History (IndexedDB store `scanHistory`)

```ts
type ScanHistoryEntry = {
  id: string;                      // ULID
  module: "document-check" | "email-guardian";
  startedAt: string;
  finishedAt: string;
  filename?: string;
  fileSizeBytes?: number;
  fileType?: string;
  findingsSummary: {
    critical: number;
    warning: number;
    score: number;
  };
  detectorRunIds: string[];        // for deeper drill-down if we add it
};
```

Full finding details are **not** persisted — privacy-first. Summary only. Users re-scan if they need details again. "Delete all my data" also empties this store.

## 7. Drive Audit Cache (IndexedDB store `driveCache`)

```ts
type DriveFileCache = {
  fileId: string;
  modifiedTime: string;            // from Drive API
  name: string;
  mimeType: string;
  permissionsSummary: {
    isPublicLink: boolean;
    externalUsers: string[];       // emails outside user's domain
    externalWriters: string[];
    sharedTime: string;
  };
  contentFindings?: {
    critical: number;
    warning: number;
    categories: CategoryId[];
  };                               // only set if content was scanned
  scannedAt: string;
};
```

Indexed on `fileId` (primary) and `modifiedTime` for cache invalidation.

## 8. Drive Audit Meta (chrome.storage.local `driveMeta`)

```ts
type DriveAuditMeta = {
  version: 1;
  connected: boolean;
  emailAddress?: string;
  startPageToken?: string;         // for changes.list
  lastFullAudit?: string;
  lastIncrementalAudit?: string;
  writeScopeGranted: boolean;      // Premium-only upgrade state
  lastTotalFiles?: number;
  lastExposedFiles?: number;
};
```

## 9. Breach Check Results (IndexedDB store `breachResults`)

```ts
type BreachCheckResult = {
  id: string;
  type: "password" | "email";
  emailSalt?: string;              // never the email itself for expired entries
  checkedAt: string;
  breaches: Array<{
    name: string;
    date: string;
    dataClasses: string[];
  }>;
  expiresAt: string;               // TTL 30d; re-check after
};
```

## 10. Data Broker Progress (chrome.storage.local `brokers`)

```ts
type BrokerProgress = {
  version: 1;
  sites: Record<BrokerSiteId, BrokerEntryState>;
};
type BrokerSiteId = string; // e.g. "spokeo", "whitepages"
type BrokerEntryState = {
  status: "unchecked" | "requested" | "confirmed" | "failed";
  lastAction: string;
  notes?: string;                  // user-entered, e.g. ticket ID
};
```

Static broker metadata lives in `src/data/brokers.json` (code artifact, not state).

## 11. Exposure Score Snapshot (chrome.storage.local `score`)

```ts
type ExposureScore = {
  version: 1;
  value: number;                   // 0–100, cached
  computedAt: string;
  breakdown: {
    criticalFindings: number;
    warnings: number;
    publicDriveFiles: number;
    breachedEmails: number;
    uncheckedBrokers: number;
    bonuses: {
      allCategoriesEnabled: boolean;
      emailGuardianActive: boolean;
      driveAuditRecent: boolean;
      allBrokersChecked: boolean;
    };
  };
};
```

Recomputed on any finding-altering event (scan complete, audit complete, settings change).

## 12. Telemetry Queue (IndexedDB store `telemetryQueue`)

```ts
type TelemetryEvent = {
  id: string;
  type: "feature_used" | "scan_completed" | "tier_gate_hit" | "ocr_performance";
  payload: Record<string, string | number | boolean>; // schema per event
  occurredAt: string;
};
```

Flushed opportunistically when `Prefs.analyticsOptedIn === true`. Payloads contain **no** file names, no matched strings, no recipient emails, no Drive file IDs — only coarse buckets. Enforced by a schema validator at enqueue time.

## 12a. Accounts (chrome.storage.local `accounts`)

```ts
type AccountsState = {
  version: 1;
  accounts: Record<AccountId, Account>;
  activeByModule: Partial<Record<ModuleKey, AccountId>>;
};

type AccountId = string;
type ModuleKey = "drive" | "email" | "radar";
type ProviderId = "google" | "microsoft" | "apple";

type Account = {
  id: AccountId;
  provider: ProviderId;
  subject?: string;          // OIDC `sub` if captured
  label: string;             // email/UPN; display only
  namespace: string;         // `acc.${id}` — prefix for scoped storage
  addedAt: string;
  lastUsedAt: string;
  scopes: string[];
};
```

## 12b. Tokens per Account (chrome.storage.local `tokens.${accountId}`)

```ts
type AccountTokens = {
  version: 1;
  accessToken: EncryptedBlob;
  refreshToken: EncryptedBlob;
  idToken?: EncryptedBlob;          // OIDC; optional, kept only if needed for entitlement
  expiresAt: string;
  scopes: string[];
};
```

Encrypted with the wrapping key from `meta.wrappingKey`. See [`contracts/identity-providers.md`](./contracts/identity-providers.md) for the full identity contract.

## 12c. Per-account scoped state

When an account is connected, its module state lives under the account's namespace:

| Module | Per-account key (illustrative) |
|---|---|
| Drive Audit | `acc.${id}.driveMeta`, IDB store `driveCache` keyed by `[id, fileId]` |
| Email Guardian | `acc.${id}.gmailWhitelist`, `acc.${id}.gmailSelectors` |
| Exposure Radar | `acc.${id}.brokers`, `acc.${id}.breachResults` (IDB) |

Global state (Rules, Prefs, Tier, Score) is **not** per-account — protections apply to all accounts uniformly. This is an explicit product decision (the user configures their threat model once, applies it everywhere).

## 13. Gmail Selector Overrides (chrome.storage.local `gmailSelectors`)

```ts
type GmailSelectorOverrides = {
  version: 1;
  fetchedAt: string;
  signature: string;               // Ed25519 verified
  selectors: {
    composeDialog: string[];
    bodyEditable: string[];
    sendButton: string[];
    attachmentList: string[];
    recipientChips: string[];
  };
};
```

Populated from the Q1 kill-switch only on canary failure; signature verified.

---

## 14. Migration

Every entity has `version`. A migration runner (`src/core/migrations.ts`) runs at service-worker startup, compares stored version to code version, applies ordered migrations. Failed migrations show an error state with "Reset ShieldMe" (wipe) offered.

## 15. Delete All My Data — what actually gets wiped

- For every connected account: revoke tokens at the IDP (`oauth2.googleapis.com/revoke`, `login.microsoftonline.com/.../logout`, etc.), then delete `tokens.${accountId}`, `acc.${accountId}.*` keys, and IDB rows keyed by `accountId`.
- `chrome.storage.local` — all keys (including `accounts`, `rules`, `presetSnapshot`, `prefs`, `tier`, `usage`, `keys`, `brokers`, `score`, `driveMeta`, `gmailSelectors`)
- IndexedDB — all stores
- `caches.*` — any cached tessdata
- `chrome.permissions.remove` — all optional permissions
- `chrome.identity.clearAllCachedAuthTokens()`

The action is idempotent and concludes with a visible confirmation + the extension back to first-run state (preset picker shown).
