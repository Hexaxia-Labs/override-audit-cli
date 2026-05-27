// Public library entry. Re-exports kept minimal in v0.1.0 — detect-only API.
export { scan } from './scanner.js';
export type {
  Finding,
  OverrideAuditOutput,
  Context,
  Severity,
  PackageManager,
  RuleId,
} from './types.js';
