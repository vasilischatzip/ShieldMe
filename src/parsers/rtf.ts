/**
 * RTF stripper — T056.
 *
 * Removes RTF control words and braces, leaving only the visible text.
 * Good enough to surface PII for scanning; not a faithful RTF→text converter.
 *
 * Design:
 *   • Strips \controlword and \controlword-N sequences
 *   • Removes group delimiters { }
 *   • Decodes \'XX hex escapes to a space (simple approximation)
 *   • Collapses runs of whitespace
 *
 * This is intentionally minimal. Accurate RTF conversion requires a full
 * parser; our only goal is not to miss PII hidden in plain Latin text.
 *
 * Privacy: pure string transform, no I/O.
 * Test: tests/unit/parsers/text.spec.ts
 */

/**
 * Strip RTF control sequences and return the visible text content.
 *
 * @param rtf  Raw RTF string (e.g. `{\rtf1\ansi Hello \b World\b0}`)
 * @returns    Plain text with RTF markup removed.
 */
export function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, " ") // \par, \fs24, \b0, etc.
    .replace(/[{}]/g, "")                  // group delimiters
    .replace(/\\\\/g, "\\")               // escaped backslash
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")   // \'XX hex escapes → space
    .replace(/\s+/g, " ")                 // collapse whitespace
    .trim();
}
