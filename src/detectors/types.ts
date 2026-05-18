/**
 * Detection Engine shared types — sourced from contracts/detection-engine.md.
 *
 * ALL interfaces here are pure; no I/O, no chrome.* usage. Implementations
 * are tested to enforce this invariant.
 */
import type { CategoryId } from "~/core/rules";

/* ── Primitives ──────────────────────────────────────────────── */

export type DetectorId = string;
export type LocaleTag = string; // ISO-3166-1 alpha-2 | "eu" | "global"
export type Severity = "critical" | "warning" | "info";
export type Confidence = number; // 0..1
export type ShipTier = "ga" | "beta" | "planned";

/* ── Finding ─────────────────────────────────────────────────── */

export type Finding = {
  detectorId: DetectorId;
  categoryId: CategoryId;
  severity: Severity;
  confidence: Confidence;
  match: {
    /** NEVER log or persist this; in-memory only. */
    value: string;
    /** 0-based index into normalized input. */
    start: number;
    end: number;
    page?: number;
    cell?: string;
    line?: number;
  };
  /** ±60 chars, detected value replaced with "•••" — safe to display. */
  contextSnippet: string;
  /** e.g. "el-GR" if country-specific. */
  locale?: string;
};

/* ── OffsetMap ────────────────────────────────────────────────── */

export type SourceLocation =
  | { kind: "pdf"; page: number; charOnPage: number }
  | { kind: "docx"; paragraph: number; charInParagraph: number }
  | { kind: "xlsx"; sheet: string; row: number; column: string }
  | { kind: "text"; line: number; col: number };

export type OffsetMap = {
  toSource(normalizedOffset: number): SourceLocation;
};

/* ── CustomRule ─────────────────────────────────────────────────
 * A user-authored detection rule.
 *   kind "keyword" — case-insensitive literal string search.
 *   kind "pattern" — user-supplied regex, validated against ReDoS before use.
 */
export type CustomRule = {
  id: string;
  /** Matching mode. */
  kind: "keyword" | "pattern";
  /** For "keyword": the literal term. For "pattern": the regex source string. */
  pattern: string;
  severity: Severity;
  /** Human-readable label shown in the findings list. */
  label: string;
  /** Which consumer category this rule belongs to. Defaults to "myDigitalLife". */
  categoryId?: string;
};

/* ── Clock ──────────────────────────────────────────────────────
 * Injected so detectors remain deterministic and testable.
 */
export type Clock = typeof Date;

/* ── DetectorContext ─────────────────────────────────────────── */

export type DetectorContext = {
  locale: string;
  text: string;                    // normalized text
  offsetMap?: OffsetMap;
  activeCustomRules: CustomRule[];
  clock: Clock;
};

/* ── Detector ────────────────────────────────────────────────── */

export interface Detector {
  readonly id: DetectorId;
  readonly categoryId: CategoryId;
  /** ISO-3166-1 alpha-2, "eu", or "global". */
  readonly region: LocaleTag;
  /** "planned" detectors MUST NOT be registered in production. */
  readonly shipTier: ShipTier;
  /** Optional locale gate (independent of region). */
  readonly requiresLocales?: readonly string[];
  /**
   * Optional hint pattern for single-regex union optimisation (T023b).
   *
   * When provided, the scan engine builds a single alternation regex from all
   * active detectors' hintPatterns and runs it once across the full text.
   * Only detectors whose hintPattern matched in a ±HINT_WINDOW-char region
   * are then invoked, skipping the rest.
   *
   * Detectors without hintPattern always run over the full text (safe default).
   *
   * Contract:
   *   - Must be a global regex (flag "g" set).
   *   - Must be stateless (lastIndex is reset before use).
   *   - Must be a superset of the detector's actual match set
   *     (may have false positives; scan() will filter them).
   */
  readonly hintPattern?: RegExp;
  /** Pure function; deterministic given context. No I/O allowed. */
  scan(ctx: DetectorContext): Finding[];
}

/* ── Rules (summary used by registry — full definition in rules.ts) ── */

export type Rules = {
  categories: Record<CategoryId, boolean>;
  detectors: Record<string, boolean>;
  includeBetaDetectors?: boolean;
};

/* ── DetectorRegistry ────────────────────────────────────────── */

export interface DetectorRegistry {
  all(): Detector[];
  byCategory(cat: CategoryId): Detector[];
  byRegion(region: LocaleTag): Detector[];
  byShipTier(tier: ShipTier): Detector[];
  /** Effective set for a scan, after applying rules + locale + shipTier. */
  active(rules: Rules, locale: string): Detector[];
  /** Side-effectful registration called by detector modules at load time.
   *  Throws if `d.shipTier === "planned"`. */
  register(d: Detector): void;
}

/* ── ScanEngine ─────────────────────────────────────────────── */

export type ScanRequest = {
  module: "document-check" | "email-guardian" | "drive-audit";
  source: {
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
    text: string;
    offsetMap?: OffsetMap;
  };
  locale: string;
  activeRules: Rules;
  clock: Clock;
};

export type ScanResult = {
  findings: Finding[];
  score: number;        // 0..100
  durationMs: number;
  detectorRunId: string; // ULID
};

export interface ScanEngine {
  scan(req: ScanRequest): Promise<ScanResult>;
}

/* ── ContextScorer ──────────────────────────────────────────── */

export type ContextScorerConfig = {
  positiveKeywords: readonly string[];
  negativeKeywords: readonly string[];
  window: number;
};

export interface ContextScorer {
  score(
    ctx: DetectorContext,
    match: { start: number; end: number },
    cfg: ContextScorerConfig,
  ): Confidence;
}

/* ── Error model ────────────────────────────────────────────── */

export type DetectionError =
  | { kind: "unsupported-locale"; locale: string }
  | { kind: "invalid-custom-rule"; ruleId: string; reason: string }
  | { kind: "engine-timeout"; limitMs: number };

/* ── Preset types (forward references for T029b) ─────────────── */

export type PresetId = string;

export type PresetDefinition = {
  id: PresetId;
  version: number;
  titleI18nKey: string;
  descriptionI18nKey: string;
  locale: LocaleTag;
  shipTier: ShipTier;
  sourceNote: string;
  categories: Partial<Record<CategoryId, { enabled: boolean }>>;
  detectors: Record<DetectorId, boolean>;
};

export type PresetDiff = {
  categoriesEnabled: CategoryId[];
  categoriesDisabled: CategoryId[];
  detectorsEnabled: DetectorId[];
  detectorsDisabled: DetectorId[];
  humanReadable: {
    added: string[];
    removed: string[];
  };
};

export type PresetSnapshot = {
  version: 1;
  /** For each active preset, the detector IDs it directly enabled at apply-time. */
  byPreset: Record<PresetId, DetectorId[]>;
  /**
   * Which presets enabled each detector.
   * `detectorRefCount[d].length` is the refcount; unapply only disables d when length drops to 0.
   * Invariant: byPreset[p].includes(d) ⟺ detectorRefCount[d].includes(p).
   */
  detectorRefCount: Record<DetectorId, PresetId[]>;
};

/* ── ShareCard ──────────────────────────────────────────────── */

export type ShareCardProps = {
  score: number;
  criticalCount: number;
  warningCount: number;
  url: string;
};
