/**
 * EmailProvider interface.
 *
 * Contract: specs/001-shieldme-mvp/contracts/email-providers.md §2
 *
 * MVP ships Gmail (web DOM-only). Outlook web ships at v1.5.
 * Inbound scanning methods are optional; MVP focuses on outbound only.
 */

/* ── Compose context ─────────────────────────────────────────────── */

export type AttachmentMeta = {
  filename: string;
  sizeBytes: number;
  mimeType?: string;
  /** Returns raw bytes for client-side scanning; provider-implemented. */
  read(): Promise<ArrayBuffer>;
};

/** Provider-specific opaque handle used to allow or abort the Send. */
export type SendHandle = unknown;

export type ComposeContext = {
  /** Plaintext extracted from the rich editor (HTML stripped). */
  body: string;
  subject: string;
  /** Normalised lowercase email addresses. */
  recipients: string[];
  attachments: AttachmentMeta[];
  /** Opaque handle; use the provider's `allowSend` / `blockSend` helpers. */
  sendHandle: SendHandle;
};

/* ── Verdict ─────────────────────────────────────────────────────── */

export type ScanVerdict =
  | { decision: "send" }
  | { decision: "block"; reason: string };

/* ── Inbound (post-MVP) ──────────────────────────────────────────── */

export type InboundMessage = {
  id: string;
  receivedAt: string;
  from: string;
  to: string[];
  subject: string;
  bodyText: string;
  links: Array<{ href: string; text: string }>;
  attachments: AttachmentMeta[];
};

/* ── EmailProvider ───────────────────────────────────────────────── */

export interface EmailProvider {
  readonly providerId: "gmail" | "outlook";

  /**
   * Outbound: subscribe to Send-click events.
   * The implementation guarantees the Send is held until `verdict` resolves.
   * Returns an unsubscribe function.
   */
  onSend(handler: (ctx: ComposeContext) => Promise<ScanVerdict>): () => void;

  /**
   * Inbound (post-MVP): list recent messages for scanning.
   */
  listInbound?(opts: { sinceMs: number; limit: number }): AsyncIterable<InboundMessage>;

  /**
   * Inbound (post-MVP): subscribe to new messages.
   * Implementation may poll or use push (provider-dependent).
   * Returns an unsubscribe function.
   */
  onInbound?(handler: (msg: InboundMessage) => Promise<void>): () => void;

  /** Healthcheck for the canary system. */
  isAvailable(): Promise<{ available: boolean; reason?: string }>;
}
