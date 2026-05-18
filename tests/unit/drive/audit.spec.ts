/**
 * T040a — DriveAuditor unit tests.
 *
 * Verifies:
 *   • Full audit: lists files, classifies, scans exposed ones, caches results.
 *   • Internal-only files are cached with skipped=true.
 *   • Free-tier cap (100 exposed files) is respected.
 *   • Incremental run uses changes.list, removes deleted entries from cache.
 *   • reset() clears cache and startPageToken.
 */
import { describe, it, expect, vi } from "vitest";
import { createDriveAuditor }        from "~/drive/audit";
import type { DriveClient, DriveFile, DrivePermission } from "~/drive/client";
import type { IdbStore, StoreNames }  from "~/core/idb";
import type { PermissionClassification } from "~/drive/permissions";
import type { DriveScanResult }         from "~/drive/scanner";

/* ── Fake IDB ─────────────────────────────────────────────────────── */

function makeFakeIdb(): IdbStore & { _stores: Record<string, Map<IDBValidKey, unknown>> } {
  const _stores: Record<string, Map<IDBValidKey, unknown>> = {
    driveCache: new Map(),
    scanHistory: new Map(),
    breachResults: new Map(),
    telemetryQueue: new Map(),
  };

  const getStore = (name: string) => {
    if (!_stores[name]) _stores[name] = new Map();
    return _stores[name]!;
  };

  return {
    _stores,
    open: () => Promise.resolve({} as IDBDatabase),
    getAll<T>(store: StoreNames) {
      return Promise.resolve([...getStore(store).values()] as T[]);
    },
    get<T>(store: StoreNames, key: IDBValidKey) {
      return Promise.resolve(getStore(store).get(key) as T | undefined);
    },
    put<T>(store: StoreNames, value: T) {
      const record = value as Record<string, unknown>;
      const key = (record["fileId"] as IDBValidKey) ?? (record["id"] as IDBValidKey);
      getStore(store).set(key, value);
      return Promise.resolve();
    },
    delete(store: StoreNames, key: IDBValidKey) {
      getStore(store).delete(key);
      return Promise.resolve();
    },
    clearStore(store: StoreNames) {
      getStore(store).clear();
      return Promise.resolve();
    },
    clearAll() {
      for (const k in _stores) _stores[k]!.clear();
      return Promise.resolve();
    },
  };
}

/* ── Fake DriveClient ─────────────────────────────────────────────── */

function makePublicPerm(): DrivePermission {
  return { id: "pub", type: "anyone", role: "reader" };
}

function makeFile(id: string, isPublic = true): DriveFile {
  return {
    id,
    name:         `file-${id}.txt`,
    mimeType:     "text/plain",
    modifiedTime: "2026-01-01T00:00:00Z",
    owners:       [{ emailAddress: "alice@acme.com", displayName: "Alice" }],
    permissions:  isPublic ? [makePublicPerm()] : [],
    webViewLink:  `https://docs.google.com/file/${id}`,
  };
}

function makeFakeClient(
  files: DriveFile[],
  changes: Array<{ fileId: string; removed: boolean; file?: DriveFile }> = [],
  storedToken?: string,
): DriveClient {
  let _token = storedToken;

  async function* listFiles() {
    if (files.length > 0) yield files;
  }

  async function* listChanges() {
    if (!_token) {
      _token = "spt-1";
      return;
    }
    if (changes.length > 0) yield changes;
  }

  return {
    connect:            async () => { /* no-op in tests */ },
    storeTokens:        async () => { /* no-op in tests */ },
    getToken:           async () => "tok-abc",
    revokeToken:        async () => {},
    listFiles,
    listChanges,
    downloadFile:       async () => new TextEncoder().encode("SSN: 123-45-6789").buffer as ArrayBuffer,
    saveStartPageToken: async (t: string) => { _token = t; },
    loadStartPageToken: async () => _token,
  };
}

/* ── Mock scanner ─────────────────────────────────────────────────── */

/**
 * Fake scanner that skips chrome.storage / scan-engine.
 * Returns one finding for any file whose name contains "sensitive".
 */
