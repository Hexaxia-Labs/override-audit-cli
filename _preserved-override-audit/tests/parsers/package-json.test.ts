import { readPackageJson, extractOverrideEntries, MalformedPackageJsonError } from '../../src/parsers/package-json.js';
import { join } from 'path';

const F = (name: string) => join(process.cwd(), 'tests', 'fixtures', name);

describe('readPackageJson', () => {
  it('parses a valid package.json and returns raw + parsed', () => {
    const r = readPackageJson(F('manifest-flat-overrides'));
    expect(r.parsed.name).toBe('flat');
    expect(r.raw).toContain('"postcss"');
  });

  it('throws MalformedPackageJsonError on parse failure', () => {
    expect(() => readPackageJson('/nonexistent-path-xyz123'))
      .toThrow(/package.json/);
  });
});

describe('extractOverrideEntries', () => {
  it('flattens flat string overrides', () => {
    const r = readPackageJson(F('manifest-flat-overrides'));
    const entries = extractOverrideEntries(r.parsed);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      key: 'postcss',
      packageName: 'postcss',
      value: '8.5.15',
      path: ['overrides', 'postcss'],
      container: 'overrides',
    });
    expect(entries[1]).toMatchObject({
      key: 'react@>=18',
      packageName: 'react',         // specifier stripped
      path: ['overrides', 'react@>=18'],
    });
  });

  it('preserves nested-object override values (does not flatten the object)', () => {
    const r = readPackageJson(F('manifest-nested-overrides'));
    const entries = extractOverrideEntries(r.parsed);
    expect(entries).toHaveLength(2);
    const nested = entries.find(e => e.key === '@esbuild-kit/core-utils')!;
    expect(typeof nested.value).toBe('object');
    expect(nested.value).toEqual({ esbuild: '^0.25.0' });
    expect(nested.path).toEqual(['overrides', '@esbuild-kit/core-utils']);
  });

  it('reads pnpm.overrides container', () => {
    const r = readPackageJson(F('manifest-pnpm-overrides'));
    const entries = extractOverrideEntries(r.parsed);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      container: 'pnpm.overrides',
      path: ['pnpm', 'overrides', 'postcss'],
    });
  });

  it('reads BOTH containers when both present (returns all)', () => {
    const r = readPackageJson(F('manifest-both-sections'));
    const entries = extractOverrideEntries(r.parsed);
    expect(entries).toHaveLength(2);
    const containers = entries.map(e => e.container).sort();
    expect(containers).toEqual(['overrides', 'pnpm.overrides']);
  });

  it('returns empty array when no overrides', () => {
    const r = readPackageJson(F('manifest-no-overrides'));
    expect(extractOverrideEntries(r.parsed)).toEqual([]);
  });
});
