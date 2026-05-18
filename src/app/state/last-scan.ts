/**
 * Last-scan state — shared signal so Dashboard and Scan tab can both read
 * the most recent scan summary without prop-drilling.
 *
 * Intentionally in-memory only. Constitution §I: scan results are not
 * persisted unless the user explicitly exports them.
 */
import { signal } from "@preact/signals";

export interface LastScanSummary {
  score:         number;
  totalFindings: number;
  critical:      number;
  warning:       number;
  info:          number;
  byCategory:    Record<string, number>;
  sourceLabel:   string;
  durationMs:    number;
  at:            number; // epoch ms
}

export const lastScanSummary = signal<LastScanSummary | null>(null);

export function clearLastScan(): void {
  lastScanSummary.value = null;
}
