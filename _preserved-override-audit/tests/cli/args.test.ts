import { parseArgs, UsageError } from '../../src/cli/args.js';

describe('parseArgs', () => {
  it('defaults: no path, no flags', () => {
    const r = parseArgs([]);
    expect(r.path).toBeUndefined();
    expect(r.json).toBe(false);
    expect(r.severity).toBe('low');
    expect(r.help).toBe(false);
  });

  it('positional path', () => {
    expect(parseArgs(['/p']).path).toBe('/p');
  });

  it('--json', () => {
    expect(parseArgs(['--json']).json).toBe(true);
  });

  it('--severity', () => {
    expect(parseArgs(['--severity', 'high']).severity).toBe('high');
  });

  it('--severity bad value throws UsageError', () => {
    expect(() => parseArgs(['--severity', 'bogus'])).toThrow(UsageError);
  });

  it('--rule repeatable, last-wins per rule', () => {
    const r = parseArgs(['--rule', 'OA002=off', '--rule', 'OA005.e=off']);
    expect(r.ruleFilters.get('OA002')).toBe(false);
    expect(r.ruleFilters.get('OA005.e')).toBe(false);
  });

  it('--include-sub-suspect', () => {
    expect(parseArgs(['--include-sub-suspect']).includeSubSuspect).toBe(true);
  });

  it('--help / -h', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });

  it('--version / -V', () => {
    expect(parseArgs(['--version']).version).toBe(true);
    expect(parseArgs(['-V']).version).toBe(true);
  });

  it('unknown flag throws UsageError', () => {
    expect(() => parseArgs(['--nonsense'])).toThrow(UsageError);
  });

  it('--fix / --dry-run / --no-post-fix-rescan parse correctly (v0.2.0+)', () => {
    expect(parseArgs(['--fix']).fix).toBe(true);
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
    expect(parseArgs(['--no-post-fix-rescan']).noPostFixRescan).toBe(true);
  });

  it('--attempt-id / --source / --advisory parse (v0.3.0+)', () => {
    const r = parseArgs(['--attempt-id', 'rem_abc', '--source', 'ci', '--advisory', 'GHSA-xxx-yyy']);
    expect(r.attemptId).toBe('rem_abc');
    expect(r.source).toBe('ci');
    expect(r.advisory).toBe('GHSA-xxx-yyy');
  });

  it('--meta is repeatable, gathered into a Record', () => {
    const r = parseArgs(['--meta', 'env=prod', '--meta', 'cluster=us-east-1']);
    expect(r.meta).toEqual({ env: 'prod', cluster: 'us-east-1' });
  });

  it('--meta without = throws', () => {
    expect(() => parseArgs(['--meta', 'notkv'])).toThrow(/key=value/);
  });

  it('--log-file and --log-level parse with validation', () => {
    expect(parseArgs(['--log-file', '/tmp/x.log']).logFile).toBe('/tmp/x.log');
    expect(parseArgs(['--log-level', 'warn']).logLevel).toBe('warn');
    expect(() => parseArgs(['--log-level', 'bogus'])).toThrow(/debug\|info\|warn\|error/);
  });

  it('--no-install is still reserved for a future release', () => {
    expect(() => parseArgs(['--no-install'])).toThrow(/reserved for a future release/);
  });
});
