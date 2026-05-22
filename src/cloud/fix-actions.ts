/**
 * T105 — Drive fix-action buttons + write-scope upgrade flow.
 *
 * Spec refs: FR-A3, C-OAUTH-4
 *
 * Premium-only: apply a permission fix to a Drive file.
 *
 * Gate order (must not change — free users must NEVER see the scope prompt):
 *   1. TierGate.check("drive:fix-actions")  — blocks free tier immediately
 *   2. provider.upgradeToWriteScope()        — separate consent step (C-OAUTH-4)
 *   3. provider.applyPermissionChange(...)   — only if scope was granted
 *
 * C-OAUTH-4: write scope is NOT bundled with the read-only audit OAuth flow.
 * The user must explicitly grant write access before any permission change is applied.
 */

import type { CloudStorageProvider, StorageFileId, PermissionChange } from "./storage-provider";
import type { TierGate } from "../core/tier-gate";

/* ── Public types ────────────────────────────────────────────────── */

export type FixResult =
  | { status: "applied" }
  | { status: "scope-declined" }
  | { status: "gate-blocked"; limit: number | string };

/* ── applyFix ────────────────────────────────────────────────────── */

/**
 * Apply a permission fix to a Drive file.
 *
 * @param fileId   - The file to fix.
 * @param change   - The permission change to apply.
 * @param provider - The storage provider (must implement upgradeToWriteScope
 *                   and applyPermissionChange).
 * @param tierGate - TierGate instance for feature gating.
 * @returns        FixResult indicating outcome.
 */
export async function applyFix(
  fileId:   StorageFileId,
  change:   PermissionChange,
  provider: CloudStorageProvider,
  tierGate: TierGate,
): Promise<FixResult> {
  // ── 1. Gate check — free tier stops here ──────────────────────
  const gateResult = await tierGate.check("drive:fix-actions");
  if (!gateResult.allowed) {
    return { status: "gate-blocked", limit: gateResult.limit };
  }

  // ── 2. Write-scope upgrade — separate consent (C-OAUTH-4) ─────
  const granted = await provider.upgradeToWriteScope();
  if (!granted) {
    return { status: "scope-declined" };
  }

  // ── 3. Apply the permission change ────────────────────────────
  await provider.applyPermissionChange(fileId, change);
  return { status: "applied" };
}
