# Contract — Cloud Storage Providers

**Status:** binding · **Updated:** 2026-05-09

Defines the seam between ShieldMe and any cloud storage backend the user audits. MVP ships with **Google Drive only**. Microsoft OneDrive ships in v1.5; Dropbox and Box are interface-ready but unscheduled; iCloud Drive is **explicitly out of scope** because Apple offers no public consumer API.

---

## 1. Provider matrix

| Provider | Status | OAuth | Listing API | Permission model | Notes |
|---|---|---|---|---|---|
| Google Drive | **MVP** | OAuth 2.0 + Drive scopes | `files.list` | Per-file ACL + "anyone with link" | Existing `DriveClient` becomes a `GoogleDriveProvider` |
| Microsoft OneDrive | **v1.5** | OIDC + Graph scopes | Graph `/me/drive/root/children` (recursive) | Per-item permissions + sharing links | Personal MSA + workplace tenants both supported |
| Dropbox | scaffold-only | OAuth 2.0 | `/2/files/list_folder` | Shared links + folder ACLs | Personal accounts only at v1; team accounts deferred |
| Box | scaffold-only | OAuth 2.0 | `/folders/0/items` | Permissions + collaborators | Consumer plans only |
| Apple iCloud Drive | **out of scope** | — | — | — | No public consumer API; not on roadmap |

## 2. CloudStorageProvider interface

```ts
// src/cloud/storage-provider.ts

export type StorageFileId = string;     // provider-namespaced

export type StorageFileMeta = {
  id: StorageFileId;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  modifiedAt: string;
  ownerLabel: string;                   // for "owned by you" UX
  webViewUrl?: string;
  permissions: StoragePermissions;
};

export type StoragePermissions = {
  isPublicLink: boolean;                // anyone with link
  externalCollaborators: string[];      // emails outside the user's domain (when domain known)
  externalEditors: string[];
  sharedAt?: string;                    // first share time, if known
};

export type StorageChange = {
  fileId: StorageFileId;
  kind: "added" | "modified" | "removed" | "permissions-changed";
  meta?: StorageFileMeta;
};

export type PermissionChange =
  | { kind: "remove-public-link" }
  | { kind: "remove-collaborator"; email: string }
  | { kind: "downgrade-to-view"; email: string };

export interface CloudStorageProvider {
  readonly providerId: "google-drive" | "onedrive" | "dropbox" | "box";

  /** All files the user can audit. AsyncIterable so we can stream pagination. */
  listAllFiles(opts?: { pageSize?: number; abortSignal?: AbortSignal }): AsyncIterable<StorageFileMeta>;

  /** Incremental delta since `cursor`. Caller persists the cursor. */
  changesSince(cursor: string): AsyncIterable<StorageChange>;

  /** Cursor for the next `changesSince` call. */
  currentCursor(): Promise<string>;

  /** Download file content for client-side scanning. Returns ArrayBuffer. */
  getContent(fileId: StorageFileId, mimeType?: string): Promise<ArrayBuffer>;

  /** Upgrade scope to allow writes (Premium-only). Returns whether the user granted. */
  upgradeToWriteScope(): Promise<boolean>;

  /** Premium-only: apply a permission change. Idempotent. */
  applyPermissionChange(fileId: StorageFileId, change: PermissionChange): Promise<void>;
}
```

**Per-provider implementations** consume `AccountManager` (from `identity-providers.md`) to get a fresh access token; they never store tokens themselves.

## 3. Egress allowlist additions

Gated by user opting into the corresponding provider:

| Host | Provider | Phase |
|---|---|---|
| `https://www.googleapis.com/drive/v3/*` | Google Drive | MVP |
| `https://graph.microsoft.com/v1.0/me/drive/*` | OneDrive | v1.5 |
| `https://graph.microsoft.com/v1.0/me/messages*` | Outlook (cross-listed in email-providers.md) | v1.5 |
| `https://api.dropboxapi.com/2/*`, `https://content.dropboxapi.com/2/*` | Dropbox | scaffold |
| `https://api.box.com/2.0/*`, `https://upload.box.com/api/2.0/*` | Box | scaffold |

## 4. Throttling & quota

Each provider implementation owns its quota model. Standard pattern: token-bucket configured per provider, retries on `429` honoring `Retry-After`, exponential backoff with jitter on `5xx` and provider-specific rate codes.

| Provider | Practical ceiling | Concurrent reads | Source |
|---|---|---|---|
| Google Drive | ~10 QPS | 5 | engineering-qa Q4 |
| OneDrive | 100 req/min consumer; 600 req/min M365 | 5 | Microsoft Graph throttling docs |
| Dropbox | 600 req/min | 5 | Dropbox API throttling docs |
| Box | varies by plan | 4 | Box API limits |

## 5. Cross-reference with detection engine

Permissions × content findings is the differentiator (PRD §6.3). The same cross-reference logic applies to every provider. Module 4 ("Drive Audit") is renamed in product copy to **"Cloud Audit"** when more than one provider is supported (post-v1.5); the implementation lives in `src/cloud/audit.ts` (renamed from `src/drive/audit.ts` at v1.5 transition).

## 6. Test contract

- Fakes per provider under `tests/fakes/cloud/`.
- Acceptance test seed: synthetic file corpus with known PII × known permissions.
- Egress test enforces that no provider's host is contacted unless that provider is connected.