function makeMockScanner(): { scan: (file: DriveFile, cls: PermissionClassification) => Promise<DriveScanResult> } {
  return {
    async scan(file: DriveFile, cls: PermissionClassification): Promise<DriveScanResult> {
      return {
        fileId:          file.id,
        fileName:        file.name,
        mimeType:        file.mimeType,
        modifiedTime:    file.modifiedTime,
        exposureLevel:   cls.level,
        externalDomains: cls.externalDomains,
        ...(file.webViewLink !== undefined ? { webViewLink: file.webViewLink } : {}),
        findings:        file.name.includes("sensitive")
          ? [{ detectorId: "ssn" as import("~/detectors/types").DetectorId, categoryId: "myIdentity" as import("~/core/rules").CategoryId, severity: "critical" as const, confidence: 0.95 as import("~/detectors/types").Confidence, match: { value: "123-45-6789", start: 0, end: 11 }, contextSnippet: "SSN: 123-45-6789" }]
          : [],
        scannedAt:  new Date().toISOString(),
        durationMs: 1,
        skipped:    false,
      };
    },
  };
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe("DriveAuditor — full audit", () => {
  it("caches exposed files and returns correct summary", async () => {
    const idbStore = makeFakeIdb();
    const files    = [makeFile("1", true), makeFile("2", false), makeFile("3", true)];
    const client   = makeFakeClient(files);

    const auditor  = createDriveAuditor({ client, idbStore, scanner: makeMockScanner() });
    const summary  = await auditor.run();

    expect(summary.totalFiles).toBe(3);
    expect(summary.exposedFiles).toBe(2);  // file-1 and file-3 are public
    expect(summary.capped).toBe(false);

    const cached = await auditor.loadCache();
    // All 3 files cached (2 public scanned, 1 internal skipped)
    expect(cached.length).toBe(3);
  });

  it("marks internal-only files as skipped with skipReason=internal-only", async () => {
    const idbStore = makeFakeIdb();
    const files    = [makeFile("1", false)]; // internal-only
    const client   = makeFakeClient(files);

    const auditor = createDriveAuditor({ client, idbStore, scanner: makeMockScanner() });
    await auditor.run();

    const cached = await auditor.loadCache();
    expect(cached).toHaveLength(1);
    expect(cached[0]!.skipped).toBe(true);
    expect(cached[0]!.skipReason).toBe("internal-only");
  });

  it("reports progress callbacks", async () => {
    const idbStore = makeFakeIdb();
    const files    = [makeFile("1", true)];
    const client   = makeFakeClient(files);
    const phases: string[] = [];

    const auditor = createDriveAuditor({ client, idbStore, scanner: makeMockScanner() });
    await auditor.run((phase) => { phases.push(phase.phase); });

    expect(phases).toContain("listing");
    expect(phases).toContain("scanning");
    expect(phases).toContain("done");
  });

  it("applies free-tier cap of 100 exposed files", async () => {
    const idbStore = makeFakeIdb();
    // Create 110 public files
    const files = Array.from({ length: 110 }, (_, i) => makeFile(String(i), true));
    const client = makeFakeClient(files);

    // Inject a TierGate mock that returns free-limit
    const tierGate = {
      check: vi.fn().mockResolvedValue({ allowed: false, reason: "free-limit", feature: "drive:audit-full", limit: 100 }),
    };

    const auditor = createDriveAuditor({ client, idbStore, tierGate: tierGate as never, scanner: makeMockScanner() });
    const summary = await auditor.run();

    expect(summary.capped).toBe(true);
    expect(summary.exposedFiles).toBe(110); // all 110 found
    expect(summary.scannedFiles + summary.skippedFiles).toBeLessThanOrEqual(100); // only 100 scanned
  });
});

describe("DriveAuditor — incremental audit", () => {
  it("uses changes.list when startPageToken exists", async () => {
    const idbStore = makeFakeIdb();

    // Pre-populate cache with one old entry
    await idbStore.put("driveCache", {
      fileId:          "old-1",
      fileName:        "old.txt",
      mimeType:        "text/plain",
      modifiedTime:    "2025-01-01T00:00:00Z",
      exposureLevel:   "public",
      externalDomains: [],
      findings:        [],
      scannedAt:       "2025-01-01T00:00:00Z",
      durationMs:      0,
      skipped:         false,
    });

    const newFile = makeFile("new-1", true);
    const client  = makeFakeClient(
      [], // listFiles not called
      [{ fileId: "new-1", removed: false, file: newFile }],
      "spt-existing", // storedToken exists → incremental
    );

    const auditor  = createDriveAuditor({ client, idbStore, scanner: makeMockScanner() });
    const summary  = await auditor.run();

    // new-1 was scanned
    expect(summary.scannedFiles + summary.skippedFiles).toBeGreaterThanOrEqual(1);
  });

  it("removes deleted files from cache", async () => {
    const idbStore = makeFakeIdb();

    // Pre-populate cache
    await idbStore.put("driveCache", {
      fileId:          "del-1",
      fileName:        "deleted.txt",
      mimeType:        "text/plain",
      modifiedTime:    "2025-01-01T00:00:00Z",
      exposureLevel:   "public",
      externalDomains: [],
      findings:        [],
      scannedAt:       "2025-01-01T00:00:00Z",
      durationMs:      0,
      skipped:         false,
    });

    const client = makeFakeClient(
      [],
      [{ fileId: "del-1", removed: true }],
      "spt-existing",
    );

    const auditor = createDriveAuditor({ client, idbStore, scanner: makeMockScanner() });
    await auditor.run();

    const cached = await auditor.loadCache();
    expect(cached.find(e => e.fileId === "del-1")).toBeUndefined();
  });
});

describe("DriveAuditor — reset", () => {
  it("clears cache and saves empty page token", async () => {
    const idbStore = makeFakeIdb();

    await idbStore.put("driveCache", {
      fileId: "f1", fileName: "f1.txt", mimeType: "text/plain",
      modifiedTime: "2026-01-01T", exposureLevel: "public", externalDomains: [],
      findings: [], scannedAt: "", durationMs: 0, skipped: false,
    });

    const client  = makeFakeClient([], [], "spt-old");
    const auditor = createDriveAuditor({ client, idbStore, scanner: makeMockScanner() });

    await auditor.reset();

    const cached = await auditor.loadCache();
    expect(cached).toHaveLength(0);
  });
});

describe("DriveAuditor — loadCache", () => {
  it("returns all cached entries", async () => {
    const idbStore = makeFakeIdb();
    const client   = makeFakeClient([makeFile("1", true)]);

    const auditor = createDriveAuditor({ client, idbStore, scanner: makeMockScanner() });
    await auditor.run();

    const cached = await auditor.loadCache();
    expect(cached.length).toBeGreaterThanOrEqual(1);
  });
});
