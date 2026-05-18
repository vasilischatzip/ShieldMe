/**
 * Tests for postmessage / runtime-message validation — C-CS-4.
 *
 * Covers: valid envelope accepted, missing `type` rejected, non-object input
 * rejected, type-mismatch payload (with caller-supplied payload schema) rejected,
 * null/undefined inputs handled without thrown exceptions.
 */
import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  validateMessage,
  MessageEnvelope,
  type ValidationResult,
  type MessageSchema,
} from "~/security/message-validation";

/* ── Suite ──────────────────────────────────────────────────────── */

describe("validateMessage + MessageEnvelope (C-CS-4)", () => {

  // ── MessageEnvelope: valid ─────────────────────────────────────

  it("accepts a valid envelope with type and payload", () => {
    const input = { type: "SCAN_REQUEST", payload: { fileId: "abc" } };
    const result = validateMessage(MessageEnvelope, input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("SCAN_REQUEST");
      expect(result.value.payload).toEqual({ fileId: "abc" });
    }
  });

  it("accepts an envelope with a null payload", () => {
    const input = { type: "PING", payload: null };
    const result = validateMessage(MessageEnvelope, input);

    expect(result.ok).toBe(true);
  });

  it("accepts an envelope with a string payload", () => {
    const result = validateMessage(MessageEnvelope, { type: "ACK", payload: "ok" });
    expect(result.ok).toBe(true);
  });

  // ── MessageEnvelope: missing required fields ───────────────────

  it("rejects envelope missing 'type' field", () => {
    const result = validateMessage(MessageEnvelope, { payload: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects envelope where 'type' is not a string", () => {
    const result = validateMessage(MessageEnvelope, { type: 42, payload: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects envelope missing both fields", () => {
    const result = validateMessage(MessageEnvelope, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  // ── Non-object inputs ──────────────────────────────────────────

  it("rejects a null input without throwing", () => {
    const result = validateMessage(MessageEnvelope, null);

    expect(result.ok).toBe(false);
    expect(() => validateMessage(MessageEnvelope, null)).not.toThrow();
  });

  it("rejects an undefined input without throwing", () => {
    const result = validateMessage(MessageEnvelope, undefined);

    expect(result.ok).toBe(false);
    expect(() => validateMessage(MessageEnvelope, undefined)).not.toThrow();
  });

  it("rejects a string input without throwing", () => {
    const result = validateMessage(MessageEnvelope, "raw string message");

    expect(result.ok).toBe(false);
    expect(() => validateMessage(MessageEnvelope, "raw string message")).not.toThrow();
  });

  it("rejects a number input without throwing", () => {
    const result = validateMessage(MessageEnvelope, 42);

    expect(result.ok).toBe(false);
  });

  it("rejects an array input without throwing", () => {
    const result = validateMessage(MessageEnvelope, ["type", "payload"]);

    expect(result.ok).toBe(false);
  });

  // ── Typed payload schema (caller-supplied) ─────────────────────

  it("validates a nested payload schema — accepts matching structure", () => {
    const ScanRequestSchema = v.object({
      type: v.literal("SCAN_REQUEST"),
      payload: v.object({
        fileId: v.string(),
        mimeType: v.string(),
      }),
    });

    const input = { type: "SCAN_REQUEST", payload: { fileId: "abc123", mimeType: "application/pdf" } };
    const result = validateMessage(ScanRequestSchema, input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.payload.fileId).toBe("abc123");
    }
  });

  it("rejects payload that fails nested schema", () => {
    const ScanRequestSchema = v.object({
      type: v.literal("SCAN_REQUEST"),
      payload: v.object({
        fileId: v.string(),
        mimeType: v.string(),
      }),
    });

    // payload is missing mimeType
    const input = { type: "SCAN_REQUEST", payload: { fileId: "abc123" } };
    const result = validateMessage(ScanRequestSchema, input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects payload with wrong literal type", () => {
    const PingSchema = v.object({
      type: v.literal("PING"),
      payload: v.unknown(),
    });

    const result = validateMessage(PingSchema, { type: "PONG", payload: null });

    expect(result.ok).toBe(false);
  });

  // ── Error messages are non-empty strings ───────────────────────

  it("returns non-empty error strings on failure", () => {
    const result = validateMessage(MessageEnvelope, null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.every((e) => typeof e === "string" && e.length > 0)).toBe(true);
    }
  });

  // ── validateMessage return type never throws ───────────────────

  it("validateMessage with a custom schema never throws on any input", () => {
    const schema: MessageSchema<{ x: number }> = v.object({ x: v.number() });
    const inputs = [null, undefined, "", 0, false, [], {}, { x: "not-a-number" }];

    for (const input of inputs) {
      expect(() => validateMessage(schema, input)).not.toThrow();
    }
  });

  // ── Valid envelope result shape ────────────────────────────────

  it("ok: true result has no 'errors' property on the type", () => {
    const result: ValidationResult<{ type: string; payload: unknown }> =
      validateMessage(MessageEnvelope, { type: "X", payload: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // TypeScript ensures .errors is not accessible; runtime check for extra safety
      expect("errors" in result).toBe(false);
    }
  });

  it("ok: false result has no 'value' property on the type", () => {
    const result: ValidationResult<{ type: string; payload: unknown }> =
      validateMessage(MessageEnvelope, null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect("value" in result).toBe(false);
    }
  });
});
