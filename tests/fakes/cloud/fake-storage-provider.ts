/**
 * T097 — FakeCloudStorageProvider test double.
 *
 * Implements the full CloudStorageProvider interface so Cloud Audit tests can
 * run without real Drive API calls.
 *
 * Supports:
 *   - Synthetic file corpus with known PII and known permissions
 *   - Deterministic pagination via _addFile() / _addFiles()
 *   - Simulated changes via _addChange()
 *   - Content injection per file via _setContent()
 *   - Scope upgrade simulation via _setUpgradeResult()
 *   - Permission change tracking via _appliedChanges()
 *   - Error injection via _setListError() / _setContentError()
 *
 * Usage:
 *
 *   const fake = new FakeCloudStorageProvider();
 *   fake._addFile({ id: "f1", name: "taxes.pdf", permissions: { isPublicLink: true, ... } });
 *   fake._setContent("f1", new TextEncoder().encode("SSN: 123-45-6789").buffer);
 *
 *   const files: StorageFileMeta[] = [];
 *   for await (const f of fake.listAllFiles()) files.push(f);
 *   expect(files).toHaveLength(1);
 */

import type {
  CloudStorageProvider,
  StorageFileMeta,
  StoragePermissions,
  StorageChange,
  StorageFileId,
  PermissionChange,
} from "~/cloud/storage-provider";

/* ── Helpers ─────────────────────────────────────────────────────── */

const DEFAULT_PERMISSIONS: StoragePermissions = {
  isPublicLink:          false,
  externalCollaborators: [],
  externalEditors:       [],
};

export function makeFileMeta(
  overrides: Partial<StorageFileMeta> & { id: string },
): StorageFileMeta {
  return {
    name:         "untitled",
    mimeType:     "application/octet-stream",
    modifiedAt:   new Date().toISOString(),
    ownerLabel:   "me",
    permissions:  { ...DEFAULT_PERMISSIONS },
    ...overrides,
  };
}

/** Convenience: make a public-link file with optional sensitive content. */
export function makePublicFile(
  id: string,
  name: string,
  overrides: Partial<StorageFileMeta> = {},
): StorageFileMeta {
  return makeFileMeta({
    id,
    name,
    permissions: {
      isPublicLink:          true,
      externalCollaborators: [],
      externalEditors:       [],
    },
    ...overrides,
  });
}

/* ── FakeCloudStorageProvider ────────────────────────────────────── */

export class FakeCloudStorageProvider implements CloudStorageProvider {
  readonly providerId: "google-drive" | "onedrive" | "dropbox" | "box";

  private _files:           Map<StorageFileId, StorageFileMeta> = new Map();
  private _contents:        Map<StorageFileId, ArrayBuffer>     = new Map();
  private _changes:         StorageChange[]                     = [];
  private _cursor:          string                              = "cursor-v1";
  private _upgradeResult:   boolean                             = true;
  private _appliedChanges_: Array<{ fileId: string; change: PermissionChange }> = [];
  private _listError:       unknown                             = undefined;
  private _contentError:    unknown                             = undefined;

  constructor(providerId: "google-drive" | "onedrive" | "dropbox" | "box" = "google-drive") {
    this.providerId = providerId;
  }

  // ── CloudStorageProvider ───────────────────────────────────────

  async *listAllFiles(
    opts?: { pageSize?: number; abortSignal?: AbortSignal },
  ): AsyncIterable<StorageFileMeta> {
    if (this._listError !== undefined) throw this._listError;
    const files = [...this._files.values()];
    const pageSize = opts?.pageSize ?? files.length;
    for (let i = 0; i < files.length; i++) {
      if (opts?.abortSignal?.aborted) return;
      yield files[i]!;
      // Simulate pagination yield point every pageSize items
      if (i > 0 && i % pageSize === 0) {
        await Promise.resolve();
      }
    }
  }

  async *changesSince(_cursor: string): AsyncIterable<StorageChange> {
    for (const change of this._changes) {
      yield change;
    }
  }

  async currentCursor(): Promise<string> {
    return this._cursor;
  }

  async getContent(fileId: StorageFileId, _mimeType?: string): Promise<ArrayBuffer> {
    if (this._contentError !== undefined) throw this._contentError;
    const existing = this._contents.get(fileId);
    if (existing) return existing;
    return new ArrayBuffer(0);
  }

  async upgradeToWriteScope(): Promise<boolean> {
    return this._upgradeResult;
  }

  async applyPermissionChange(
    fileId: StorageFileId,
    change: PermissionChange,
  ): Promise<void> {
    this._appliedChanges_.push({ fileId, change });
  }

  // ── Test helpers ───────────────────────────────────────────────

  /** Add a file to the synthetic corpus. */
  _addFile(meta: StorageFileMeta): void {
    this._files.set(meta.id, meta);
  }

  /** Add multiple files at once. */
  _addFiles(metas: StorageFileMeta[]): void {
    for (const m of metas) this._addFile(m);
  }

  /** Set the content returned by `getContent(fileId)`. */
  _setContent(fileId: StorageFileId, content: ArrayBuffer): void {
    this._contents.set(fileId, content);
  }

  /** Set text content returned by `getContent(fileId)`. */
  _setTextContent(fileId: StorageFileId, text: string): void {
    this._contents.set(fileId, new TextEncoder().encode(text).buffer as ArrayBuffer);
  }

  /** Queue a synthetic change for `changesSince()`. */
  _addChange(change: StorageChange): void {
    this._changes.push(change);
  }

  /** Control the cursor returned by `currentCursor()`. */
  _setCursor(cursor: string): void {
    this._cursor = cursor;
  }

  /** Control what `upgradeToWriteScope()` returns. */
  _setUpgradeResult(granted: boolean): void {
    this._upgradeResult = granted;
  }

  /** Make `listAllFiles()` throw the given error. */
  _setListError(err: unknown): void {
    this._listError = err;
  }

  /** Make `getContent()` throw the given error. */
  _setContentError(err: unknown): void {
    this._contentError = err;
  }

  /** Read permission changes applied via `applyPermissionChange()`. */
  _getAppliedChanges(): Array<{ fileId: string; change: PermissionChange }> {
    return [...this._appliedChanges_];
  }

  /** Collect all files yielded by listAllFiles() into an array. */
  async _collectAllFiles(): Promise<StorageFileMeta[]> {
    const result: StorageFileMeta[] = [];
    for await (const f of this.listAllFiles()) result.push(f);
    return result;
  }

  /** Clear all state between tests. */
  _reset(): void {
    this._files.clear();
    this._contents.clear();
    this._changes.length = 0;
    this._cursor         = "cursor-v1";
    this._upgradeResult  = true;
    this._appliedChanges_.length = 0;
    this._listError      = undefined;
    this._contentError   = undefined;
  }
}
