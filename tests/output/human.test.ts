import { renderHuman } from '../../src/output/human.js';
import type { Context, Finding } from '../../src/types.js';

const ctx: Context = {
  projectPath: '/p/hexmetrics', packageJson: {}, packageJsonRaw: '{}',
  packageManager: 'npm', overrideEntries: [],
  lockfilePackageNames: new Set(), installedVersions: new Map(),
  skippedDetectors: [],
};

describe('renderHuman', () => {
  it('prints "Clean" when no findings', () => {
    const text = renderHuman({ context: ctx, findings: [] });
    expect(text).toContain('No findings');
    expect(text).toContain('/p/hexmetrics');
  });

  it('prints a table of findings grouped by severity', () => {
    const f: Finding = {
      ruleId: 'OA002-FLOATING-TAG', severity: 'medium',
      title: 'Floating pin', detail: 'detail goes here',
      package: '@esbuild/linux-x64', overridePath: ['overrides', '@esbuild/linux-x64'], pinValue: 'latest',
      packageManager: 'npm',
      remediation: { action: 'replace', patch: { op: 'replace', path: '/overrides/@esbuild~1linux-x64', value: '>=0.25.12' }, explanation: '' },
      references: [],
    };
    const text = renderHuman({ context: ctx, findings: [f] });
    expect(text).toContain('OA002-FLOATING-TAG');
    expect(text).toContain('@esbuild/linux-x64');
    expect(text).toContain('medium');
    expect(text).toContain('1 finding');
  });

  it('prints skipped detector warnings', () => {
    const ctxSkip: Context = { ...ctx, skippedDetectors: [{ ruleId: 'OA001-ORPHAN-TARGET', reason: 'lockfile missing' }] };
    const text = renderHuman({ context: ctxSkip, findings: [] });
    expect(text).toContain('Skipped detectors');
    expect(text).toContain('OA001');
  });
});
