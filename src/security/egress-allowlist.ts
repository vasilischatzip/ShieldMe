/**
 * Authoritative egress allowlist — every host ShieldMe is ever allowed to contact.
 * Source of truth: specs/001-shieldme-mvp/contracts/integration-apis.md
 * The CI script scripts/check-egress-allowlist.mjs asserts no built JS contacts
 * a host absent from this list.
 */
export const EGRESS_ALLOWLIST = [
  // HIBP — password k-anonymity (no key)
  "api.pwnedpasswords.com",
  // HIBP — breach email check (user's own key)
  "haveibeenpwned.com",
  // Google Drive API
  "www.googleapis.com",
  // Google OAuth
  "accounts.google.com",
  "oauth2.googleapis.com",
  // Optional hosts (feature-gated at runtime via src/security/fetch.ts):
  //   tessdata.projectnaptha.com — OCR traineddata, only when user requests OCR
  //   plausible.io             — telemetry, only when user opts in
  //   js.stripe.com etc.       — billing, M6+
] as const;

export type AllowedHost = (typeof EGRESS_ALLOWLIST)[number];

export function isAllowedHost(host: string): boolean {
  return EGRESS_ALLOWLIST.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
