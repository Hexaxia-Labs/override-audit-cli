import { detect } from '../../src/detectors/vulnerable-twin.js';
import type { Context, OverrideEntry, InstalledCopy } from '../../src/types.js';

function copy(name: string, version: string, path: string): InstalledCopy {
  return { name, path, version };
}

function ctxOf(entries: OverrideEntry[], copies: Record<string, InstalledCopy[]>): Context {
  return {
    projectPath: '/x', packageJson: {}, packageJsonRaw: '{}',
    packageManager: 'npm',
    overrideEntries: entries,
    lockfilePackageNames: new Set(entries.map(e => e.packageName)),
    installedVersions: new Map(),
    installedCopies: new Map(Object.entries(copies)),
    parentDeclarations: new Map(),
    registryDistTags: new Map(),
    skippedDetectors: [],
  };
}
const e = (name: string, value: string): OverrideEntry => ({
  key: name, packageName: name, value, path: ['overrides', name], container: 'overrides',
});

describe('OA008-VULNERABLE-TWIN', () => {
  it('flags when a copy below the range-floor is still installed', () => {
    const ctx = ctxOf(
      [e('@esbuild/linux-x64', '>=0.28.0')],
      {
        '@esbuild/linux-x64': [
          copy('@esbuild/linux-x64', '0.25.12', '/x/node_modules/@esbuild/linux-x64'),
          copy('@esbuild/linux-x64', '0.28.0', '/x/node_modules/tsx/node_modules/@esbuild/linux-x64'),
        ],
      },
    );
    const findings = detect(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA008-VULNERABLE-TWIN',
      severity: 'critical',
    });
    expect(findings[0]!.detail).toContain('0.25.12');
  });

  it('flags when a copy below a concrete-pin floor is installed', () => {
    const ctx = ctxOf(
      [e('postcss', '8.5.15')],
      {
        postcss: [
          copy('postcss', '8.4.31', '/x/node_modules/some-parent/node_modules/postcss'),
        ],
      },
    );
    expect(detect(ctx)).toHaveLength(1);
  });

  it('does NOT flag when every installed copy satisfies the floor', () => {
    const ctx = ctxOf(
      [e('postcss', '>=8.5.0')],
      { postcss: [copy('postcss', '8.5.15', '/x/node_modules/postcss')] },
    );
    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag floating-tag pins (OA002 territory)', () => {
    const ctx = ctxOf(
      [e('@esbuild/linux-x64', 'latest')],
      { '@esbuild/linux-x64': [copy('@esbuild/linux-x64', '0.25.12', '/x/node_modules/@esbuild/linux-x64')] },
    );
    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag workspace:/file:/link: protocols', () => {
    const ctx = ctxOf(
      [e('local', 'workspace:*')],
      { local: [copy('local', '1.0.0', '/x/node_modules/local')] },
    );
    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag when no copies are recorded', () => {
    const ctx = ctxOf([e('postcss', '>=8.5.0')], {});
    expect(detect(ctx)).toEqual([]);
  });

  it('does not crash on nested-object overrides (OA005)', () => {
    const nested: OverrideEntry = {
      key: 'a', packageName: 'a', value: { b: '1.0.0' }, path: ['overrides', 'a'], container: 'overrides',
    };
    expect(detect(ctxOf([nested], {}))).toEqual([]);
  });
});
