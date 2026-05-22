/**
 * T099 — GoogleDriveProvider
 *
 * Implements CloudStorageProvider using the Google Drive REST API v3.
 *
 * Spec refs: FR-A1, FR-A5, FR-A6, NFR-P4
 *
 * Security controls:
 *   C-OAUTH-3 — never stores tokens; reads from AccountManager on every call
 *
 * Architecture:
 *   - All API calls go through the injected TokenBucket (rate limiting).
 *   - Access token is fetched via AccountManager.accessToken() on every call
 *     (short-lived; AccountManager caches & refreshes transparently).
 *   - deps.onUpgradeScope handles the write-scope consent flow; the caller
 *     wires this to GoogleIdentityProvider.upgradeScope() in production.
 */

import type { AccountManager } from "../core/identity/account-manager";
import type { AccountId } from "../core/identity/types";
import type {
  CloudStorageProvider,
  StorageFileMeta,
  StoragePermissions,
  StorageChange,
  StorageFileId,
  PermissionChange,
} from "./storage-provider";
import type { TokenBucket } from "./throttle";

/* ── Drive API base URL ──────────────────────────────────────────── */

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";

/* ── Types ───────────────────────────────────────────────────────── */

export type GoogleDriveProviderDeps = {
  /** Injectable fetch for all Drive API calls. */
  fetch: typeof globalThis.fetch;
  /**
   * Callback that triggers the OAuth write-scope consent flow.
   * Should return `true` if the user grants write access, `false` if cancelled.
   * Wired to GoogleIdentityProvider.upgradeScope() in production.
   */
  onUpgradeScope: () => Promise<boolean>;
};

/* ── Drive API response shapes ───────────────────────────────────── */

type DrivePermission = {
  id:            string;
  type:          "anyone" | "user" | "group" | "domain";
  role:          string;
  emailAddress?: string;
};

type DriveFileMeta = {
  id:           string;
  name:         string;
  mimeType:     string;
  size?:        string;
  modifiedTime: string;
  owners?:      Array<{ displayName: string; me?: boolean }>;
  webViewLink?: string;
  permissions?: DrivePermission[];
};

type DriveListResponse = {
  files:          DriveFileMeta[];
  nextPageToken?: string;
};

type DriveChange = {
  fileId:   string;
  removed?: boolean;
  file?:    DriveFileMeta;
};

type DriveChangesResponse = {
  changes:           DriveChange[];
  newStartPageToken?: string;
  nextPageToken?:    string;
};

type DriveStartPageTokenResponse = {
  startPageToken: string;
};

/* ── Fields to request in files.list ────────────────────────────── */

const FILE_FIELDS = [
  "id",
  "name",
  "mimeType",
  "size",
  "modifiedTime",
  "owners(displayName,me)",
  "webViewLink",
  "permissions(id,type,role,emailAddress,allowFileDiscovery)",
].join(",");

const LIST_FIELDS = `files(${FILE_FIELDS}),nextPageToken`;
const CHANGE_FIELDS = `changes(fileId,removed,file(${FILE_FIELDS})),newStartPageToken,nextPageToken`;

/* ── Google-Apps MIME types that require export ──────────────────── */

const GOOGLE_APPS_MIME: Record<string, string> = {
  "application/vnd.google-apps.document":     "text/plain",
  "application/vnd.google-apps.spreadsheet":  "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.drawing":      "image/png",
};

/* ── Permissions mapping ─────────────────────────────────────────── */

function mapPermissions(perms: DrivePermission[] | undefined): StoragePermissions {
  const result: StoragePermissions = {
    isPublicLink:          false,
    externalCollaborators: [],
    externalEditors:       [],
  };
  if (!perms) return result;

  for (const perm of perms) {
    if (perm.type === "anyone") {
      result.isPublicLink = true;
    } else if (perm.type === "user" && perm.emailAddress) {
      const email = perm.emailAddress;
      if (perm.role === "writer" || perm.role === "organizer" || perm.role === "fileOrganizer") {
        result.externalEditors.push(email);
      } else {
        result.externalCollaborators.push(email);
      }
    }
  }
  return result;
}

/* ── Drive file → StorageFileMeta ────────────────────────────────── */

function mapFile(f: DriveFileMeta): StorageFileMeta {
  const ownerLabel = f.owners?.find((o) => o.me)?.displayName
    ?? f.owners?.[0]?.displayName
    ?? "unknown";

  const meta: StorageFileMeta = {
    id:          f.id,
    name:        f.name,
    mimeType:    f.mimeType,
    modifiedAt:  f.modifiedTime,
    ownerLabel,
    permissions: mapPermissions(f.permissions),
  };
  if (f.size !== undefined) meta.sizeBytes = parseInt(f.size, 10);
  if (f.webViewLink !== undefined) meta.webViewUrl = f.webViewLink;
  return meta;
}

/* ── GoogleDriveProvider ─────────────────────────────────────────── */

export class GoogleDriveProvider implements CloudStorageProvider {
  readonly providerId = "google-drive" as const;

  private readonly _accountId: AccountId;
  private readonly _am:        AccountManager;
  private readonly _bucket:    TokenBucket;
  private readonly _deps:      GoogleDriveProviderDeps;

  constructor(
    accountId: AccountId,
    accountManager: AccountManager,
    bucket: TokenBucket,
    deps: GoogleDriveProviderDeps,
  ) {
    this._accountId = accountId;
    this._am        = accountManager;
    this._bucket    = bucket;
    this._deps      = deps;
  }

