# Contract — Detection Engine

**Consumers:** Document Check (Module 2), Email Guardian (Module 3), Drive Audit cross-reference (Module 4), Custom Rules.

All interfaces in TypeScript. Implementations in `src/detectors/` and `src/core/`.

---

## Detector

ShieldMe's detection model is **Purview-derived in shape, consumer-tuned in values**. We adopt Microsoft Purview's confidence-level taxonomy (`High` / `Medium` / `Low`), proximity-window structure, and instance-count thresholds, while overriding the numeric values per detector to favor lower false-positive rates than Purview's enterprise defaults.

**Authoritative cross-reference:** every detector in [`docs/detector-catalog.md`](../../../docs/detector-catalog.md) declares the Purview SIT it derives from (or `none` if ShieldMe-original). The Purview parity scorecard in §11 of that file tracks coverage drift quarterly.

```ts
export type Severity = "critical" | "warning" | "info";
export type Confidence = number; // 0..1
/** Purview-aligned confidence buckets; computed from `Confidence` numeric. */
export type ConfidenceLevel = "high" | "medium" | "low";

export type Finding = {
  detectorId: DetectorId;
  categoryId: CategoryId;
  severity: Severity;
  confidence: Confidence;
  match: {
    /** NEVER log or persist this; in-memory only */
    value: string;
    /** 0-based index into normalized input */
    start: number;
    end: number;
    /** provenance hints for reports */
    page?: number;
    cell?: string;
    line?: number;
  };
  contextSnippet: string;         // ±60 chars, redacted value replaced with "•••"
  locale?: string;                // e.g. "el-GR" if country-specific
};

export type DetectorContext = {
  locale: string;
  text: string;                   // normalized text
  offsetMap?: OffsetMap;          // maps normalized offsets → source page/cell/line
  activeCustomRules: CustomRule[];
  clock: Clock;                   // injected for tests
};

export type ShipTier = "ga" | "beta" | "planned";

export interface Detector {
  readonly id: DetectorId;
  readonly categoryId: CategoryId;
  /** ISO-3166-1 alpha-2, "eu", or "global". */
  readonly region: LocaleTag;
  /** Display tier controls UI visibility. "planned" detectors MUST NOT be registered in production. */
  readonly shipTier: ShipTier;
  /** Optional user-locale gate (separate from region — e.g. a detector may be region="global"
   *  but `requiresLocales: ["en"]` if its positive-keyword list is English-only). */
  readonly requiresLocales?: string[];

  /** Purview-aligned threshold model. Every detector MUST declare these.
   *  Defaults are conservative (favor low FPR over high recall). */
  readonly thresholds: DetectorThresholds;

  /** Provenance — the Microsoft Purview SIT this derives from, or "none" for ShieldMe-original. */
  readonly purviewSit: string | "none";

  /** pure function; deterministic given context */
  scan(ctx: DetectorContext): Finding[];
}

export type DetectorThresholds = {
  /** Confidence floor required for the bucket. Per-detector override of the global floors below. */
  highConfidence: number;          // typical 0.85
  mediumConfidence: number;        // typical 0.70
  /** Below mediumConfidence is dropped (returned as "low" only when explicitly requested by registry). */

  /** Proximity-window for context scoring. Purview uses 300 chars; ShieldMe defaults to 60. */
  proximityCharsBefore: number;
  proximityCharsAfter: number;

  /** Supporting-keyword counts required to graduate confidence levels.
   *  Mirrors Purview's "supportingPatternsToCount" + "patternsProximity". */
  positiveKeywordsRequiredForHigh: number;     // typical 1
  positiveKeywordsRequiredForMedium: number;   // typical 0
  negativeKeywordsCancelHigh: number;          // typical 1 ("example", "test")

  /** Instance-count threshold — how many distinct matches in the same scan
   *  graduate severity. E.g. one IBAN = warning, three IBANs = critical. */
  instanceCountForCritical?: number;
};

/** Global floors applied if a detector forgets to override. */
export const DEFAULT_THRESHOLDS: DetectorThresholds = {
  highConfidence: 0.85,
  mediumConfidence: 0.70,
  proximityCharsBefore: 60,
  proximityCharsAfter: 60,
  positiveKeywordsRequiredForHigh: 1,
  positiveKeywordsRequiredForMedium: 0,
  negativeKeywordsCancelHigh: 1,
};

/** Severity mapping from confidence + instance count + detector category default.
 *  Implemented in src/core/severity.ts; pure function. */
export type SeverityResolver = (
  confidence: ConfidenceLevel,
  instanceCount: number,
  categoryDefault: Severity,
  thresholds: DetectorThresholds,
) => Severity;
```

