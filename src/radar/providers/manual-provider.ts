/**
 * ManualProvider — data broker removal tracker (ships in MVP).
 *
 * Reads the broker catalog from `src/data/brokers.json`.
 * Users manually track their removal request progress.
 * Zero network calls — all state is local chrome.storage.local.
 *
 * Storage key schema:
 *   `brokerStatus.{siteId}` → RemovalStatus
 */

import type { LocalStore } from "~/core/storage";
import brokersData from "~/data/brokers.json";

/* ── Public types ──────────────────────────────────────────────── */

export type BrokerSite = {
  id: string;
  name: string;
  optOutUrl: string;
  formDifficulty: "easy" | "medium" | "hard";
  automationSupported: boolean;
};

export type RemovalStatus =
  | { state: "unchecked" }
  | { state: "requested"; requestedAt: string; providerTicket?: string }
  | { state: "in-progress"; providerTicket: string }
  | { state: "confirmed"; confirmedAt: string }
  | { state: "failed"; reason: string };

export interface BrokerRemovalProvider {
  readonly kind: "manual" | "deleteme";
  listSites(): Promise<BrokerSite[]>;
  status(siteId: string): Promise<RemovalStatus>;
  requestRemoval(siteId: string): Promise<RemovalStatus>;
  sync?(): Promise<void>;
}

/* ── Storage helpers ────────────────────────────────────────────── */

function statusKey(siteId: string): string {
  return `brokerStatus.${siteId}`;
}

/* ── Catalog ───────────────────────────────────────────────────── */

const CATALOG: BrokerSite[] = (brokersData as BrokerSite[]);

/* ── Factory ─────────────────────────────────────────────────────── */

/**
 * Creates a ManualProvider that persists removal status to `store`.
 *
 * @param store  LocalStore instance (chrome.storage.local wrapper).
 * @param nowIso Function returning the current ISO 8601 datetime (injectable for tests).
 */
export function createManualProvider(
  store: LocalStore,
  nowIso: () => string = () => new Date().toISOString(),
): BrokerRemovalProvider {
  return {
    kind: "manual",

    async listSites(): Promise<BrokerSite[]> {
      return [...CATALOG];
    },

    async status(siteId: string): Promise<RemovalStatus> {
      const stored = await store.get<RemovalStatus>(statusKey(siteId));
      return stored ?? { state: "unchecked" };
    },

    async requestRemoval(siteId: string): Promise<RemovalStatus> {
      const current = await store.get<RemovalStatus>(statusKey(siteId));

      // Already confirmed — no-op, return current
      if (current?.state === "confirmed") return current;

      const newStatus: RemovalStatus = {
        state:       "requested",
        requestedAt: nowIso(),
      };
      await store.set<RemovalStatus>(statusKey(siteId), newStatus);
      return newStatus;
    },

    // ManualProvider has no external sync — sites are tracked locally only.
    // sync is intentionally not implemented.
  };
}
