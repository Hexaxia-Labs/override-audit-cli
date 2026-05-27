import { detect } from '../../src/detectors/frozen-latest.js';
import type { Context, OverrideEntry, RegistryDistTags } from '../../src/types.js';

function ctxOf(
  entries: OverrideEntry[],
  installed: [string, string][],
  registry: Record<string, RegistryDistTags>,
): Context {
  return {
    projectPath: '/x', packageJson: {}, packageJsonRaw: '{}',
    packageManager: 'npm',
    overrideEntries: entries,
    lockfilePackageNames: new Set(entries.map(e => e.packageName)),
    installedVersions: new Map(installed),
    installedCopies: new Map(),
    parentDeclarations: new Map(),
    registryDistTags: new Map(Object.entries(registry)),
    skippedDetectors: [],
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
      { '@esbuild/linux-x64': { latest: '0.28.0' } },
    );
    const findings = detect(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA007-FROZEN-LATEST',
      severity: 'high',
    });
    expect(findings[0]!.detail).toContain('0.25.12');
    expect(findings[0]!.detail).toContain('0.28.0');
    expect(findings[0]!.remediation.explanation).toContain('">=0.28.0"');
  });

  it('emits a replace patch with the registry-latest floor (v0.2.1)', () => {
    const ctx = ctxOf(
      [e('@esbuild/linux-x64', 'latest')],
      [['@esbuild/linux-x64', '0.25.12']],
      { '@esbuild/linux-x64': { latest: '0.28.0' } },
    );
    const finding = detect(ctx)[0]!;
    expect(finding.remediation.action).toBe('replace');
    expect(finding.remediation.patch).toEqual({
      op: 'replace',
      path: '/overrides/@esbuild~1linux-x64',
      value: '>=0.28.0',
    });
  });

  it('flags "next" pin similarly', () => {
    const ctx = ctxOf(
      [e('some-pkg', 'next')],
      [['some-pkg', '2.0.0']],
      { 'some-pkg': { next: '3.0.0-rc.1' } },
    );
    expect(detect(ctx)).toHaveLength(1);
  });

  it('does NOT flag when installed matches registry latest', () => {
    const ctx = ctxOf(
      [e('p', 'latest')],
      [['p', '1.0.0']],
      { p: { latest: '1.0.0' } },
    );
    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag when installed is NEWER than registry latest (no false positive)', () => {
    const ctx = ctxOf(
      [e('p', 'latest')],
      [['p', '2.0.0']],
      { p: { latest: '1.0.0' } },
    );
    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag concrete-version pins (OA002/OA004 territory)', () => {
    const ctx = ctxOf(
      [e('p', '1.0.0')],
      [['p', '1.0.0']],
      { p: { latest: '2.0.0' } },
    );
    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag when registry data is missing (caller skipped --with-registry)', () => {
    const ctx = ctxOf(
      [e('p', 'latest')],
      [['p', '1.0.0']],
      {},
    );
    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag when registry has the package but no matching tag', () => {
    const ctx = ctxOf(
      [e('p', 'next')],
      [['p', '1.0.0']],
      { p: { latest: '2.0.0' } },  // has latest, but pin asked for "next"
    );
    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT crash on nested-object overrides', () => {
    const nested: OverrideEntry = {
      key: 'a', packageName: 'a', value: { b: '1.0.0' }, path: ['overrides', 'a'], container: 'overrides',
    };
    const ctx = ctxOf([nested], [], { a: { latest: '2.0.0' } });
    expect(detect(ctx)).toEqual([]);
  });
});
