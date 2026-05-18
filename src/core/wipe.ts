/**
 * wipeAll — "Delete all my data" implementation.
 *
 * Constitution §II: "Delete all my data" wipes every byte in one action
 * and is reachable in ≤2 clicks.
 *
 * Returns a WipeReport describing what was cleared so the UI can show
 * a confirmation without any sensitive data appearing in the log.
 */
import type { LocalStore } from "./storage";
import type { IdbStore } from "./idb";
import type { KeyVault } from "./key-vault";

export interface WipeReport {
  /** Millisecond timestamp when wipe completed. */
  wipedAt: number;
  /** Whether the key vault was cleared successfully. */
  vaultCleared: boolean;
  /** Whether IndexedDB stores were cleared successfully. */
  idbCleared: boolean;
  /** Whether chrome.storage.local was cleared successfully. */
  localStoreCleared: boolean;
  /** Whether an OAuth token was revoked (undefined if no revoke fn provided). */
  oauthRevoked: boolean | undefined;
  /** Any non-fatal errors encountered during wipe (e.g. OAuth revoke failure). */
  warnings: string[];
}

export type RevokeOAuthFn = () => Promise<void>;

/**
 * Wipes all ShieldMe-owned storage in a defined order:
 * 1. Key vault (encrypted API keys) — highest priority
 * 2. IndexedDB stores (scan history, Drive cache, breach results, telemetry)
 * 3. chrome.storage.local (prefs, rules, meta)
 * 4. OAuth token revocation (best-effort; failure is non-fatal)
 *
 * All steps run even if a prior step fails, to maximize coverage.
 * Errors in individual steps are captured in `warnings`.
 */
export async function wipeAll(
  store: LocalStore,
  db: IdbStore,
  vault: KeyVault,
  revokeOauth?: RevokeOAuthFn,
): Promise<WipeReport> {
  const warnings: string[] = [];
  let vaultCleared = false;
  let idbCleared = false;
  let localStoreCleared = false;
  let oauthRevoked: boolean | undefined;

  // Step 1 — clear encrypted key vault
  try {
    await vault.clear();
    vaultCleared = true;
  } catch (err) {
    warnings.push(`vault: ${String(err)}`);
  }

  // Step 2 — clear IndexedDB
  try {
    await db.clearAll();
    idbCleared = true;
  } catch (err) {
    warnings.push(`idb: ${String(err)}`);
  }

  // Step 3 — clear chrome.storage.local (wipes prefs, rules, meta, tier cache)
  try {
    await store.clear();
    localStoreCleared = true;
  } catch (err) {
    warnings.push(`localStore: ${String(err)}`);
  }

  // Step 4 — revoke OAuth token (best-effort)
  if (revokeOauth !== undefined) {
    try {
      await revokeOauth();
      oauthRevoked = true;
    } catch (err) {
      oauthRevoked = false;
      // Non-fatal: token will expire on its own
      warnings.push(`oauthRevoke: ${String(err)}`);
    }
  }

  return {
    wipedAt: Date.now(),
    vaultCleared,
    idbCleared,
    localStoreCleared,
    oauthRevoked,
    warnings,
  };
}
