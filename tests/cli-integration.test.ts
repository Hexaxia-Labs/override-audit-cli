import { spawnSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

const BIN = join(process.cwd(), 'dist', 'cli', 'index.js');
const F = (n: string) => join(process.cwd(), 'tests', 'fixtures', n);

function runBin(args: string[]) {
  if (!existsSync(BIN)) throw new Error(`bin not built — run "npm run build" first (expected ${BIN})`);
  return spawnSync('node', [BIN, ...args], { encoding: 'utf-8' });
}

describe('CLI integration', () => {
  it('exits 0 on a clean project', () => {
    const r = runBin([F('scanner-clean')]);
    expect(r.status).toBe(0);
  });

  it('exits 1 on hexmetrics-real-world (findings present)', () => {
    const r = runBin([F('hexmetrics-real-world')]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('OA002');
  });

  it('emits valid JSON to stdout under --json', () => {
    const r = runBin(['--json', F('hexmetrics-real-world')]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schemaVersion).toBe('1');
    expect(parsed.findings.length).toBeGreaterThan(0);
  });

  it('exits 2 on unknown flag', () => {
    const r = runBin(['--bogus']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Unknown flag');
  });

  it('exits 0 on --fix --dry-run against a clean project (nothing to apply)', () => {
    const r = runBin(['--fix', '--dry-run', F('scanner-clean')]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('DRY RUN');
  });

  it('exits 2 on --no-install (still reserved post-v0.3.0)', () => {
    const r = runBin(['--no-install']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('reserved for a future release');
  });
});
