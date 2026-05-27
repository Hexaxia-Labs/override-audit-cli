import type { Severity } from '../types.js';
import type { LogLevel } from '../logging/change-control.js';

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export interface ParsedArgs {
  path?: string;
  json: boolean;
  severity: Severity;
  ruleFilters: Map<string, boolean>;
  includeSubSuspect: boolean;
  help: boolean;
  version: boolean;
  noColor: boolean;
  /** Enable OA007 frozen-latest registry check (opt-in network). */
  withRegistry: boolean;
  /** Registry timeout in ms (used with --with-registry). */
  registryTimeoutMs?: number;
  /** Apply RFC 6902 patches from detector findings and rewrite package.json. */
  fix: boolean;
  /** With --fix: report what would happen without writing to disk. */
  dryRun: boolean;
  /** With --fix: skip the post-fix rescan. */
  noPostFixRescan: boolean;
  /** Externally-supplied attempt id. Replaces the auto-generated one. */
  attemptId?: string;
  /** What initiated the run (e.g. "ci", "manual", "scheduled"). */
  source?: string;
  /** Advisory id this run is addressing (e.g. "GHSA-xxxx-..."). */
  advisory?: string;
  /** Repeatable key=value metadata; threaded onto remediation_attempt. */
  meta?: Record<string, string>;
  /** Path to NDJSON change-control log file. */
  logFile?: string;
  /** Minimum log level for the change-control file. Default 'info'. */
  logLevel?: LogLevel;
}

const VALID_SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const VALID_LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
// v0.3.0 brings the HexOps change-control logging flags online. --no-install
// remains reserved (auto-install after --fix is a v0.3.x decision).
const RESERVED_FUTURE = new Set(['--no-install']);

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    json: false, severity: 'low', ruleFilters: new Map(),
    includeSubSuspect: false, help: false, version: false, noColor: false,
    withRegistry: false,
    fix: false, dryRun: false, noPostFixRescan: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;

    if (RESERVED_FUTURE.has(a)) {
      throw new UsageError(`Flag ${a} is reserved for a future release (post-v0.3.0). See README for roadmap.`);
    }

    if (a === '-h' || a === '--help') { out.help = true; continue; }
    if (a === '-V' || a === '--version') { out.version = true; continue; }
    if (a === '--json') { out.json = true; continue; }
    if (a === '--no-color') { out.noColor = true; continue; }
    if (a === '--include-sub-suspect') { out.includeSubSuspect = true; continue; }
    if (a === '--with-registry') { out.withRegistry = true; continue; }
    if (a === '--fix') { out.fix = true; continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
    if (a === '--no-post-fix-rescan') { out.noPostFixRescan = true; continue; }

    if (a === '--attempt-id') {
      const v = argv[++i];
      if (!v) throw new UsageError('--attempt-id expects a value');
      out.attemptId = v;
      continue;
    }
    if (a === '--source') {
      const v = argv[++i];
      if (!v) throw new UsageError('--source expects a value (e.g. "ci", "manual")');
      out.source = v;
      continue;
    }
    if (a === '--advisory') {
      const v = argv[++i];
      if (!v) throw new UsageError('--advisory expects a value (e.g. "GHSA-xxxx-...")');
      out.advisory = v;
      continue;
    }
    if (a === '--meta') {
      const v = argv[++i];
      if (!v) throw new UsageError('--meta expects key=value');
      const eq = v.indexOf('=');
      if (eq === -1) throw new UsageError(`--meta expects key=value, got ${JSON.stringify(v)}`);
      out.meta = out.meta ?? {};
      out.meta[v.slice(0, eq)] = v.slice(eq + 1);
      continue;
    }
    if (a === '--log-file') {
      const v = argv[++i];
      if (!v) throw new UsageError('--log-file expects a path');
      out.logFile = v;
      continue;
    }
    if (a === '--log-level') {
      const v = argv[++i];
      if (!v || !VALID_LOG_LEVELS.includes(v as LogLevel)) {
        throw new UsageError(`--log-level expects one of ${VALID_LOG_LEVELS.join('|')}, got ${JSON.stringify(v)}`);
      }
      out.logLevel = v as LogLevel;
      continue;
    }

    if (a === '--registry-timeout') {
      const v = argv[++i];
      const n = v ? Number(v) : NaN;
      if (!Number.isFinite(n) || n <= 0) {
        throw new UsageError(`--registry-timeout expects a positive number of milliseconds, got ${JSON.stringify(v)}`);
      }
      out.registryTimeoutMs = n;
      continue;
    }

    if (a === '--severity') {
      const v = argv[++i];
      if (!v || !VALID_SEVERITIES.includes(v as Severity)) {
        throw new UsageError(`--severity expects one of ${VALID_SEVERITIES.join('|')}, got ${JSON.stringify(v)}`);
      }
      out.severity = v as Severity;
      continue;
    }

    if (a === '--rule') {
      const v = argv[++i];
      if (!v) throw new UsageError('--rule expects a value like "OA002" or "OA005.e=off"');
      const eq = v.indexOf('=');
      const id = eq === -1 ? v : v.slice(0, eq);
      const state = eq === -1 ? true : v.slice(eq + 1) !== 'off';
      out.ruleFilters.set(id, state);
      continue;
    }

    if (a.startsWith('--')) {
      throw new UsageError(`Unknown flag: ${a}`);
    }

    if (out.path !== undefined) {
      throw new UsageError(`Multiple positional paths given: ${out.path} and ${a}`);
    }
    out.path = a;
  }

  return out;
}
