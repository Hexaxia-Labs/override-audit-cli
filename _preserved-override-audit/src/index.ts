// Public library entry for embedders.
//
// Scope: covers everything `docs/architecture.md` and the README's "Programmatic usage"
// section document. Anything not re-exported here is considered internal and may change
// without a major-version bump.

// Core API
export { scan } from './scanner.js';
export type { ScanOptions } from './scanner.js';
export { fix } from './fixer/fix.js';
export type { FixLoggingContext } from './fixer/fix.js';

// RFC 6902 fixer primitives (for advanced consumers that want to apply patches
// without re-running scan, or that need format-preserving writes).
export { applyPatches, PatchApplicationError } from './fixer/apply.js';
export { detectIndent, hasTrailingNewline, writePackageJson } from './fixer/write.js';
export { jsonPointer, escapeSegment } from './fixer/json-pointer.js';

// Change-control logging
export {
  FileLogger, NullLogger, MemoryLogger, defaultLevel,
} from './logging/change-control.js';
export type {
  ChangeControlLogger, ChangeControlRecord, LogLevel,
  RemediationAttempt, RemediationApplied, RemediationFailed,
  RemediationSkipped, RemediationComplete, RecordBase,
} from './logging/change-control.js';

// Registry client (opt-in network for OA007)
export { fetchDistTags, fetchDistTagsBatch } from './parsers/registry.js';
export type { RegistryClientOptions } from './parsers/registry.js';

// Parser-level errors (for embedders that catch them specifically)
export { UnsupportedPackageManagerError } from './parsers/package-manager.js';
export { MalformedPackageJsonError } from './parsers/package-json.js';

// All types from the shared contract
export type {
  Finding,
  OverrideAuditOutput,
  Context,
  Severity,
  PackageManager,
  RuleId,
  SubRuleId,
  RemediationAction,
  Remediation,
  RFC6902Patch,
  Summary,
  OverrideEntry,
  OverrideValue,
  ScanResult,
  InstalledCopy,
  ParentDeclaration,
  RegistryDistTags,
  FixReport,
  FixOptions,
  AppliedPatch,
  SkippedForFix,
} from './types.js';
export { SEVERITY_RANK } from './types.js';
