import type { Severity } from '../types.js';

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
}

const VALID_SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const RESERVED_PLAN2 = new Set([
  '--fix', '--dry-run', '--no-install', '--no-post-fix-rescan',
  '--attempt-id', '--source', '--advisory', '--meta', '--log-file', '--log-level',
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    json: false, severity: 'low', ruleFilters: new Map(),
    includeSubSuspect: false, help: false, version: false, noColor: false,
    withRegistry: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;

    if (RESERVED_PLAN2.has(a)) {
      throw new UsageError(`Flag ${a} is reserved for v0.2.0 (Fix). Detection-only release. See README for roadmap.`);
    }

    if (a === '-h' || a === '--help') { out.help = true; continue; }
    if (a === '-V' || a === '--version') { out.version = true; continue; }
    if (a === '--json') { out.json = true; continue; }
    if (a === '--no-color') { out.noColor = true; continue; }
    if (a === '--include-sub-suspect') { out.includeSubSuspect = true; continue; }
    if (a === '--with-registry') { out.withRegistry = true; continue; }

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
