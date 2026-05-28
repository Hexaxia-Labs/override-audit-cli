import { jsonPointer, escapeSegment } from '../../src/fixer/json-pointer.js';

describe('jsonPointer', () => {
  it('encodes plain segments', () => {
    expect(jsonPointer(['overrides', 'postcss'])).toBe('/overrides/postcss');
  });
  it('escapes / in scoped package names', () => {
    expect(jsonPointer(['overrides', '@scope/pkg'])).toBe('/overrides/@scope~1pkg');
  });
  it('escapes ~ in keys', () => {
    expect(escapeSegment('a~b')).toBe('a~0b');
  });
});
