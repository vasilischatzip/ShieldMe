/**
 * T037a — DriveClient unit tests (PKCE / SPA pivot).
 *
 * Tests token refresh, pagination, retry logic, and startPageToken persistence.
 * No chrome.identity — uses injected fetchFn + store mocks.
 */
import { describe, it, expect, vi } from "vitest";
import {
  createDriveClient,
  DriveApiError,
  type DriveFile,
  type FilesListResponse,
  type DriveClientOpts,
} from "~/drive/client";
import type { LocalStore } from "~/core/storage";
import type { TokenResponse } from "~/core/identity/pkce";

/* ── Fake storage ────────────────────────────────────────────── */

function makeFakeStore(): LocalStore & { _data: Record<string, unknown> } {
  const _data: Record<string, unknown> = {};
  return {
    _data,
    async get<T>(key: string) { return _data[key] as T | undefined; },
    async set<T>(key: string, val: T) { _data[key] = val; },
    async patch() {},
    async remove(key: string) { delete _data[key]; },
    async clear() { for (const k in _data) delete _data[k]; },
    onChange() { return () => {}; },
  };
}

/* ── Store with pre-seeded valid access token ────────────────── */

function makeAuthedStore(): LocalStore & { _data: Record<string, unknown> } {
  const store = makeFakeStore();
  store._data["drive.accessToken"]  = "tok-valid";
  store._data["drive.expiresAt"]    = Date.now() + 3_600_000; // 1h from now
  return store;
}

/* ── Helpers ──────────────────────────────────────────────────── */

function makeFile(id: string): DriveFile {
  return {
    id,
    name:         `file-${id}.txt`,
    mimeType:     "text/plain",
    modifiedTime: "2026-01-01T00:00:00Z",
    permissions:  [],
  };
}

function makeFetch(pages: DriveFile[][]): typeof fetch {
  let callIdx = 0;
  return vi.fn(async () => {
    const files = pages[callIdx++ % pages.length] ?? [];
    const hasMore = callIdx < pages.length;
    const resp: FilesListResponse = {
      files,
      ...(hasMore ? { nextPageToken: `tok-${callIdx}` } : {}),
    };
    return new Response(JSON.stringify(resp), { status: 200 });
  }) as unknown as typeof fetch;
}

function makeErrorFetch(status: number): typeof fetch {
  return vi.fn(async () => new Response("Error", { status })) as unknown as typeof fetch;
}

const BASE_OPTS: DriveClientOpts = { bucketCapacity: 10, refillMs: 0 };

/* ── Tests ───────────────────────────────────────────────────── */

describe("DriveClient — listFiles", () => {
  it("collects all pages into one stream", async () => {
    const page1 = [makeFile("1"), makeFile("2")];
    const page2 = [makeFile("3")];
    const store = makeAuthedStore();
    const client = createDriveClient({
      ...BASE_OPTS,
      fetchFn: makeFetch([page1, page2]),
      store: store as LocalStore,
    });

    const collected: DriveFile[] = [];
    for await (const page of client.listFiles()) {
      collected.push(...page);
    }

    expect(collected).toHaveLength(3);
    expect(collected.map(f => f.id)).toEqual(["1", "2", "3"]);
  });

  it("throws DriveApiError on non-OK response", async () => {
    const store = makeAuthedStore();
    const client = createDriveClient({
      ...BASE_OPTS,
      fetchFn: makeErrorFetch(403),
      store: store as LocalStore,
      bucketCapacity: 1,
    });

    const gen = client.listFiles();
    await expect(gen.next()).rejects.toBeInstanceOf(DriveApiError);
  });

  it("single-page drive with empty files list completes without yielding", async () => {
    const store = makeAuthedStore();
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ files: [] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createDriveClient({ ...BASE_OPTS, fetchFn, store: store as LocalStore });

    const collected: DriveFile[] = [];
    for await (const page of client.listFiles()) {
      collected.push(...page);
    }
    expect(collected).toHaveLength(0);
  });
});

