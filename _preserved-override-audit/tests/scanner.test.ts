import { scan } from '../src/scanner.js';
import { join } from 'path';

const F = (n: string) => join(process.cwd(), 'tests', 'fixtures', n);

describe('scan', () => {
  it('returns empty findings for a clean project', async () => {
    const { findings } = await scan(F('scanner-clean'));
    expect(findings).toEqual([]);
  });

  it('finds expected hexmetrics-fixture findings', async () => {
    const { findings, context } = await scan(F('scanner-hexmetrics'));
    expect(context.packageManager).toBe('npm');

    const byRule = findings.reduce<Record<string, number>>((acc, f) => {
      const k = f.subRuleId ?? f.ruleId;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

    // postcss is fine. @esbuild/linux-x64=latest → OA002. @esbuild-kit/core-utils is IN
    // lockfile (3.3.2), and it DOES declare esbuild as a dep (^0.18.20). Override pins
    // esbuild ^0.25.0; installed esbuild inner is not tracked → .e (valid+effective
    // fallback) is the expected outcome.
    expect(byRule['OA002-FLOATING-TAG']).toBe(1);
    expect(Object.keys(byRule).some(k => k.startsWith('OA005'))).toBe(true);
  });

  it('throws UnsupportedPackageManagerError when no lockfile is present', async () => {
    // PM detection short-circuits before any detector runs when there's no
    // lockfile and no other PM signal. The graceful-degradation skippedDetectors
    // path applies when a lockfile exists but is unreadable/empty; coverage for
    // that lives in tests/detectors/orphan.test.ts.
    await expect(scan(F('lockfile-missing'))).rejects.toThrow(/No supported lockfile/);
  });
});