  // ── CloudStorageProvider ───────────────────────────────────────

  async *listAllFiles(
    opts?: { pageSize?: number; abortSignal?: AbortSignal },
  ): AsyncIterable<StorageFileMeta> {
    const pageSize = opts?.pageSize ?? 100;
    let pageToken: string | undefined;

    while (true) {
      if (opts?.abortSignal?.aborted) return;

      const token: string = await this._getToken();
      const params: URLSearchParams = new URLSearchParams({
        fields:   LIST_FIELDS,
        pageSize: String(pageSize),
      });
      if (pageToken) params.set("pageToken", pageToken);

      const url: string = `${DRIVE_BASE}/files?${params.toString()}`;

      const json: DriveListResponse = await this._bucket.run(async (): Promise<DriveListResponse> => {
        const resp = await this._deps.fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error(`Drive files.list failed: ${resp.status}`);
        return resp.json() as Promise<DriveListResponse>;
      });

      for (const f of json.files) {
        if (opts?.abortSignal?.aborted) return;
        yield mapFile(f);
      }

      if (json.nextPageToken === undefined) break;
      pageToken = json.nextPageToken;
    }
  }

  async *changesSince(cursor: string): AsyncIterable<StorageChange> {
    let pageToken: string | undefined = cursor;

    while (pageToken !== undefined) {
      const token: string = await this._getToken();
      const params: URLSearchParams = new URLSearchParams({
        pageToken,
        fields:    CHANGE_FIELDS,
        includeItemsFromAllDrives: "false",
        supportsAllDrives:         "false",
      });

      const url: string = `${DRIVE_BASE}/changes?${params.toString()}`;

      const json: DriveChangesResponse = await this._bucket.run(async (): Promise<DriveChangesResponse> => {
        const resp = await this._deps.fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error(`Drive changes.list failed: ${resp.status}`);
        return resp.json() as Promise<DriveChangesResponse>;
      });

      for (const change of json.changes) {
        if (change.removed) {
          yield { fileId: change.fileId, kind: "removed" };
        } else {
          const meta = change.file ? mapFile(change.file) : undefined;
          const result: StorageChange = { fileId: change.fileId, kind: "modified" };
          if (meta !== undefined) result.meta = meta;
          yield result;
        }
      }

      // `newStartPageToken` signals the last page — stop after yielding it
      if (json.newStartPageToken !== undefined) {
        pageToken = undefined;
      } else {
        pageToken = json.nextPageToken;
      }
    }
  }

  async currentCursor(): Promise<string> {
    const token = await this._getToken();
    const url   = `${DRIVE_BASE}/changes/startPageToken`;

    const json = await this._bucket.run(async () => {
      const resp = await this._deps.fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`Drive startPageToken failed: ${resp.status}`);
      return resp.json() as Promise<DriveStartPageTokenResponse>;
    });

    return json.startPageToken;
  }

  async getContent(fileId: StorageFileId, mimeType?: string): Promise<ArrayBuffer> {
    const token      = await this._getToken();
    const exportType = mimeType ? GOOGLE_APPS_MIME[mimeType] : undefined;

    let url: string;
    if (exportType) {
      url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportType)}`;
    } else {
      url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
    }

    return this._bucket.run(async () => {
      const resp = await this._deps.fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return new ArrayBuffer(0);
      return resp.arrayBuffer();
    });
  }

  async upgradeToWriteScope(): Promise<boolean> {
    return this._deps.onUpgradeScope();
  }

  async applyPermissionChange(
    fileId: StorageFileId,
    change: PermissionChange,
  ): Promise<void> {
    const token = await this._getToken();

    // Fetch the file's current permissions to resolve the permission ID.
    const file = await this._fetchFileMeta(fileId, token);
    const perms = file.permissions ?? [];

    if (change.kind === "remove-public-link") {
      const perm = perms.find((p) => p.type === "anyone");
      if (!perm) return;  // Already removed (idempotent)
      await this._deletePermission(fileId, perm.id, token);

    } else if (change.kind === "remove-collaborator") {
      const perm = perms.find(
        (p) => p.type === "user" && p.emailAddress === change.email,
      );
      if (!perm) return;
      await this._deletePermission(fileId, perm.id, token);

    } else if (change.kind === "downgrade-to-view") {
      const perm = perms.find(
        (p) => p.type === "user" && p.emailAddress === change.email,
      );
      if (!perm) return;
      await this._patchPermission(fileId, perm.id, "reader", token);
    }
  }

  // ── Private helpers ────────────────────────────────────────────

  private async _getToken(): Promise<string> {
    return this._am.accessToken(this._accountId, "drive.read");
  }

  private async _fetchFileMeta(fileId: StorageFileId, token: string): Promise<DriveFileMeta> {
    const url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent("id,name,permissions(id,type,role,emailAddress)")}`;
    return this._bucket.run(async () => {
      const resp = await this._deps.fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`Drive files.get failed: ${resp.status}`);
      return resp.json() as Promise<DriveFileMeta>;
    });
  }

  private async _deletePermission(
    fileId: string,
    permissionId: string,
    token: string,
  ): Promise<void> {
    const url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`;
    await this._bucket.run(async () => {
      await this._deps.fetch(url, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    });
  }

  private async _patchPermission(
    fileId:       string,
    permissionId: string,
    role:         string,
    token:        string,
  ): Promise<void> {
    const url = `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`;
    await this._bucket.run(async () => {
      await this._deps.fetch(url, {
        method:  "PATCH",
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
      });
    });
  }
}
