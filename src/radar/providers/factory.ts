/**
 * Provider factory — selects the active BrokerRemovalProvider.
 *
 * Selection logic:
 *   Free tier        → ManualProvider (always)
 *   Premium tier     → ManualProvider by default
 *   Premium + deleteme-bridge connected → DeleteMeProvider (stub in MVP)
 *
 * The factory is the single decision point; all callers receive the same
 * interface regardless of tier.
 */

import type { LocalStore } from "~/core/storage";
import type { TierGate }   from "~/core/tier-gate";
import type { BrokerRemovalProvider } from "./manual-provider";
import { createManualProvider }       from "./manual-provider";
import { DeleteMeProvider }           from "./deleteme-provider";

export type ProviderPreference = "manual" | "deleteme";

/**
 * Returns the active `BrokerRemovalProvider` for the current user.
 *
 * @param store    LocalStore instance for status persistence.
 * @param tierGate TierGate to check premium features.
 * @param pref     User's stored provider preference (default "manual").
 * @param nowIso   Injectable clock for tests (passed to ManualProvider).
 */
export async function createProvider(
  store:    LocalStore,
  tierGate: TierGate,
  pref:     ProviderPreference = "manual",
  nowIso?:  () => string,
): Promise<BrokerRemovalProvider> {
  const manual = createManualProvider(store, nowIso);

  if (pref !== "deleteme") {
    return manual;
  }

  // Only offer DeleteMe if the premium tier AND deleteme-bridge feature unlocked
  const bridgeCheck = await tierGate.check("radar:delete-me");
  if (!bridgeCheck.allowed) {
    return manual;
  }

  // Premium + deleteme preference → DeleteMe (stub in MVP)
  return new DeleteMeProvider();
}
