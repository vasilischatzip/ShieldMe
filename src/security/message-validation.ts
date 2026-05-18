/**
 * Postmessage / runtime-message validation — C-CS-4.
 *
 * All chrome.runtime.sendMessage payloads are typed and validated by valibot
 * schemas before being processed. This module provides the validation helpers
 * and the canonical MessageEnvelope schema.
 *
 * Motivation (security-controls.md C-CS-4):
 *   Process isolation (L4) means messages cross world boundaries. Any message
 *   from a content script, popup, or offscreen document must be validated
 *   before the receiver acts on it. An unvalidated message from a compromised
 *   or spoofed sender could trigger unintended state changes.
 *
 * Design choices:
 *   - valibot is used for schema validation (compact bundle, MIT licensed).
 *   - validateMessage never throws; it returns a typed discriminated union.
 *   - MessageEnvelope is the minimal wrapper all messages must satisfy:
 *     { type: string, payload: unknown }. Callers layer a payload schema on top.
 *
 * Constitution §VIII (Zero Runtime External Dependencies):
 *   valibot is bundled at build time.
 */

import * as v from "valibot";

/* ── Re-exports ─────────────────────────────────────────────────── */

/**
 * Re-export of valibot's BaseSchema type alias.
 * Callers use this as the schema type parameter for validateMessage.
 */
export type MessageSchema<T> = v.BaseSchema<unknown, T, v.BaseIssue<unknown>>;

/* ── Validation result ──────────────────────────────────────────── */

/** Discriminated union result from validateMessage. Never throws. */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

/* ── Core validator ─────────────────────────────────────────────── */

/**
 * Validate an unknown input against a valibot schema.
 *
 * Returns `{ ok: true, value }` on success or `{ ok: false, errors }` on
 * failure. Never throws — all error paths are captured in the return value.
 *
 * @param schema  - A valibot schema describing the expected shape.
 * @param input   - The unknown value to validate (e.g., a runtime message payload).
 */
export function validateMessage<T>(
  schema: MessageSchema<T>,
  input: unknown,
): ValidationResult<T> {
  const result = v.safeParse(schema, input);
  if (result.success) {
    return { ok: true, value: result.output };
  }
  const flat = v.flatten(result.issues);
  const nestedErrors = flat.nested ?? {};
  const allErrors: string[] = [];
  if (flat.root) {
    allErrors.push(...flat.root);
  }
  for (const [field, msgs] of Object.entries(nestedErrors)) {
    if (msgs) {
      allErrors.push(...msgs.map((m) => `${field}: ${m}`));
    }
  }
  return { ok: false, errors: allErrors.length > 0 ? allErrors : ["Validation failed"] };
}

/* ── MessageEnvelope schema ─────────────────────────────────────── */

/**
 * Canonical envelope that every chrome.runtime message must satisfy.
 *
 * Shape: { type: string, payload: unknown }
 *
 * `type` is the discriminator for the message kind (e.g., "SCAN_REQUEST").
 * `payload` is opaque at this level; callers validate it with a second schema.
 *
 * All messages arriving in background, content, popup, or offscreen contexts
 * are validated against this schema before dispatch.
 */
export const MessageEnvelope = v.object({
  type: v.string(),
  payload: v.unknown(),
});

/** Inferred TypeScript type of a MessageEnvelope. */
export type MessageEnvelopeType = v.InferOutput<typeof MessageEnvelope>;
