import { detect } from '../../../src/overrides/detectors/oa007-frozen-latest.js';
import type { OverrideContext, OverrideEntry } from '../../../src/overrides/context.js';
import { NULL_AUDIT_LOG } from '../../../src/audit-log/index.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;

function ctxOf(entries: OverrideEntry[], installed: [string, string][]): OverrideContext {
  return {
    projectPath: '/x',
    packageJson: {},
    packageJsonRaw: '{}',
    packageManager: 'npm',
    overrideEntries: entries,
    lockfilePackageNames: new Set(),
    installedVersions: new Map(installed),
    installedCopies: new Map(),
    parentDeclarations: new Map(),
    registryDistTags: new Map(),
    skippedDetectors: [],
    auditLog: NULL_AUDIT_LOG,
    logger: noopLogger,
  };
}

const e = (name: string, value: string): OverrideEntry => ({
  key: name, packageName: name, value, path: ['overrides', name], container: 'overrides',
});

describe('OA007-FROZEN-LATEST', () => {
  it('flags "latest" pin when registry latest is newer than installed', () => {
    const ctx = ctxOf(
      [e('@esbuild/linux-x64', 'latest')],
      [['@esbuild/linux-x64', '0.25.12']],
    );
    ctx.registryDistTags.set('@esbuild/linux-x64', { latest: '0.28.0' });

    const findings = detect(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA007',
      severity: 'low',
    });
    expect(findings[0]!.details).toContain('0.25.12');
    expect(findings[0]!.details).toContain('0.28.0');
    expect(findings[0]!.fix?.patch[0]?.value).toContain('>=0.28.0');
  });

  it('emits a replace patch with the registry-latest floor', () => {
    const ctx = ctxOf(
      [e('@esbuild/linux-x64', 'latest')],
      [['@esbuild/linux-x64', '0.25.12']],
    );
    ctx.registryDistTags.set('@esbuild/linux-x64', { latest: '0.28.0' });

    const finding = detect(ctx)[0]!;
    expect(finding.fix?.type).toBe('rfc6902');
    expect(finding.fix?.patch).toEqual([
      {
        op: 'replace',
        path: '/overrides/@esbuild~1linux-x64',
        value: '>=0.28.0',
      },
    ]);
  });

  it('flags "next" pin similarly', () => {
    const ctx = ctxOf(
      [e('some-pkg', 'next')],
      [['some-pkg', '2.0.0']],
    );
    ctx.registryDistTags.set('some-pkg', { next: '3.0.0-rc.1' });

    expect(detect(ctx)).toHaveLength(1);
  });

  it('does NOT flag when installed matches registry latest', () => {
    const ctx = ctxOf(
      [e('p', 'latest')],
      [['p', '1.0.0']],
    );
    ctx.registryDistTags.set('p', { latest: '1.0.0' });

    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag when installed is NEWER than registry latest (no false positive)', () => {
    const ctx = ctxOf(
      [e('p', 'latest')],
      [['p', '2.0.0']],
    );
    ctx.registryDistTags.set('p', { latest: '1.0.0' });

    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag concrete-version pins (OA002/OA004 territory)', () => {
    const ctx = ctxOf(
      [e('p', '1.0.0')],
      [['p', '1.0.0']],
    );
    ctx.registryDistTags.set('p', { latest: '2.0.0' });

    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag when registry data is missing (caller skipped --check-network)', () => {
    const ctx = ctxOf(
      [e('p', 'latest')],
      [['p', '1.0.0']],
    );

    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag when registry has the package but no matching tag', () => {
    const ctx = ctxOf(
      [e('p', 'next')],
      [['p', '1.0.0']],
    );
    ctx.registryDistTags.set('p', { latest: '2.0.0' });

    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT crash on nested-object overrides', () => {
    const nested: OverrideEntry = {
      key: 'a', packageName: 'a', value: { b: '1.0.0' }, path: ['overrides', 'a'], container: 'overrides',
    };
    const ctx = ctxOf([nested], []);
    ctx.registryDistTags.set('a', { latest: '2.0.0' });

    expect(detect(ctx)).toEqual([]);
  });
});
