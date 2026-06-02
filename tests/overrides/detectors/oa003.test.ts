import { detect } from '../../../src/overrides/detectors/oa003-wrong-section.js';
import type { OverrideContext, OverrideEntry } from '../../../src/overrides/context.js';
import { NULL_AUDIT_LOG } from '../../../src/audit-log/index.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;

function ctxOf(pm: 'npm' | 'pnpm', entries: OverrideEntry[]): OverrideContext {
  return {
    projectPath: '/x',
    packageJson: {},
    packageJsonRaw: '{}',
    packageManager: pm,
    overrideEntries: entries,
    lockfilePackageNames: new Set(),
    installedVersions: new Map(),
    installedCopies: new Map(),
    parentDeclarations: new Map(),
    registryDistTags: new Map(),
    skippedDetectors: [],
    auditLog: NULL_AUDIT_LOG,
    logger: noopLogger,
  };
}

const npmEntry = (k: string): OverrideEntry => ({
  key: k, packageName: k, value: '1.0.0', path: ['overrides', k], container: 'overrides',
});

const pnpmEntry = (k: string): OverrideEntry => ({
  key: k, packageName: k, value: '1.0.0', path: ['pnpm', 'overrides', k], container: 'pnpm.overrides',
});

describe('OA003-WRONG-SECTION', () => {
  it('flags pnpm.overrides in npm project', () => {
    const findings = detect(ctxOf('npm', [pnpmEntry('postcss')]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA003',
      severity: 'high',
      fix: {
        type: 'rfc6902',
        patch: [{ op: 'move', from: '/pnpm/overrides/postcss', path: '/overrides/postcss' }],
      },
    });
  });

  it('flags top-level overrides in pnpm project', () => {
    const findings = detect(ctxOf('pnpm', [npmEntry('postcss')]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.fix?.patch).toEqual([{
      op: 'move', from: '/overrides/postcss', path: '/pnpm/overrides/postcss',
    }]);
  });

  it('does NOT flag entries in the correct section', () => {
    expect(detect(ctxOf('npm', [npmEntry('postcss')]))).toEqual([]);
    expect(detect(ctxOf('pnpm', [pnpmEntry('postcss')]))).toEqual([]);
  });

  it('emits one finding per misplaced entry', () => {
    const findings = detect(ctxOf('npm', [pnpmEntry('a'), pnpmEntry('b')]));
    expect(findings).toHaveLength(2);
  });
});
