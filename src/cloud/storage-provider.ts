/**
 * CloudStorageProvider interface.
 *
 * Contract: specs/001-shieldme-mvp/contracts/storage-providers.md §2
 *
 * All provider implementations consume AccountManager for fresh access tokens.
 * They never store tokens themselves.
 */

export type StorageFileId = string;   // provider-namespaced, opaque

export type StorageFileMeta = {
  id:           StorageFileId;
  name:         string;
  mimeType:     string;
  sizeBytes?:   number;
  modifiedAt:   string;
  ownerLabel:   string;               // for "owned by you" UX
  webViewUrl?:  string;
  permissions:  StoragePermissions;
};

export type StoragePermissions = {
  isPublicLink:          boolean;       // anyone with link
  externalCollaborators: string[];      // emails outside the user's domain
  externalEditors:       string[];
  sharedAt?:             string;        // first share time, if known
};

export type StorageChange = {
  fileId: StorageFileId;
  kind:   "added" | "modified" | "removed" | "permissions-changed";
  meta?:  StorageFileMeta;
};

export type PermissionChange =
  | { kind: "remove-public-link" }
  | { kind: "remove-collaborator"; email: string }
  | { kind: "downgrade-to-view";  email: string };

export interface CloudStorageProvider {
  readonly providerId: "google-drive" | "onedrive" | "dropbox" | "box";

  /**
   * All files the user can audit.
   * AsyncIterable so pagination is streamed naturally.
   */
  listAllFiles(
    opts?: { pageSize?: number; abortSignal?: AbortSignal },
  ): AsyncIterable<StorageFileMeta>;

  /**
   * Incremental delta since `cursor`.
   * Caller persists the cursor between sessions.
   */
  changesSince(cursor: string): AsyncIterable<StorageChange>;

  /** Cursor for the next `changesSince` call. */
  currentCursor(): Promise<string>;

  /**
   * Download file content for client-side scanning.
   * Returns raw bytes; caller is responsible for parsing.
   */
  getContent(fileId: StorageFileId, mimeType?: string): Promise<ArrayBuffer>;

  /**
   * Upgrade scope to allow writes (Premium-only).
   * Returns `true` if the user granted the write scope, `false` if cancelled.
   */
  upgradeToWriteScope(): Promise<boolean>;

  /**
   * Premium-only: apply a permission change to a file.
   * Idempotent — calling twice with the same change is safe.
   */
  applyPermissionChange(
    fileId: StorageFileId,
    change: PermissionChange,
  ): Promise<void>;
}
