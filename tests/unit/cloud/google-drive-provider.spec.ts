/**
 * T098 — Failing tests for GoogleDriveProvider.
 *
 * Covers:
 *   FR-A1  — list all files the user can audit (AsyncIterable, paginated)
 *   FR-A5  — incremental change detection via Drive Changes API
 *   FR-A6  — apply permission changes to specific files (Premium)
 *   NFR-P4 — throttled via token-bucket; auth header injected from AccountManager
 *
 * Design:
 *   GoogleDriveProvider(accountId, accountManager, bucket, deps)
 *   deps.fetch      — injectable for all Drive API calls
 *   deps.onUpgradeScope — injectable callback for triggering the OAuth write-scope flow
 *
 *   Tests use FakeAccountManager to avoid real PKCE flows.
 *   Token bucket is configured with huge limits so throttling never blocks tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GoogleDriveProvider,
  type GoogleDriveProviderDeps,
} from "~/cloud/google-drive-provider";
import { TokenBucket } from "~/cloud/throttle";
import { FakeAccountManager } from "../../fakes/identity/fake-account-manager";
import type { StorageFileMeta, StorageChange } from "~/cloud/storage-provider";

/* ── Config ──────────────────────────────────────────────────────── */

const ACCOUNT_ID   = "01DRIVE000000000000000001";
const ACCESS_TOKEN = "ya29.fake-drive-token";

/* ── Drive API response builders ─────────────────────────────────── */

type DrivePermission = {
  id:             string;
  type:           "anyone" | "user" | "group" | "domain";
  role:           "owner" | "organizer" | "fileOrganizer" | "writer" | "commenter" | "reader";
  emailAddress?:  string;
  allowFileDiscovery?: boolean;
};

type DriveFile = {
  id:           string;
  name:         string;
  mimeType:     string;
  size?:        string;
  modifiedTime: string;
  owners?:      Array<{ displayName: string; me?: boolean }>;
  webViewLink?: string;
  permissions?: DrivePermission[];
};

function makeDriveFile(overrides: Partial<DriveFile> & { id: string }): DriveFile {
  return {
    name:         "Document.pdf",
    mimeType:     "application/pdf",
    size:         "4096",
    modifiedTime: "2024-06-01T12:00:00.000Z",
    owners:       [{ displayName: "Alice", me: true }],
    webViewLink:  `https://drive.google.com/file/d/${overrides.id}/view`,
    permissions:  [],
    ...overrides,
  };
}

function makeListResponse(
  files: DriveFile[],
  nextPageToken?: string,
): Record<string, unknown> {
  const resp: Record<string, unknown> = { files };
  if (nextPageToken !== undefined) resp.nextPageToken = nextPageToken;
  return resp;
}

function makeChangesResponse(
  changes: Array<{
    fileId: string;
    removed?: boolean;
    file?: DriveFile;
  }>,
  newStartPageToken?: string,
): Record<string, unknown> {
  const resp: Record<string, unknown> = { changes };
  if (newStartPageToken !== undefined) resp.newStartPageToken = newStartPageToken;
  return resp;
}

/* ── Fetch mock builder ───────────────────────────────────────────── */

/**
 * Build a fake fetch that matches URL fragments to JSON bodies.
 * Patterns are checked in insertion order; first match wins.
 */
