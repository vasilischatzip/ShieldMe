/**
 * Ownership proof verification — web-app variant (post-pivot 2026-05-17).
 *
 * The web app has no privileged equivalent of `chrome.identity.getProfileUserInfo`.
 * Ownership is established by an explicit user gesture in the UI before this
 * function is called.
 */
import type { OwnershipProof, OwnershipVerifier } from "~/radar/hibp-emails";

export { OwnershipError, NotYetImplementedError } from "~/radar/hibp-emails";

export const chromeOwnershipVerifier: OwnershipVerifier = async function (
  email: string,
  proof: OwnershipProof,
): Promise<void> {
  if (proof.kind === "code-verified") {
    const { NotYetImplementedError } = await import("~/radar/hibp-emails");
    throw new NotYetImplementedError("code-verified ownership proof");
  }
  if (!email) {
    const { OwnershipError } = await import("~/radar/hibp-emails");
    throw new OwnershipError(email, "email is required");
  }
};
