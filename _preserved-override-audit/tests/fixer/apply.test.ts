import { applyPatches, PatchApplicationError } from '../../src/fixer/apply.js';

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)) as T; }

describe('applyPatches', () => {
  describe('remove', () => {
    it('removes a top-level key', () => {
      const doc = { overrides: { postcss: '8.5.15', react: '18.3.1' } };
      const out = applyPatches(clone(doc), [{ op: 'remove', path: '/overrides/postcss' }]) as typeof doc;
      expect(out.overrides).toEqual({ react: '18.3.1' });
    });

    it('removes from a scoped-name key (pointer with ~1)', () => {
      const doc = { overrides: { '@scope/pkg': '1.0.0' } };
      const out = applyPatches(clone(doc), [{ op: 'remove', path: '/overrides/@scope~1pkg' }]) as typeof doc;
      expect(out.overrides).toEqual({});
    });

    it('throws on missing key', () => {
      const doc = { overrides: {} };
      expect(() => applyPatches(clone(doc), [{ op: 'remove', path: '/overrides/missing' }]))
        .toThrow(PatchApplicationError);
    });
  });

  describe('replace', () => {
    it('replaces a value', () => {
      const doc = { overrides: { postcss: '8.4.31' } };
      const out = applyPatches(clone(doc), [{ op: 'replace', path: '/overrides/postcss', value: '>=8.5.15' }]) as typeof doc;
      expect(out.overrides.postcss).toBe('>=8.5.15');
    });
  });

  describe('move', () => {
    it('moves from one path to another (the OA003 fix shape)', () => {
      const doc = { pnpm: { overrides: { postcss: '8.5.15' } } } as Record<string, unknown>;
      const out = applyPatches(clone(doc), [
        { op: 'move', from: '/pnpm/overrides/postcss', path: '/overrides/postcss' },
      ]) as { overrides: Record<string, string>; pnpm: { overrides: Record<string, string> } };
      expect(out.overrides).toEqual({ postcss: '8.5.15' });
      expect(out.pnpm.overrides).toEqual({});
    });
  });

  describe('add', () => {
    it('adds a new key to an object', () => {
      const doc = { overrides: {} } as { overrides: Record<string, string> };
      const out = applyPatches(clone(doc), [{ op: 'add', path: '/overrides/react', value: '18.3.1' }]) as typeof doc;
      expect(out.overrides).toEqual({ react: '18.3.1' });
    });
  });

  describe('multiple patches', () => {
    it('applies in order', () => {
      const doc = { overrides: { a: '1', b: '2' } } as { overrides: Record<string, string> };
      const out = applyPatches(clone(doc), [
        { op: 'remove', path: '/overrides/a' },
        { op: 'replace', path: '/overrides/b', value: '99' },
        { op: 'add', path: '/overrides/c', value: '3' },
      ]) as typeof doc;
      expect(out.overrides).toEqual({ b: '99', c: '3' });
    });
  });
});
