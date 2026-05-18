# Contract — Email Providers

**Status:** binding · **Updated:** 2026-05-09

Defines the seam between Email Guardian (Module 3) and any email backend. MVP ships with **Gmail web (DOM-only)**. Outlook web ships at v1.5 via Microsoft Graph **read** scopes for inbound scanning (ask 8) and a parallel DOM strategy for the compose surface. Yahoo Mail, AOL, and any IMAP-only consumer providers are **out of scope** — no API path that satisfies Constitution §I, and DOM scraping mature webmail clients is unsustainable per-provider.

---

## 1. Provider matrix

| Provider | Status | Outbound (compose intercept) | Inbound (received scan) | Auth |
|---|---|---|---|---|
| Gmail (web) | **MVP** | DOM content script, Send-click intercept | Optional, post-MVP via DOM | None (DOM) |
| Outlook (web) | **v1.5** | DOM content script | Microsoft Graph read | OAuth via `IdentityProvider` (Microsoft) |
| Microsoft 365 (web) | **v1.5** | Same as Outlook web | Same as Outlook | Same |
| Outlook desktop | out of scope | — | — | Native app, not a browser surface |
| Apple Mail | out of scope | — | — | Native app |
| Yahoo Mail | out of scope | — | — | DOM scraping not sustainable |
| Generic IMAP | out of scope | — | — | Credential storage = unacceptable surface |

## 2. EmailProvider interface

```ts
// src/email/email-provider.ts

export type ComposeContext = {
  body: string;                          // plaintext extracted from rich editor
  subject: string;
  recipients: string[];                  // normalized lowercase emails
  attachments: AttachmentMeta[];
  /** Provider-specific opaque handle used to abort the Send if user goes back. */
  sendHandle: SendHandle;
};

export type AttachmentMeta = {
  filename: string;
  sizeBytes: number;
  mimeType?: string;
  /** Returns ArrayBuffer for client-side scanning; provider-implemented. */
  read(): Promise<ArrayBuffer>;
};

export type SendHandle = unknown;        // provider-specific; opaque

export type ScanVerdict =
  | { decision: "send" }
  | { decision: "block"; reason: string };

export type InboundMessage = {
  id: string;
  receivedAt: string;
  from: string;
  to: string[];
  subject: string;
  bodyText: string;                       // plain text; HTML stripped
  links: Array<{ href: string; text: string }>;
  attachments: AttachmentMeta[];
};

export interface EmailProvider {
  readonly providerId: "gmail" | "outlook";

  /** Outbound: subscribe to Send-click events. Implementation guarantees the
   *  Send is held until `verdict` resolves. */
  onSend(handler: (ctx: ComposeContext) => Promise<ScanVerdict>): () => void;

  /** Inbound (post-MVP): list recent messages for scanning. */
  listInbound?(opts: { sinceMs: number; limit: number }): AsyncIterable<InboundMessage>;

  /** Inbound (post-MVP): subscribe to new messages. Implementation may poll or push. */
  onInbound?(handler: (msg: InboundMessage) => Promise<void>): () => void;

  /** Healthcheck for the canary system. */
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
}
```

## 3. Outbound (Send-click intercept)

| Provider | Mechanism | Failure mode |
|---|---|---|
| Gmail | MutationObserver on compose dialog; capture-phase listener on Send button (cascade selectors per `engineering-qa.md` Q1) | Banner: "Email Guardian temporarily unavailable" |
| Outlook web | MutationObserver on `[role="button"][aria-label*="Send"]`; capture listener; same cascade pattern with provider-specific selectors | Same banner |

The cascade-and-canary discipline from Q1 applies to every provider; selectors live in `src/content/<provider>/selectors.ts`.

## 4. Inbound (post-MVP, ask 8 — phishing scan)

Inbound scanning is opt-in per account, off by default. When enabled:

- Gmail: DOM-based "open message" hook scans body + links before render. Phishing heuristics: link mismatch (display text vs href domain), known-bad TLDs, look-alike Unicode, attachment type mismatch.
- Outlook: Microsoft Graph `Mail.Read` scope (user-consented), polled or webhook-subscribed. Same heuristics.

Inbound scanning operates under Constitution §XV (Inbound Content Trust): parsing in offscreen document, no automatic action, every protective response user-initiated. Reputation lookups (if any) use k-anonymity hashing with the same discipline as HIBP.

## 5. Recipient/domain whitelisting

Per-account, per-recipient, per-domain — see [data-model.md §12c](../data-model.md#12c-per-account-scoped-state). Whitelists are not shared across providers (same email may legitimately be a vendor in one account and an internal user in another).

## 6. Free vs Premium

Outbound on Gmail is free for everyone (Constitution §VI: tier-agnostic core). Outbound on Outlook arrives at v1.5 free for everyone. Inbound scanning ships as Premium initially because it requires continuous monitoring (`continuousMonitoring` entitlement); a free-tier "scan when I open it" mode is on the roadmap.

## 7. Test contract

- Fakes per provider under `tests/fakes/email/`.
- Playwright e2e per provider, gated by per-provider test accounts.
- Cross-provider regression: same `ScanVerdict` + same modal flow regardless of provider.
