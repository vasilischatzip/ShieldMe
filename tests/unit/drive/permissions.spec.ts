/**
 * T038a — Drive permission classifier unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  classifyPermissions,
  shouldScanContent,
  exposureSeverity,
  exposureLabel,
} from "~/drive/permissions";
import type { DriveFile } from "~/drive/client";

/* ── Helpers ────────────────────────────────────────────────────── */

function makeFile(overrides: Partial<DriveFile> = {}): DriveFile {
  return {
    id:           "file-1",
    name:         "test.txt",
    mimeType:     "text/plain",
    modifiedTime: "2026-01-01T00:00:00Z",
    owners:       [{ emailAddress: "alice@acme.com", displayName: "Alice" }],
    permissions:  [],
    ...overrides,
  };
}

/* ── internal-only ──────────────────────────────────────────────── */

describe("classifyPermissions — internal-only", () => {
  it("file with no permissions is internal-only", () => {
    const result = classifyPermissions(makeFile({ permissions: [] }));
    expect(result.level).toBe("internal-only");
    expect(result.publicLink).toBe(false);
    expect(result.triggers).toHaveLength(0);
  });

  it("file with only owner permission is internal-only", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "user", role: "owner", emailAddress: "alice@acme.com" },
      ],
    }));
    expect(result.level).toBe("internal-only");
  });

  it("same-domain user is treated as internal", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "user", role: "reader", emailAddress: "bob@acme.com" },
      ],
    }));
    expect(result.level).toBe("internal-only");
    expect(result.triggers).toHaveLength(0);
  });

  it("deleted permission is ignored", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "user", role: "writer", emailAddress: "eve@evil.com", deleted: true },
      ],
    }));
    expect(result.level).toBe("internal-only");
  });
});

/* ── public ─────────────────────────────────────────────────────── */

describe("classifyPermissions — public", () => {
  it("anyone type yields public level", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "anyone", role: "reader" },
      ],
    }));
    expect(result.level).toBe("public");
    expect(result.publicLink).toBe(true);
    expect(result.triggers).toHaveLength(1);
  });

  it("public takes priority over external-edit", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "user", role: "writer", emailAddress: "eve@evil.com" },
        { id: "p2", type: "anyone", role: "reader" },
      ],
    }));
    expect(result.level).toBe("public");
    expect(result.publicLink).toBe(true);
  });
});

/* ── external-edit ──────────────────────────────────────────────── */

describe("classifyPermissions — external-edit", () => {
  it("external user with writer role yields external-edit", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "user", role: "writer", emailAddress: "bob@other.com" },
      ],
    }));
    expect(result.level).toBe("external-edit");
    expect(result.triggers).toHaveLength(1);
    expect(result.externalDomains).toContain("other.com");
  });

  it("commenter role yields external-edit", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "user", role: "commenter", emailAddress: "bob@other.com" },
      ],
    }));
    expect(result.level).toBe("external-edit");
  });

  it("external domain share with write role yields external-edit", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "domain", role: "writer", domain: "partner.com" },
      ],
    }));
    expect(result.level).toBe("external-edit");
    expect(result.externalDomains).toContain("partner.com");
  });

  it("external-edit overrides external-read from a prior perm", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "user", role: "reader",  emailAddress: "viewer@other.com" },
        { id: "p2", type: "user", role: "writer",  emailAddress: "editor@other.com" },
      ],
    }));
    expect(result.level).toBe("external-edit");
  });
});

/* ── external-read ──────────────────────────────────────────────── */

describe("classifyPermissions — external-read", () => {
  it("external user with reader role yields external-read", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "user", role: "reader", emailAddress: "viewer@external.org" },
      ],
    }));
    expect(result.level).toBe("external-read");
    expect(result.externalDomains).toContain("external.org");
  });

  it("group type is treated as external when domain differs", () => {
    const result = classifyPermissions(makeFile({
      permissions: [
        { id: "p1", type: "group", role: "reader", emailAddress: "team@partner.io" },
      ],
    }));
    expect(result.level).toBe("external-read");
  });
});

/* ── shouldScanContent ──────────────────────────────────────────── */

describe("shouldScanContent", () => {
  it("returns true for public", () => {
    expect(shouldScanContent({ level: "public", triggers: [], publicLink: true, externalDomains: [] })).toBe(true);
  });

  it("returns true for external-edit", () => {
    expect(shouldScanContent({ level: "external-edit", triggers: [], publicLink: false, externalDomains: [] })).toBe(true);
  });

  it("returns true for external-read", () => {
    expect(shouldScanContent({ level: "external-read", triggers: [], publicLink: false, externalDomains: [] })).toBe(true);
  });

  it("returns false for internal-only", () => {
    expect(shouldScanContent({ level: "internal-only", triggers: [], publicLink: false, externalDomains: [] })).toBe(false);
  });
});

/* ── exposureSeverity / exposureLabel ───────────────────────────── */

describe("exposureSeverity", () => {
  it("public → critical", ()  => { expect(exposureSeverity("public")).toBe("critical"); });
  it("external-edit → warning", () => { expect(exposureSeverity("external-edit")).toBe("warning"); });
  it("external-read → info",  () => { expect(exposureSeverity("external-read")).toBe("info"); });
  it("internal-only → info",  () => { expect(exposureSeverity("internal-only")).toBe("info"); });
});

describe("exposureLabel", () => {
  it("public label mentions internet",   () => { expect(exposureLabel("public")).toMatch(/internet/i); });
  it("external-edit label mentions edit", () => { expect(exposureLabel("external-edit")).toMatch(/edit/i); });
  it("external-read label mentions view", () => { expect(exposureLabel("external-read")).toMatch(/view/i); });
  it("internal-only label says Private", () => { expect(exposureLabel("internal-only")).toBe("Private"); });
});
