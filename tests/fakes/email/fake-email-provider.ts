/**
 * T084 — FakeEmailProvider test double.
 *
 * Implements the full EmailProvider interface so Email Guardian tests can
 * run without a real DOM / content script / Gmail page.
 *
 * Key capabilities:
 *   - `_simulateSend(ctx)` — trigger all registered `onSend` handlers with a
 *     ComposeContext; returns the settled verdict.
 *   - `_setAvailable(false, reason)` — make `isAvailable()` return unavailable.
 *   - Captures all unsubscribe calls for leak detection in tests.
 *
 * Usage:
 *
 *   const fake = new FakeEmailProvider();
 *   const unsub = fake.onSend(async (ctx) => {
 *     // scanner logic
 *     return { decision: "send" };
 *   });
 *
 *   const verdict = await fake._simulateSend({
 *     body: "My IBAN is GB29NWBK60161331926819",
 *     subject: "Payment details",
 *     recipients: ["alice@example.com"],
 *     attachments: [],
 *     sendHandle: null,
 *   });
 *
 *   expect(verdict.decision).toBe("block");
 *   unsub();
 */

import type { EmailProvider, ComposeContext, ScanVerdict, InboundMessage, AttachmentMeta } from "~/email/email-provider";

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Convenience factory for a minimal ComposeContext. */
export function makeComposeContext(partial: Partial<ComposeContext> = {}): ComposeContext {
  return {
    body:        "",
    subject:     "",
    recipients:  [],
    attachments: [],
    sendHandle:  null,
    ...partial,
  };
}

/** Convenience factory for a minimal AttachmentMeta. */
export function makeAttachmentMeta(
  filename: string,
  content: string = "",
): AttachmentMeta {
  const bytes = new TextEncoder().encode(content);
  return {
    filename,
    sizeBytes: bytes.byteLength,
    mimeType: "text/plain",
    read: async () => bytes.buffer as ArrayBuffer,
  };
}

/* ── FakeEmailProvider ───────────────────────────────────────────── */

export class FakeEmailProvider implements EmailProvider {
  readonly providerId: "gmail" | "outlook";

  private _sendHandlers    = new Set<(ctx: ComposeContext) => Promise<ScanVerdict>>();
  private _inboundHandlers = new Set<(msg: InboundMessage) => Promise<void>>();
  private _available       = true;
  private _unavailableReason: string | undefined = undefined;
  private _unsubCalls      = 0;

  constructor(providerId: "gmail" | "outlook" = "gmail") {
    this.providerId = providerId;
  }

  // ── EmailProvider interface ────────────────────────────────────

  onSend(handler: (ctx: ComposeContext) => Promise<ScanVerdict>): () => void {
    this._sendHandlers.add(handler);
    return () => {
      this._sendHandlers.delete(handler);
      this._unsubCalls++;
    };
  }

  async *listInbound(opts: { sinceMs: number; limit: number }): AsyncIterable<InboundMessage> {
    // No-op generator for MVP; inbound is post-MVP.
    void opts;
    return;
    // Satisfy TypeScript — unreachable but needed for async generator typing.
    yield {} as InboundMessage;
  }

  onInbound(handler: (msg: InboundMessage) => Promise<void>): () => void {
    this._inboundHandlers.add(handler);
    return () => {
      this._inboundHandlers.delete(handler);
      this._unsubCalls++;
    };
  }

  async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    if (!this._available && this._unavailableReason !== undefined) {
      return { available: false, reason: this._unavailableReason };
    }
    return { available: this._available };
  }

  // ── Test helpers ───────────────────────────────────────────────

  /**
   * Trigger all registered `onSend` handlers with the given ComposeContext.
   *
   * Mirrors what the real Gmail content script does when the user clicks Send:
   * calls each registered handler and returns the first blocking verdict
   * (or the last `send` verdict if all allow).
   */
  async _simulateSend(ctx: ComposeContext): Promise<ScanVerdict> {
    let lastVerdict: ScanVerdict = { decision: "send" };
    for (const handler of this._sendHandlers) {
      const v = await handler(ctx);
      lastVerdict = v;
      if (v.decision === "block") return v;
    }
    return lastVerdict;
  }

  /**
   * Trigger all registered `onInbound` handlers with the given message.
   * Used to simulate receiving a new email.
   */
  async _simulateInbound(msg: InboundMessage): Promise<void> {
    for (const handler of this._inboundHandlers) {
      await handler(msg);
    }
  }

  /**
   * Control what `isAvailable()` returns.
   * Pass `true` to restore "available" state (default).
   */
  _setAvailable(available: boolean, reason?: string): void {
    this._available = available;
    this._unavailableReason = reason ?? undefined;
  }

  /** Number of times any unsubscribe function was called (leak detection). */
  get _unsubscribeCallCount(): number {
    return this._unsubCalls;
  }

  /** Number of currently active `onSend` subscriptions. */
  get _sendSubscriptionCount(): number {
    return this._sendHandlers.size;
  }

  /** Number of currently active `onInbound` subscriptions. */
  get _inboundSubscriptionCount(): number {
    return this._inboundHandlers.size;
  }

  /** Clear all state between tests. */
  _reset(): void {
    this._sendHandlers.clear();
    this._inboundHandlers.clear();
    this._available = true;
    this._unavailableReason = undefined;
    this._unsubCalls = 0;
  }
}
