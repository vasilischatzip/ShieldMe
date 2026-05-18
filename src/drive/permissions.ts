/**
 * Drive permission classifier — T038.
 *
 * Classifies a DriveFile's permissions into one of four exposure levels:
 *
 *   public          — anyone on the internet can access (type="anyone")
 *   external-edit   — specific external (non-owner) user with write/comment access
 *   external-read   — specific external user with read-only access
 *   internal-only   — only owner(s); no external sharing detected
 *
 * "External" means: a user/group whose email domain differs from the file owner's domain.
 * If owner domain is unknown, every non-owner user is treated as external (fail safe).
 *
 * Used by the audit orchestrator to decide which files warrant content scanning.
 * Files with exposure level "internal-only" are skipped for content scanning
 * (they cannot be seen by outsiders — scanning them would waste quota).
 *
 * Contract: docs/engineering-qa.md §Q4
 */

import type { DriveFile, DrivePermission } from "./client";

/* ── Exposure level ───────────────────────────────────────────────── */

export type ExposureLevel =
  | "public"          // Anyone on the internet
  | "external-edit"   // Specific external user — writer / commenter
  | "external-read"   // Specific external user — reader
  | "internal-only";  // Only the owner (safe)

export type PermissionClassification = {
  level:        ExposureLevel;
  /** Permissions that caused this level to be assigned. */
  triggers:     DrivePermission[];
  /** True if the file is discoverable via "anyone with link". */
  publicLink:   boolean;
  /** Domains that have access (non-owner). */
  externalDomains: string[];
};

/* ── Helpers ──────────────────────────────────────────────────────── */

function ownerDomain(file: DriveFile): string | null {
  const email = file.owners?.[0]?.emailAddress;
  if (!email) return null;
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : null;
}

function emailDomain(email: string): string {
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function isWriteRole(role: DrivePermission["role"]): boolean {
  return role === "writer" || role === "fileOrganizer" || role === "organizer" || role === "commenter";
}

/* ── Classifier ───────────────────────────────────────────────────── */

/**
 * Classify the sharing exposure level of a Drive file.
 *
 * @param file  DriveFile with populated `permissions` and `owners` fields.
 * @returns PermissionClassification
 */
export function classifyPermissions(file: DriveFile): PermissionClassification {
  const perms          = file.permissions ?? [];
  const ownerDom       = ownerDomain(file);
  const triggers:      DrivePermission[] = [];
  const externalDoms:  Set<string>       = new Set();
  let   publicLink     = false;
  let   level: ExposureLevel = "internal-only";

  for (const perm of perms) {
    // Skip the owner's own entry
    if (perm.role === "owner") continue;
    // Skip deleted permissions
    if (perm.deleted) continue;

    if (perm.type === "anyone") {
      publicLink = true;
      triggers.push(perm);
      level = "public";
      continue;
    }

    if (perm.type === "domain") {
      const dom = perm.domain?.toLowerCase() ?? "";
      if (ownerDom && dom === ownerDom) continue; // same org
      externalDoms.add(dom);
      triggers.push(perm);
      if (level !== "public") {
        level = isWriteRole(perm.role) ? "external-edit" : "external-read";
      }
      continue;
    }

    if (perm.type === "user" || perm.type === "group") {
      const email = perm.emailAddress?.toLowerCase() ?? "";
      const dom   = emailDomain(email);
      // Same domain as owner → internal (skip)
      if (ownerDom && dom && dom === ownerDom) continue;
      // Different domain or unknown domain → external
      if (dom) externalDoms.add(dom);
      triggers.push(perm);
      if (level !== "public") {
        const candidate: ExposureLevel = isWriteRole(perm.role) ? "external-edit" : "external-read";
        // Escalate: external-edit > external-read > internal-only
        if (
          level === "internal-only" ||
          (level === "external-read" && candidate === "external-edit")
        ) {
          level = candidate;
        }
      }
    }
  }

  return {
    level,
    triggers,
    publicLink,
    externalDomains: Array.from(externalDoms),
  };
}

/**
 * Returns true if the file warrants content scanning for PII.
 * "internal-only" files are skipped — no outsider can see them.
 */
export function shouldScanContent(classification: PermissionClassification): boolean {
  return classification.level !== "internal-only";
}

/**
 * Severity label for the exposure level (for UI display).
 */
export function exposureSeverity(
  level: ExposureLevel,
): "critical" | "warning" | "info" {
  switch (level) {
    case "public":        return "critical";
    case "external-edit": return "warning";
    case "external-read": return "info";
    case "internal-only": return "info";
  }
}

/**
 * Human-readable description of the exposure level.
 */
export function exposureLabel(level: ExposureLevel): string {
  switch (level) {
    case "public":        return "Public — anyone on the internet";
    case "external-edit": return "Shared with external editors";
    case "external-read": return "Shared with external viewers";
    case "internal-only": return "Private";
  }
}