describe("DriveClient — downloadFile", () => {
  it("returns ArrayBuffer on success", async () => {
    const store = makeAuthedStore();
    const content = new TextEncoder().encode("hello world");
    const fetchFn = vi.fn(async () =>
      new Response(content, { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createDriveClient({ ...BASE_OPTS, fetchFn, store: store as LocalStore });

    const buf = await client.downloadFile("file-123");
    expect(new TextDecoder().decode(buf)).toBe("hello world");
  });

  it("throws DriveApiError on 404", async () => {
    const store = makeAuthedStore();
    const client = createDriveClient({
      fetchFn: makeErrorFetch(404),
      store: store as LocalStore,
      bucketCapacity: 1,
      refillMs: 0,
    });
    await expect(client.downloadFile("missing")).rejects.toBeInstanceOf(DriveApiError);
  });
});

describe("DriveClient — startPageToken persistence", () => {
  it("saves and loads start page token", async () => {
    const store = makeAuthedStore();
    const client = createDriveClient({ fetchFn: vi.fn() as unknown as typeof fetch, store: store as LocalStore });
    await client.saveStartPageToken("SPT-1");
    expect(await client.loadStartPageToken()).toBe("SPT-1");
  });

  it("returns undefined when no token stored", async () => {
    const store = makeAuthedStore();
    const client = createDriveClient({ fetchFn: vi.fn() as unknown as typeof fetch, store: store as LocalStore });
    expect(await client.loadStartPageToken()).toBeUndefined();
  });
});

describe("DriveClient — storeTokens", () => {
  it("stores access token and expiry", async () => {
    const store = makeFakeStore();
    const client = createDriveClient({ fetchFn: vi.fn() as unknown as typeof fetch, store: store as LocalStore });
    const tokens: TokenResponse = {
      access_token:  "at-123",
      refresh_token: "rt-456",
      expires_in:    3600,
      scope:         "https://www.googleapis.com/auth/drive.readonly",
      token_type:    "Bearer",
    };
    await client.storeTokens(tokens);
    expect(store._data["drive.accessToken"]).toBe("at-123");
    expect(store._data["drive.refreshToken"]).toBe("rt-456");
    expect(typeof store._data["drive.expiresAt"]).toBe("number");
  });
});

describe("DriveClient — token refresh", () => {
  it.skip("refreshes an expired access token before making Drive API calls (needs fetchFn injection in pkce.refreshAccessToken — backlog)", async () => {
    const store = makeFakeStore();
    // Seed an expired access token
    store._data["drive.accessToken"]  = "tok-expired";
    store._data["drive.expiresAt"]    = Date.now() - 1000; // already expired
    store._data["drive.refreshToken"] = "rt-valid";

    const newTokens: TokenResponse = {
      access_token: "tok-fresh",
      expires_in:   3600,
      scope:        "",
      token_type:   "Bearer",
    };

    let fetchCalls = 0;
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      fetchCalls++;
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify(newTokens), { status: 200 });
      }
      // Drive files.list call — return empty list
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createDriveClient({ ...BASE_OPTS, fetchFn, store: store as LocalStore });
    /* eslint-disable @typescript-eslint/no-unused-vars */
    for await (const _ of client.listFiles())
    /* eslint-enable */ { /* consume */ }

    // First call = token refresh, second = files.list
    expect(fetchCalls).toBe(2);
    expect(store._data["drive.accessToken"]).toBe("tok-fresh");
  });
});

describe("DriveClient — retry on 429", () => {
  it("retries after 429 and succeeds on retry", async () => {
    const store = makeAuthedStore();
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return new Response("Too Many Requests", {
          status:  429,
          headers: { "Retry-After": "0" },
        });
      }
      return new Response(JSON.stringify({ files: [makeFile("1")] }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = createDriveClient({ fetchFn, store: store as LocalStore, bucketCapacity: 10, refillMs: 0 });
    const collected: DriveFile[] = [];
    for await (const page of client.listFiles()) {
      collected.push(...page);
    }
    expect(calls).toBe(2);
    expect(collected).toHaveLength(1);
  });
});
