/**
 * DeleteMeProvider — scaffold for Premium M6+ broker removal.
 *
 * All methods throw `NotYetAvailableError` in the MVP.
 * The interface is wired here so the factory can select it without any
 * call-site changes when the real implementation lands.
 */

import type { BrokerRemovalProvider, BrokerSite, RemovalStatus } from "./manual-provider";

export class NotYetAvailableError extends Error {
  constructor(feature = "DeleteMe integration") {
    super(`${feature} is not yet available. This feature is coming in a future version.`);
    this.name = "NotYetAvailableError";
  }
}

export class DeleteMeProvider implements BrokerRemovalProvider {
  readonly kind = "deleteme" as const;

  constructor(
    /** Encrypted API key (stored via Crypto; never persisted in plaintext). */
    private readonly _encryptedApiKey?: unknown,
  ) {}

  async listSites(): Promise<BrokerSite[]> {
    throw new NotYetAvailableError("DeleteMe site listing");
  }

  async status(_siteId: string): Promise<RemovalStatus> {
    throw new NotYetAvailableError("DeleteMe status check");
  }

  async requestRemoval(_siteId: string): Promise<RemovalStatus> {
    throw new NotYetAvailableError("DeleteMe removal request");
  }

  async sync(): Promise<void> {
    throw new NotYetAvailableError("DeleteMe sync");
  }
}
