import { detect } from '../../src/detectors/floating-tag.js';
import type { Context, OverrideEntry } from '../../src/types.js';

function ctxOf(entries: OverrideEntry[], installed: [string, string][] = []): Context {
  return {
    projectPath: '/x', packageJson: {}, packageJsonRaw: '{}',
    packageManager: 'npm',
    overrideEntries: entries,
    lockfilePackageNames: new Set(entries.map(e => e.packageName)),
    installedVersions: new Map(installed),
    installedCopies: new Map(),
    parentDeclarations: new Map(),
    registryDistTags: new Map(),
    skippedDetectors: [],
  };
}
const e = (name: string, value: string): OverrideEntry => ({
  key: name, packageName: name, value, path: ['overrides', name], container: 'overrides',
});

describe('OA002-FLOATING-TAG', () => {
  it.each(['latest', 'next', '*', 'x', ''])('flags pin value %j', (v) => {
    const findings = detect(ctxOf([e('@esbuild/linux-x64', v)]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('OA002-FLOATING-TAG');
    expect(findings[0]!.severity).toBe('medium');
  });

  it('does NOT flag valid semver ranges', () => {
    expect(detect(ctxOf([e('postcss', '^8.0.0')]))).toEqual([]);
    expect(detect(ctxOf([e('postcss', '8.5.15')]))).toEqual([]);
    expect(detect(ctxOf([e('postcss', '>=8.5.0')]))).toEqual([]);
  });

  it('skips workspace: and file: protocol values', () => {
    expect(detect(ctxOf([e('local', 'workspace:*')]))).toEqual([]);
    expect(detect(ctxOf([e('local', 'file:../local')]))).toEqual([]);
    expect(detect(ctxOf([e('local', 'link:../local')]))).toEqual([]);
  });

  it('skips nested-object override values (OA005 handles those)', () => {
    const nested: OverrideEntry = {
      key: 'a', packageName: 'a', value: { b: 'latest' },
      path: ['overrides', 'a'], container: 'overrides',
    };
    expect(detect(ctxOf([nested]))).toEqual([]);
  });

  it('suggests >=installed when node_modules version is known', () => {
    const findings = detect(ctxOf([e('@esbuild/linux-x64', 'latest')], [['@esbuild/linux-x64', '0.25.12']]));
    expect(findings[0]!.remediation.action).toBe('replace');
    expect(findings[0]!.remediation.patch).toEqual({
      op: 'replace',
      path: '/overrides/@esbuild~1linux-x64',
      value: '>=0.25.12',
    });
  });

  it('falls back to suggest when installed version is unknown', () => {
    const findings = detect(ctxOf([e('@esbuild/linux-x64', 'latest')]));
    expect(findings[0]!.remediation.action).toBe('suggest');
    expect(findings[0]!.remediation.patch).toBeNull();
  });
});
