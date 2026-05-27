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

  it('reserved-for-v0.3.0 flags throw a clear UsageError', () => {
    expect(() => parseArgs(['--attempt-id'])).toThrow(/v0\.3\.0/);
    expect(() => parseArgs(['--source'])).toThrow(/v0\.3\.0/);
    expect(() => parseArgs(['--log-file'])).toThrow(/v0\.3\.0/);
  });
});
