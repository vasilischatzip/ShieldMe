/**
 * Plain-text parser — T056.
 *
 * Wraps a raw UTF-8 string with a TextOffsetMap so findings can show
 * precise line + column provenance within a plain-text file.
 *
 * This is the simplest parser: no binary decoding, no external library.
 * The offset map is built directly from the text.
 *
 * Privacy: pure transform, no I/O.
 * Test: tests/unit/parsers/text.spec.ts
 */
import { TextOffsetMap } from "./offset-map";

export interface TxtParseResult {
  /** Full content string (normalised line endings: \r\n → \n). */
  text: string;
  /** Maps text offset → { kind: "text", line, col }. */
  offsetMap: TextOffsetMap;
}

/**
 * Parse a plain-text string, returning the normalised text and an
 * offset map for finding provenance.
 *
 * @param content  Raw UTF-8 text string.
 * @returns        `{ text, offsetMap }`.
 */
export function parseTxt(content: string): TxtParseResult {
  // Normalise Windows line endings so offsets are consistent.
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return { text, offsetMap: new TextOffsetMap(text) };
}
