// Project-wide audit-log event vocabulary. NDJSON stream: one event per line.
// All events share { ts, type, schemaVersion }.

import type { SeverityLabel, ScanSource, ScanMode } from "../types.js";

export const AUDIT_LOG_SCHEMA_VERSION = 1 as const;

export interface AuditEventBase {
  ts: string;                     // ISO-8601
  schemaVersion: typeof AUDIT_LOG_SCHEMA_VERSION;
}

export interface ScanStarted extends AuditEventBase {
  type: "scan.started";
  projectPath: string;
  mode: ScanMode;
  source: ScanSource;
  flags: Record<string, boolean | string>;
}

export interface ScanFinished extends AuditEventBase {
  type: "scan.finished";
  durationMs: number;
  findingsCount: number;
  exitCode: number;
}

export interface CveDetected extends AuditEventBase {
  type: "cve.detected";
  package: { name: string; version: string };
  severity: SeverityLabel;
  cveAliases: string[];
  vulnerabilityIds: string[];
}

export interface CveFixApplied extends AuditEventBase {
  type: "cve.fix.applied";
  package: string;
  fromVersion: string;
  toVersion: string;
  mechanism: string;              // e.g., "direct-upgrade" | "parent-upgrade" | "transitive-resolution"
}

export interface OaDetected extends AuditEventBase {
  type: "oa.detected";
  ruleId: string;                 // OverrideRuleId; widen here to keep audit-log decoupled
  severity: SeverityLabel;
  package: string;
  message: string;
  location?: { file: string; jsonPath?: string };
}

export interface OaFixApplied extends AuditEventBase {
  type: "oa.fix.applied";
  ruleId: string;
  package: string;
  patches: ReadonlyArray<{ op: string; path: string; value?: unknown; from?: string }>;
}

export interface VerifyPassed extends AuditEventBase {
  type: "verify.passed";
  targets: ReadonlyArray<{ name: string; version?: string }>;
}

export interface VerifyFailed extends AuditEventBase {
  type: "verify.failed";
  failures: ReadonlyArray<{
    ruleId: string;
    package: string;
    reason: string;
  }>;
}

export interface ErrorEvent extends AuditEventBase {
  type: "error";
  phase: string;
  message: string;
  stack?: string;
}

export type AuditEvent =
  | ScanStarted
  | ScanFinished
  | CveDetected
  | CveFixApplied
  | OaDetected
  | OaFixApplied
  | VerifyPassed
  | VerifyFailed
  | ErrorEvent;

export type AuditEventType = AuditEvent["type"];
