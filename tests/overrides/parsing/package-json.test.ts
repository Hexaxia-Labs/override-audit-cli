import { readPackageJson, extractOverrideEntries, bareName, MalformedPackageJsonError } from '../../../src/overrides/parsing/package-json.js';
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

describe('bareName', () => {
  it('returns the name unchanged for a plain key', () => {
    expect(bareName('postcss')).toBe('postcss');
  });

  it('strips the @>=spec suffix from a plain key', () => {
    expect(bareName('react@>=18')).toBe('react');
  });

  it('preserves a scoped name', () => {
    expect(bareName('@scope/pkg')).toBe('@scope/pkg');
  });

  it('strips the @spec suffix from a scoped name', () => {
    expect(bareName('@scope/pkg@>=1.0.0')).toBe('@scope/pkg');
  });

  it('leaves pnpm nested syntax parent>child as a literal composite name', () => {
    // Deliberate: the composite stays so OA001 can lockfile-test the whole key.
    // Whether the override is semantically orphaned within the parent's
    // dep-graph is a separate concern (Plan 6 follow-up detector).
    expect(bareName('ember-svg-jar>cheerio')).toBe('ember-svg-jar>cheerio');
    expect(bareName('juice>cheerio')).toBe('juice>cheerio');
  });

  it('strips the @spec from pnpm nested syntax with a scoped child', () => {
    // Known-quirky: the @ is the scope-marker for the inner child, but bareName
    // currently treats it as the spec delimiter (matches preserved behavior).
    expect(bareName('eslint-plugin-ghost>@typescript-eslint/eslint-plugin'))
      .toBe('eslint-plugin-ghost>');
  });
});
