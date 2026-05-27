import { fix } from '../src/fixer/fix.js';
import { scan } from '../src/scanner.js';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const TMP = join(process.cwd(), 'tests', 'fixtures', '.fix-test-tmp');

function setupFixture(pkgJson: object): string {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n');
  writeFileSync(join(TMP, 'package-lock.json'), JSON.stringify({
    name: 'fix-test', version: '0.0.0', lockfileVersion: 3,
    packages: { '': {}, 'node_modules/postcss': { version: '8.5.15' } },
  }));
  mkdirSync(join(TMP, 'node_modules', 'postcss'), { recursive: true });
  writeFileSync(
    join(TMP, 'node_modules', 'postcss', 'package.json'),
    JSON.stringify({ name: 'postcss', version: '8.5.15' }),
  );
  return TMP;
}

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('fix orchestrator', () => {
  it('removes an OA001 orphan and confirms cleanliness via rescan', async () => {
    // postcss exists in tree (lockfile). gone-pkg does NOT — orphan.
    const path = setupFixture({
      name: 'fix-test', version: '0.0.0',
      overrides: { postcss: '8.5.15', 'gone-pkg': '1.0.0' },
    });

    const before = await scan(path);
    const orphanFinding = before.findings.find(f => f.ruleId === 'OA001-ORPHAN-TARGET');
    expect(orphanFinding).toBeDefined();

    const report = await fix(before, {
      dryRun: false, rescan: true, severityFloor: 'info',
      ruleFilters: new Map(), includeSubSuspect: false,
    }, 'rem_test-fix-001');

    expect(report.appliedPatches.length).toBeGreaterThanOrEqual(1);
    expect(report.appliedPatches.map(p => p.package)).toContain('gone-pkg');
    expect(report.remainingFindings).not.toBeNull();
    expect(report.remainingFindings!.find(f => f.ruleId === 'OA001-ORPHAN-TARGET')).toBeUndefined();
    expect(report.newFindings).toEqual([]);

    // package.json was actually modified.
    const after = JSON.parse(readFileSync(join(path, 'package.json'), 'utf-8'));
    expect(after.overrides['gone-pkg']).toBeUndefined();
    expect(after.overrides.postcss).toBe('8.5.15');   // untouched
  });

  it('dry-run mode does NOT write the file', async () => {
    const path = setupFixture({
      name: 'fix-test', version: '0.0.0',
      overrides: { 'gone-pkg': '1.0.0' },
    });
    const originalContent = readFileSync(join(path, 'package.json'), 'utf-8');

    const before = await scan(path);
    const report = await fix(before, {
      dryRun: true, rescan: true, severityFloor: 'info',
      ruleFilters: new Map(), includeSubSuspect: false,
    }, 'rem_dry-run');

    expect(report.dryRun).toBe(true);
    expect(report.appliedPatches.length).toBeGreaterThan(0);
    expect(report.remainingFindings).toBeNull();   // rescan skipped on dry-run

    // File untouched.
    expect(readFileSync(join(path, 'package.json'), 'utf-8')).toBe(originalContent);
  });

  it('records suggest-only findings as skipped (no patch to apply)', async () => {
    const path = setupFixture({
      name: 'fix-test', version: '0.0.0',
      overrides: {
        // OA002 with no installed version → suggest-only (patch=null).
        'never-installed-pkg': 'latest',
      },
    });
    const before = await scan(path);
    const report = await fix(before, {
      dryRun: false, rescan: false, severityFloor: 'info',
      ruleFilters: new Map(), includeSubSuspect: false,
    }, 'rem_suggest');

    // OA001 fires on never-installed-pkg (it's not in lockfile) with a remove patch.
    // But the OA002 floating-tag finding for the same pkg with no installed version
    // is suggest-only. Both findings come back for the same package.
    const oa002Skipped = report.skippedFindings.find(s => s.ruleId === 'OA002-FLOATING-TAG');
    expect(oa002Skipped).toBeDefined();
    expect(oa002Skipped!.reason).toContain('suggest-only');
  });

  it('respects severity floor — skips findings below it', async () => {
    // postcss override with same version as installed → no findings normally.
    // Add an orphan target which produces a 'low' finding. With floor='high', skip it.
    const path = setupFixture({
      name: 'fix-test', version: '0.0.0',
      overrides: { 'gone-pkg': '1.0.0' },
    });
    const before = await scan(path);
    const report = await fix(before, {
      dryRun: false, rescan: false, severityFloor: 'high',
      ruleFilters: new Map(), includeSubSuspect: false,
    }, 'rem_floor');

    expect(report.appliedPatches).toEqual([]);
    expect(report.skippedFindings.some(s => s.reason.includes('below severity floor'))).toBe(true);
  });
});
