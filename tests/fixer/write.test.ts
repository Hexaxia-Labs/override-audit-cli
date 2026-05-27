import { detectIndent, hasTrailingNewline, writePackageJson } from '../../src/fixer/write.js';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const TMP = join(process.cwd(), 'tests', 'fixtures', '.write-test-tmp');

describe('detectIndent', () => {
  it('detects 2-space indent', () => {
    const raw = `{\n  "name": "x"\n}`;
    expect(detectIndent(raw)).toBe('  ');
  });
  it('detects 4-space indent', () => {
    const raw = `{\n    "name": "x"\n}`;
    expect(detectIndent(raw)).toBe('    ');
  });
  it('detects tab indent', () => {
    const raw = `{\n\t"name": "x"\n}`;
    expect(detectIndent(raw)).toBe('\t');
  });
  it('falls back to 2 spaces on weirdness', () => {
    expect(detectIndent('{}')).toBe('  ');
  });
});

describe('hasTrailingNewline', () => {
  it('returns true when file ends with newline', () => {
    expect(hasTrailingNewline('foo\n')).toBe(true);
  });
  it('returns false otherwise', () => {
    expect(hasTrailingNewline('foo')).toBe(false);
  });
});

describe('writePackageJson', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });
  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('writes with detected indent and trailing newline preserved', () => {
    const originalRaw = `{\n    "name": "x",\n    "overrides": {\n        "a": "1"\n    }\n}\n`;
    writeFileSync(join(TMP, 'package.json'), originalRaw);
    const doc = JSON.parse(originalRaw) as { overrides: Record<string, string> };
    doc.overrides.a = '2';
    writePackageJson(TMP, doc, originalRaw);

    const written = readFileSync(join(TMP, 'package.json'), 'utf-8');
    expect(written.endsWith('\n')).toBe(true);
    expect(written).toContain('    "name": "x"');     // 4-space indent preserved
    expect(written).toContain('"a": "2"');            // value updated
  });

  it('writes without trailing newline when original had none', () => {
    const originalRaw = `{\n  "name": "x"\n}`;
    writeFileSync(join(TMP, 'package.json'), originalRaw);
    const doc = JSON.parse(originalRaw);
    writePackageJson(TMP, doc, originalRaw);
    const written = readFileSync(join(TMP, 'package.json'), 'utf-8');
    expect(written.endsWith('\n')).toBe(false);
  });
});
