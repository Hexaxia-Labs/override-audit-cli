/** Encode one path segment per RFC 6901 (~0 for ~, ~1 for /). */
export function escapeSegment(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Build an RFC 6901 JSON Pointer from a path array. */
export function jsonPointer(path: string[]): string {
  return '/' + path.map(escapeSegment).join('/');
}
