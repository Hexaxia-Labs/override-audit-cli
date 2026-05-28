import { appendFileSync, openSync, closeSync } from 'fs';
import type { RuleId, SubRuleId, RFC6902Patch } from '../types.js';

/**
 * Change-control logging for HexOps integration.
 *
 * The fix lifecycle emits a sequence of structured records. Each record is one
 * line of JSON (NDJSON / JSON Lines), appended to a log file. HexOps consumes
 * the stream to thread remediation attempts through its audit trail.
 *
 * Record sequence per `--fix` run:
 *   1. remediation_attempt    — once at the start, with context (source, advisory, meta).
 *   2. remediation_applied    — per successful patch application.
 *   3. remediation_failed     — per patch application error.
 *   4. remediation_skipped    — per finding that didn't qualify (suggest-only, below floor, filtered).
 *   5. remediation_complete   — once at the end with totals.
 *
 * Detect-only runs (no --fix) emit nothing. The logger is a no-op when
 * --log-file isn't passed.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface RecordBase {
  type: string;
  attemptId: string;
  timestamp: string;
  tool: 'override-audit-cli';
  toolVersion: string;
  level: LogLevel;
}

export interface RemediationAttempt extends RecordBase {
  type: 'remediation_attempt';
  projectPath: string;
  source?: string;
  advisory?: string;
  meta?: Record<string, string>;
  dryRun: boolean;
}

export interface RemediationApplied extends RecordBase {
  type: 'remediation_applied';
  ruleId: RuleId;
  subRuleId?: SubRuleId;
  package: string;
  patches: RFC6902Patch[];
}

export interface RemediationSkipped extends RecordBase {
  type: 'remediation_skipped';
  ruleId: RuleId;
  subRuleId?: SubRuleId;
  package: string;
  reason: string;
}

export interface RemediationFailed extends RecordBase {
  type: 'remediation_failed';
  ruleId: RuleId;
  subRuleId?: SubRuleId;
  package: string;
  error: string;
}

export interface RemediationComplete extends RecordBase {
  type: 'remediation_complete';
  summary: {
    applied: number;
    skipped: number;
    failed: number;
    remainingFindings: number | null;   // null when rescan skipped
    newFindings: number;
  };
  exitCode: 0 | 1 | 2;
}

export type ChangeControlRecord =
  | RemediationAttempt
  | RemediationApplied
  | RemediationSkipped
  | RemediationFailed
  | RemediationComplete;

export interface ChangeControlLogger {
  log(record: ChangeControlRecord): void;
  close(): void;
}

/** Logger that drops every record. Default when --log-file is omitted. */
export class NullLogger implements ChangeControlLogger {
  log(_record: ChangeControlRecord): void { /* noop */ }
  close(): void { /* noop */ }
}

/**
 * Append-only NDJSON file logger. Opens the file once, appends one line
 * per record, closes on demand. Filters by level — records below the
 * threshold are dropped silently.
 */
export class FileLogger implements ChangeControlLogger {
  private readonly fd: number;
  constructor(
    private readonly path: string,
    private readonly threshold: LogLevel = 'info',
  ) {
    this.fd = openSync(path, 'a');
  }
  log(record: ChangeControlRecord): void {
    if (LEVEL_RANK[record.level] < LEVEL_RANK[this.threshold]) return;
    appendFileSync(this.fd, JSON.stringify(record) + '\n');
  }
  close(): void {
    try { closeSync(this.fd); } catch { /* swallow */ }
  }
}

/**
 * In-memory logger for tests. Captures every record (including those that a
 * level filter would drop, for test introspection of the unfiltered stream).
 */
export class MemoryLogger implements ChangeControlLogger {
  readonly records: ChangeControlRecord[] = [];
  log(record: ChangeControlRecord): void { this.records.push(record); }
  close(): void { /* noop */ }
}

/** Default rank-based severity for each record type. */
export function defaultLevel(type: ChangeControlRecord['type']): LogLevel {
  switch (type) {
    case 'remediation_failed': return 'error';
    case 'remediation_skipped': return 'info';
    default: return 'info';
  }
}