**Purity:** No I/O, no `chrome.*`, no clock access outside `ctx.clock`. Makes every detector trivially unit-testable.

## Registry

```ts
export interface DetectorRegistry {
  all(): Detector[];
  byCategory(cat: CategoryId): Detector[];
  byRegion(region: LocaleTag): Detector[];
  byShipTier(tier: ShipTier): Detector[];
  /** Effective set of detectors for a scan, after applying:
   *   - category.enabled
   *   - per-detector state in category.detectors
   *   - rules.includeBetaDetectors (Beta-tier filtered out if false)
   *   - locale / region match
   */
  active(rules: Rules, locale: string): Detector[];
  register(d: Detector): void;    // used by detector modules at load time
}
```

A single registry lives in `src/detectors/registry.ts`. Detectors register themselves via side-effectful `register(...)` calls in their module; dynamic `import()` triggers registration. `register()` MUST reject any detector with `shipTier === "planned"`.

## PresetResolver

Applies Protection Presets (see [docs/protection-presets.md](../../../docs/protection-presets.md)) to the `Rules` entity. Pure and synchronous.

```ts
export type PresetId = string;
export type LocaleTag = string; // ISO-3166-1 alpha-2 | "eu" | "global"

export type PresetDefinition = {
  id: PresetId;
  version: number;
  titleI18nKey: string;
  descriptionI18nKey: string;
  locale: LocaleTag;
  shipTier: ShipTier;
  sourceNote: string;             // human-readable provenance (not shown in UI)
  categories: Partial<Record<CategoryId, { enabled: boolean }>>;
  /** Detector IDs the preset wants enabled (true) or explicitly disabled (false). */
  detectors: Record<DetectorId, boolean>;
};

export type PresetDiff = {
  categoriesEnabled: CategoryId[];
  categoriesDisabled: CategoryId[];
  detectorsEnabled: DetectorId[];
  detectorsDisabled: DetectorId[];
  /** Consumer-friendly labels, resolved from i18n + detector catalog at render time. */
  humanReadable: {
    added: string[];              // e.g. "Greek Tax ID (ΑΦΜ)", "Greek passport"
    removed: string[];
  };
};

export interface PresetResolver {
  /** Load a preset definition by ID. Throws if ID is unknown. */
  get(id: PresetId): PresetDefinition;

  /** All presets known at build time, for UI listing. */
  list(): PresetDefinition[];

  /** Compute — don't apply — the diff from applying a preset to current rules. */
  preview(preset: PresetDefinition, rules: Rules): PresetDiff;

  /** Apply a preset. Returns a new Rules (immutable style) and updated snapshot. */
  apply(
    preset: PresetDefinition,
    rules: Rules,
    snapshot: PresetSnapshot,
  ): { rules: Rules; snapshot: PresetSnapshot; diff: PresetDiff };

  /** Reverse a previously applied preset. Leaves detectors that are still referenced
   *  by other active presets (refCount > 1 before unapply) enabled. Manual overrides
   *  in `rules.manualOverrides.enabled` are never cleared. */
  unapply(
    presetId: PresetId,
    rules: Rules,
    snapshot: PresetSnapshot,
  ): { rules: Rules; snapshot: PresetSnapshot; diff: PresetDiff };

  /** Called when the user flips an individual toggle AFTER a preset is applied.
   *  Records the intent in `rules.manualOverrides` so future preset apply/unapply
   *  cycles don't clobber it. */
  recordManualOverride(
    rules: Rules,
    detectorId: DetectorId,
    enabled: boolean,
  ): Rules;
}
```

**Contract rules:**
- `apply` is idempotent — applying the same preset twice yields the same `Rules` + `PresetSnapshot` and a `diff` with empty arrays the second time.
- `apply` never downgrades an enabled category or detector that another active preset still wants on (union semantics).
- `apply` never mutates its inputs; callers persist the returned values.
- `preview` runs in ≤10 ms for any preset.
- `unapply` must satisfy: for every detector `d` previously enabled only by preset `p`, after `unapply(p)` `rules.categories[d.categoryId].detectors[d] === false` unless `d ∈ rules.manualOverrides.enabled`.
- `recordManualOverride` is the *only* supported way for UI code to mutate individual detector state while preserving preset correctness.
- All preset definitions are frozen JSON loaded from `src/data/presets/*.json` at build time. `scripts/verify-presets.mjs` asserts every `detectors[id]` references a registered detector whose `shipTier ∈ {"ga","beta"}`.