function makeFetch(
  routes: Array<{ match: string | RegExp; body: unknown; status?: number; method?: string }>,
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url    = input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    for (const route of routes) {
      if (route.method && route.method.toUpperCase() !== method) continue;
      const matched =
        typeof route.match === "string"
          ? url.includes(route.match)
          : route.match.test(url);
      if (!matched) continue;

      const status = route.status ?? 200;
      if (route.body instanceof ArrayBuffer || route.body instanceof Uint8Array) {
        return new Response(route.body as ArrayBuffer, { status });
      }
      return new Response(JSON.stringify(route.body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  }) as unknown as typeof fetch;
}

/* ── Provider factory ────────────────────────────────────────────── */

function makeProvider(
  accountManager: FakeAccountManager,
  fetchMock: typeof fetch,
  opts: { onUpgradeScope?: () => Promise<boolean> } = {},
): GoogleDriveProvider {
  const bucket = new TokenBucket({
    refillRate:    1000,   // effectively unlimited for unit tests
    maxConcurrent: 100,
    burstCapacity: 10_000,
  });
  const deps: GoogleDriveProviderDeps = {
    fetch:          fetchMock,
    onUpgradeScope: opts.onUpgradeScope ?? (async () => false),
  };
  return new GoogleDriveProvider(ACCOUNT_ID, accountManager, bucket, deps);
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe("GoogleDriveProvider", () => {
  let am: FakeAccountManager;

  beforeEach(() => {
    am = new FakeAccountManager();
    am._setAccessToken(ACCOUNT_ID, ACCESS_TOKEN);
  });

  // ── Provider ID ────────────────────────────────────────────────

  it("has providerId === 'google-drive'", () => {
    const provider = makeProvider(am, makeFetch([]));
    expect(provider.providerId).toBe("google-drive");
  });

  // ── listAllFiles ────────────────────────────────────────────────

  describe("listAllFiles()", () => {
    it("yields one StorageFileMeta per Drive file", async () => {
      const file = makeDriveFile({ id: "f1", name: "report.pdf" });
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/files", body: makeListResponse([file]) },
      ]));

      const files: StorageFileMeta[] = [];
      for await (const f of provider.listAllFiles()) files.push(f);

      expect(files).toHaveLength(1);
      expect(files[0]!.id).toBe("f1");
      expect(files[0]!.name).toBe("report.pdf");
      expect(files[0]!.mimeType).toBe("application/pdf");
    });

    it("preserves modifiedAt from Drive modifiedTime", async () => {
      const file = makeDriveFile({ id: "f1", modifiedTime: "2024-03-15T09:00:00.000Z" });
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/files", body: makeListResponse([file]) },
      ]));

      const files: StorageFileMeta[] = [];
      for await (const f of provider.listAllFiles()) files.push(f);

      expect(files[0]!.modifiedAt).toBe("2024-03-15T09:00:00.000Z");
    });

    it("follows nextPageToken across multiple pages", async () => {
      let callCount = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        callCount++;
        const url = input.toString();
        const hasPageToken = url.includes("pageToken=page2");
        const body = hasPageToken
          ? makeListResponse([makeDriveFile({ id: "f2" })])
          : makeListResponse([makeDriveFile({ id: "f1" })], "page2");
        return new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;

      const provider = makeProvider(am, fetchMock);
      const files: StorageFileMeta[] = [];
      for await (const f of provider.listAllFiles()) files.push(f);

      expect(files).toHaveLength(2);
      expect(files[0]!.id).toBe("f1");
      expect(files[1]!.id).toBe("f2");
      expect(callCount).toBe(2);
    });

    it("maps 'anyone' permission to isPublicLink = true", async () => {
      const file = makeDriveFile({
        id: "f1",
        permissions: [{ id: "anyoneWithLink", type: "anyone", role: "reader" }],
      });
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/files", body: makeListResponse([file]) },
      ]));

      const files: StorageFileMeta[] = [];
      for await (const f of provider.listAllFiles()) files.push(f);

      expect(files[0]!.permissions.isPublicLink).toBe(true);
    });

    it("leaves isPublicLink = false when no 'anyone' permission exists", async () => {
      const file = makeDriveFile({
        id: "f1",
        permissions: [],
      });
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/files", body: makeListResponse([file]) },
      ]));

      const files: StorageFileMeta[] = [];
      for await (const f of provider.listAllFiles()) files.push(f);

      expect(files[0]!.permissions.isPublicLink).toBe(false);
    });

    it("maps external 'user' writer to externalEditors", async () => {
      const file = makeDriveFile({
        id: "f1",
        permissions: [
          { id: "p1", type: "user", emailAddress: "editor@other.com", role: "writer" },
        ],
      });
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/files", body: makeListResponse([file]) },
      ]));

      const files: StorageFileMeta[] = [];
      for await (const f of provider.listAllFiles()) files.push(f);

      expect(files[0]!.permissions.externalEditors).toContain("editor@other.com");
      expect(files[0]!.permissions.externalCollaborators).not.toContain("editor@other.com");
    });

    it("maps external 'user' reader to externalCollaborators", async () => {
      const file = makeDriveFile({
        id: "f1",
        permissions: [
          { id: "p2", type: "user", emailAddress: "viewer@other.com", role: "reader" },
        ],
      });
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/files", body: makeListResponse([file]) },
      ]));

      const files: StorageFileMeta[] = [];
      for await (const f of provider.listAllFiles()) files.push(f);

      expect(files[0]!.permissions.externalCollaborators).toContain("viewer@other.com");
    });

    it("sends Bearer Authorization header with access token", async () => {
      const seenAuth: string[] = [];
      const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        seenAuth.push(headers["Authorization"] ?? "");
        return new Response(JSON.stringify(makeListResponse([])), {
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;

      const provider = makeProvider(am, fetchMock);
      const drained: StorageFileMeta[] = [];
      for await (const f of provider.listAllFiles()) drained.push(f);
      void drained;  // only care about the auth header, not the files

      expect(seenAuth[0]).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it("stops iterating after abortSignal is fired mid-pagination", async () => {
      const controller = new AbortController();
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        const body = url.includes("pageToken=p2")
          ? makeListResponse([makeDriveFile({ id: "f2" })])
          : makeListResponse([makeDriveFile({ id: "f1" })], "p2");
        return new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;

      const provider = makeProvider(am, fetchMock);
      const files: StorageFileMeta[] = [];
      for await (const f of provider.listAllFiles({ abortSignal: controller.signal })) {
        files.push(f);
        controller.abort();  // abort after yielding first file
      }

      expect(files).toHaveLength(1);
      expect(files[0]!.id).toBe("f1");
    });

    it("yields no files when the API returns an empty files array", async () => {
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/files", body: makeListResponse([]) },
      ]));

      const files: StorageFileMeta[] = [];
      for await (const f of provider.listAllFiles()) files.push(f);

      expect(files).toHaveLength(0);
    });
  });

  // ── changesSince ────────────────────────────────────────────────

  describe("changesSince()", () => {
    it("yields a StorageChange for each changed file", async () => {
      const driveFile = makeDriveFile({ id: "f1", name: "updated.pdf" });
      const changes = [{ fileId: "f1", removed: false, file: driveFile }];
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/changes", body: makeChangesResponse(changes, "new-cursor") },
      ]));

      const results: StorageChange[] = [];
      for await (const c of provider.changesSince("cursor-v1")) results.push(c);

      expect(results).toHaveLength(1);
      expect(results[0]!.fileId).toBe("f1");
      expect(results[0]!.kind).toBe("modified");
    });

    it("emits kind 'removed' for deleted files", async () => {
      const changes = [{ fileId: "f2", removed: true }];
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/changes", body: makeChangesResponse(changes) },
      ]));

      const results: StorageChange[] = [];
      for await (const c of provider.changesSince("cursor-v1")) results.push(c);

      expect(results[0]!.kind).toBe("removed");
      expect(results[0]!.fileId).toBe("f2");
    });

    it("includes file meta in StorageChange when file data is present", async () => {
      const driveFile = makeDriveFile({ id: "f3", name: "contract.pdf" });
      const changes = [{ fileId: "f3", removed: false, file: driveFile }];
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/changes", body: makeChangesResponse(changes) },
      ]));

      const results: StorageChange[] = [];
      for await (const c of provider.changesSince("cursor-v1")) results.push(c);

      expect(results[0]!.meta).toBeDefined();
      expect(results[0]!.meta!.name).toBe("contract.pdf");
    });
  });

  // ── currentCursor ───────────────────────────────────────────────

  describe("currentCursor()", () => {
    it("returns the startPageToken from the Drive Changes API", async () => {
      const provider = makeProvider(am, makeFetch([
        { match: "startPageToken", body: { startPageToken: "cursor-xyz" } },
      ]));

      const cursor = await provider.currentCursor();
      expect(cursor).toBe("cursor-xyz");
    });
  });

  // ── getContent ──────────────────────────────────────────────────

  describe("getContent()", () => {
    it("fetches binary content via ?alt=media for non-Google types", async () => {
      const bytes = new TextEncoder().encode("binary content");
      let requestUrl = "";
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = input.toString();
        return new Response(bytes, { status: 200 });
      }) as unknown as typeof fetch;

      const provider = makeProvider(am, fetchMock);
      const result = await provider.getContent("file-bin", "application/pdf");

      expect(new TextDecoder().decode(result)).toBe("binary content");
      expect(requestUrl).toContain("alt=media");
    });

    it("uses the export endpoint for Google Docs MIME types", async () => {
      let requestUrl = "";
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = input.toString();
        return new Response(new TextEncoder().encode("doc text"), { status: 200 });
      }) as unknown as typeof fetch;

      const provider = makeProvider(am, fetchMock);
      await provider.getContent("gdoc-001", "application/vnd.google-apps.document");

      expect(requestUrl).toContain("export");
      expect(requestUrl).toContain("text%2Fplain");    // URL-encoded text/plain
    });

    it("uses the export endpoint for Google Sheets", async () => {
      let requestUrl = "";
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = input.toString();
        return new Response(new TextEncoder().encode("csv data"), { status: 200 });
      }) as unknown as typeof fetch;

      const provider = makeProvider(am, fetchMock);
      await provider.getContent("sheet-001", "application/vnd.google-apps.spreadsheet");

      expect(requestUrl).toContain("export");
    });

    it("returns an empty ArrayBuffer for a 404 response", async () => {
      const provider = makeProvider(am, makeFetch([
        { match: "/drive/v3/files", body: "Not Found", status: 404 },
      ]));

      const result = await provider.getContent("missing-file", "application/pdf");
      expect(result.byteLength).toBe(0);
    });
  });

  // ── upgradeToWriteScope ─────────────────────────────────────────

  describe("upgradeToWriteScope()", () => {
    it("returns true when deps.onUpgradeScope resolves true", async () => {
      const provider = makeProvider(am, makeFetch([]), {
        onUpgradeScope: async () => true,
      });
      expect(await provider.upgradeToWriteScope()).toBe(true);
    });

    it("returns false when deps.onUpgradeScope resolves false (user cancelled)", async () => {
      const provider = makeProvider(am, makeFetch([]), {
        onUpgradeScope: async () => false,
      });
      expect(await provider.upgradeToWriteScope()).toBe(false);
    });
  });

  // ── applyPermissionChange ───────────────────────────────────────

  describe("applyPermissionChange()", () => {
    it("DELETEs the anyoneWithLink permission for remove-public-link", async () => {
      const file = makeDriveFile({
        id: "f1",
        permissions: [{ id: "anyoneWithLink", type: "anyone", role: "reader" }],
      });
      let deletedUrl = "";
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url    = input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "DELETE") {
          deletedUrl = url;
          return new Response(null, { status: 200 });
        }
        // GET file metadata (for looking up the permission ID)
        if (url.includes("/files/f1")) {
          return new Response(JSON.stringify(file), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not Found", { status: 404 });
      }) as unknown as typeof fetch;

      const provider = makeProvider(am, fetchMock);
      await provider.applyPermissionChange("f1", { kind: "remove-public-link" });

      expect(deletedUrl).toContain("anyoneWithLink");
    });

    it("DELETEs the matching user permission for remove-collaborator", async () => {
      const file = makeDriveFile({
        id: "f1",
        permissions: [
          { id: "perm-bob", type: "user", emailAddress: "bob@other.com", role: "writer" },
        ],
      });
      let deletedUrl = "";
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url    = input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "DELETE") {
          deletedUrl = url;
          return new Response(null, { status: 200 });
        }
        if (url.includes("/files/f1")) {
          return new Response(JSON.stringify(file), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not Found", { status: 404 });
      }) as unknown as typeof fetch;

      const provider = makeProvider(am, fetchMock);
      await provider.applyPermissionChange("f1", { kind: "remove-collaborator", email: "bob@other.com" });

      expect(deletedUrl).toContain("perm-bob");
    });

    it("PATCHes role to 'reader' for downgrade-to-view", async () => {
      const file = makeDriveFile({
        id: "f1",
        permissions: [
          { id: "perm-carol", type: "user", emailAddress: "carol@other.com", role: "writer" },
        ],
      });
      let patchedUrl  = "";
      let patchedBody = "";
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url    = input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "PATCH") {
          patchedUrl  = url;
          patchedBody = (init?.body as string) ?? "";
          return new Response(JSON.stringify({ id: "perm-carol", role: "reader" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/files/f1")) {
          return new Response(JSON.stringify(file), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not Found", { status: 404 });
      }) as unknown as typeof fetch;

      const provider = makeProvider(am, fetchMock);
      await provider.applyPermissionChange("f1", { kind: "downgrade-to-view", email: "carol@other.com" });

      expect(patchedUrl).toContain("perm-carol");
      expect(JSON.parse(patchedBody)).toMatchObject({ role: "reader" });
    });
  });
});
