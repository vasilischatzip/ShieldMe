# Contract — Storage & Crypto

Maps the data model to concrete storage backends. Authoritative for:
- key names in `chrome.storage.local`
- object stores in IndexedDB
- encryption envelope for API keys
- migration runner signature
- "Delete all my data" exhaustive wipe list

See [data-model.md](../data-model.md) for the *shape* of each entity.

---

## 1. `chrome.storage.local` keys (flat, one JSON blob per entity)

| Key | Entity | Size budget | Read freq |
|---|---|---|---|
| `meta` | `{ wrappingKey, installId, firstRunAt, extensionVersion }` | <1 KB | always |
| `prefs` | `Prefs` | <2 KB | always |
| `rules` | `Rules` | <20 KB | always |
| `tier` | `TierStatus` | <1 KB | always |
| `usage` | `Usage` | <200 B | per scan |
| `keys` | `Keys` (encrypted) | <2 KB | radar only |
| `score` | `ExposureScore` | <1 KB | per dashboard |
| `driveMeta` | `DriveAuditMeta` | <1 KB | drive only |
| `brokers` | `BrokerProgress` | <10 KB | radar only |
| `gmailSelectors` | `GmailSelectorOverrides` | <5 KB | gmail only, rare |

**Total budget:** <50 KB; well under `chrome.storage.local` quota.

**Helper** (`src/core/storage.ts`):

```ts
export interface LocalStore {
  get<K extends LocalKey>(key: K): Promise<LocalEntities[K] | undefined>;
  set<K extends LocalKey>(key: K, value: LocalEntities[K]): Promise<void>;
  patch<K extends LocalKey>(key: K, patch: Partial<LocalEntities[K]>): Promise<void>;
  remove(key: LocalKey | LocalKey[]): Promise<void>;
  clear(): Promise<void>;
  onChange<K extends LocalKey>(key: K, fn: (next: LocalEntities[K]) => void): () => void;
}
```

Wraps `chrome.storage.local.*` and the `onChanged` event. No code outside this file calls `chrome.storage` directly.

## 2. IndexedDB (via `idb`)

Database: `shieldme`, version matches data-model version.

| Object store | Key path | Indices |
|---|---|---|
| `scanHistory` | `id` | `finishedAt`, `module` |
| `driveCache` | `fileId` | `modifiedTime`, `scannedAt` |
| `breachResults` | `id` | `type`, `expiresAt` |
| `telemetryQueue` | `id` | `type`, `occurredAt` |
| `tessdata` | `lang` | — |

**Helper** (`src/core/idb.ts`):

```ts
export interface Idb {
  open(): Promise<IDBPDatabase>;
  put<S extends StoreName>(store: S, value: StoreValue<S>): Promise<void>;
  get<S extends StoreName>(store: S, key: IDBValidKey): Promise<StoreValue<S> | undefined>;
  list<S extends StoreName>(store: S, range?: IDBKeyRange): Promise<StoreValue<S>[]>;
  delete<S extends StoreName>(store: S, key: IDBValidKey): Promise<void>;
  clear(store?: StoreName): Promise<void>; // clear all when undefined
}
```

## 3. Crypto Envelope

```ts
// src/core/crypto.ts
export interface Crypto {
  /** Generate & persist meta.wrappingKey if absent. Idempotent. */
  ensureWrappingKey(): Promise<void>;
  encryptString(plaintext: string): Promise<EncryptedBlob>;
  decryptString(blob: EncryptedBlob): Promise<string>;
  rotateWrappingKey(): Promise<void>;   // re-encrypts everything in keys
}

export type EncryptedBlob = {
  version: 1;
  iv: string;       // base64(12 bytes)
  ciphertext: string; // base64(AES-GCM-256)
};
```

**Algorithm:** AES-GCM-256, IV random per encrypt, key imported as `CryptoKey` (non-extractable) from the stored raw bytes.

**Threat model** (see research.md R6): Assumes profile-level isolation. Not a defense against malware with arbitrary browser access.

## 4. Migration Runner

```ts
// src/core/migrations.ts
export type Migration = {
  from: number;
  to: number;
  run(store: LocalStore, idb: Idb): Promise<void>;
};

export interface MigrationRunner {
  register(m: Migration): void;
  runAll(): Promise<{ from: number; to: number; appliedCount: number }>;
}
```

Runs at service-worker start. Fail-closed: on migration error, sets a flag that gates the UI into a recovery screen with "Reset ShieldMe" (nuclear wipe).

## 5. Delete-All-My-Data

```ts
// src/core/wipe.ts
export interface Wipe {
  /** Returns the list of actions taken — for the confirmation screen. */
  wipeAll(): Promise<WipeReport>;
}

export type WipeReport = {
  localStorageCleared: boolean;
  idbCleared: string[];       // store names
  permissionsRemoved: string[];
  oauthTokensRevoked: number;
  cachesCleared: number;
  durationMs: number;
};
```

Implementation checklist (order matters — revoke remote tokens before clearing local auth):
1. Enumerate & revoke any stored OAuth refresh tokens (`POST https://oauth2.googleapis.com/revoke`).
2. `chrome.identity.clearAllCachedAuthTokens()`.
3. `chrome.permissions.remove` for every optional permission.
4. `idb.clear()` — all stores including `tessdata`.
5. `caches.keys().forEach(caches.delete)`.
6. `localStore.clear()`.
7. Resolve with `WipeReport`; UI renders "Wiped. Reinstall free state? [Reload]".

## 6. Testability Requirements

- `LocalStore`, `Idb`, `Crypto`, `MigrationRunner`, `Wipe` each have a `Fake` implementation under `tests/fakes/` used by unit tests.
- Integration tests use a real `chrome.storage` shim from `sinon-chrome`.
- The wipe test asserts post-state: `localStore` empty, all known IDB stores empty, no stored permissions beyond the two required.
