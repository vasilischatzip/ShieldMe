/**
 * Custom Rules — public API for the detectors/custom module.
 *
 * Usage:
 *   import { createCustomDetector, validateCustomPattern } from "~/detectors/custom";
 *
 * No side effects on import — custom detectors are NOT auto-registered into
 * the global registry.  Callers must register them explicitly after creation
 * (or wire them through the ScanEngine's activeCustomRules channel).
 */
export { createCustomDetector } from "./factory";
export type { DetectorOrError } from "./factory";
export { validateCustomPattern } from "./safe-pattern";
export type { PatternValidationResult } from "./safe-pattern";