## ScanEngine

```ts
export type ScanRequest = {
  module: "document-check" | "email-guardian";
  source: {
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
    text: string;                 // already-extracted
    offsetMap?: OffsetMap;
  };
  locale: string;
  activeRules: Rules;
  clock: Clock;
};

export type ScanResult = {
  findings: Finding[];
  score: number;                   // 0..100
  durationMs: number;
  detectorRunId: string;           // ULID — for debugging, not persisted
};

export interface ScanEngine {
  scan(req: ScanRequest): Promise<ScanResult>;
}
```

**Contract:**
- `scan` completes in ≤50 ms / 10,000 chars on mid-range hardware (NFR-P2 derivative).
- `findings` sorted by severity, then confidence desc.
- No finding with confidence <0.5 is returned (dropped as noise).
- `durationMs` is wall-clock; used for perf benchmark tests.

## Validators (per detector family)

```ts
// Pure functions. One per scheme.
export type Validator<T = string> = (candidate: T) => boolean;

// Concrete:
export const luhn: Validator;
export const ibanMod97: Validator;
export const afmChecksum: Validator;       // Greek Tax ID
export const nifSpain: Validator;
export const nifPortugal: Validator;
export const codiceFiscale: Validator;
export const ssnBlacklist: Validator;      // US SSN SSA-invalid area numbers
```

## Context Scorer

```ts
export type ContextScorerConfig = {
  positiveKeywords: string[];     // raise confidence
  negativeKeywords: string[];     // lower confidence (e.g. "example", "test")
  window: number;                 // char count each side
};

export interface ContextScorer {
  score(ctx: DetectorContext, match: { start: number; end: number }, cfg: ContextScorerConfig): Confidence;
}
```

## OffsetMap

```ts
export type OffsetMap = {
  toSource(normalizedOffset: number): SourceLocation;
};
export type SourceLocation =
  | { kind: "pdf"; page: number; charOnPage: number }
  | { kind: "docx"; paragraph: number; charInParagraph: number }
  | { kind: "xlsx"; sheet: string; row: number; column: string }
  | { kind: "text"; line: number; col: number };
```

Produced by each parser. ScanEngine injects into every `Finding` via detector `ctx.offsetMap`.

## Share Card Projection

```ts
export type ShareCardProps = {
  score: number;
  criticalCount: number;
  warningCount: number;
  url: string;
};
```

Only these four fields may be passed to the share card renderer. Renderer is type-safe; test `AC-D4` regression-scans the rendered image to prove no PII leaks.

## Error Model

```ts
export type DetectionError =
  | { kind: "unsupported-locale"; locale: string }
  | { kind: "invalid-custom-rule"; ruleId: string; reason: string }
  | { kind: "engine-timeout"; limitMs: number };
```

Never throw raw `Error`; always a typed union. UI surfaces each kind with dedicated copy.

## Purview alignment notes

1. **Confidence-level mapping.** Purview emits High / Medium / Low; ShieldMe normalizes to the same buckets via per-detector thresholds. UI surfaces severity (`Critical` / `Warning` / `Info`), which is computed from `(confidence, instanceCount, categoryDefault)` by `SeverityResolver`. Never expose Purview-internal terms in UI per Constitution §IV.
2. **Supporting patterns / keyword evidence.** Purview's `Pattern.confidenceLevel` rises when supporting patterns appear in proximity. ShieldMe replicates this via `positiveKeywordsRequiredForHigh` / `…ForMedium` per detector. Keyword lists per detector live in `src/detectors/<category>/<detector>/keywords.ts` and are co-versioned with the detector.
3. **Instance-count promotion.** Purview policies often define `minCount` for actions; ShieldMe uses `instanceCountForCritical` to elevate severity from Warning → Critical when many matches appear in one scan (e.g., a payroll spreadsheet with 50 SSNs is qualitatively different from a single SSN in a tax form).
4. **Proximity windows.** Purview's default is 300 chars; ShieldMe defaults to 60 because false-positive cost is higher in consumer scenarios. Per-detector override allowed when a SIT explicitly needs a wider window (e.g., bank-account-context patterns referencing routing numbers in a separate paragraph).
5. **What we cannot replicate.** Purview's `Trainable Classifiers` are ML-trained on Microsoft's private corpus. ShieldMe will not ship a binary equivalent in v1.0. Deferred to a research stub (see [research.md R32](../research.md#r32-trainable-classifier-replacement)).
