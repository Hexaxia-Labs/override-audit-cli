import type { RFC6902Patch } from '../types.js';

export class PatchApplicationError extends Error {
  constructor(message: string, public readonly patch: RFC6902Patch) {
    super(message);
    this.name = 'PatchApplicationError';
  }
}

/**
 * Apply a sequence of RFC 6902 patches to a JSON document. Returns the
 * modified document (mutates in place — caller should pass a fresh deep clone
 * if they need the original preserved). Throws PatchApplicationError on any
 * unresolvable path or invalid op for v0.1.x's subset (remove/replace/move/add).
 *
 * The applier is intentionally conservative:
 *   - Does not coerce types.
 *   - Throws on missing intermediate paths (no auto-create).
 *   - `move` is implemented as remove(from) + add(path).
 *   - `add` to an object replaces the existing value; `add` to an array
 *     inserts (RFC 6902 doesn't differentiate by index, so we accept any
 *     valid array index).
 */
export function applyPatches(doc: unknown, patches: RFC6902Patch[]): unknown {
  let current = doc;
  for (const patch of patches) {
    current = applyOne(current, patch);
  }
  return current;
}

function applyOne(doc: unknown, patch: RFC6902Patch): unknown {
  switch (patch.op) {
    case 'remove': return removeAt(doc, parsePointer(patch.path), patch);
    case 'replace': return replaceAt(doc, parsePointer(patch.path), patch.value, patch);
    case 'add': return addAt(doc, parsePointer(patch.path), patch.value, patch);
    case 'move': {
      const from = parsePointer(patch.from);
      const path = parsePointer(patch.path);
      const value = readAt(doc, from, patch);
      const removed = removeAt(doc, from, patch);
      return addAt(removed, path, value, patch);
    }
  }
}

/** RFC 6901 pointer parser. "/a/b~1c~0d" → ["a", "b/c~d"] */
function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new PatchApplicationError(`Invalid JSON Pointer (must start with "/"): ${pointer}`, { op: 'remove', path: pointer });
  }
  return pointer.slice(1).split('/').map(unescape);
}
function unescape(s: string): string {
  return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

function readAt(doc: unknown, segments: string[], patch: RFC6902Patch): unknown {
  let cur: any = doc;
  for (const seg of segments) {
    if (cur == null || typeof cur !== 'object') {
      throw new PatchApplicationError(`Path traversal failed at segment "${seg}" (parent is not an object)`, patch);
    }
    if (Array.isArray(cur)) {
      const i = Number(seg);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) {
        throw new PatchApplicationError(`Invalid array index "${seg}"`, patch);
      }
      cur = cur[i];
    } else {
      if (!(seg in cur)) {
        throw new PatchApplicationError(`Missing key "${seg}"`, patch);
      }
      cur = cur[seg];
    }
  }
  return cur;
}

function removeAt(doc: unknown, segments: string[], patch: RFC6902Patch): unknown {
  if (segments.length === 0) {
    throw new PatchApplicationError('Cannot remove the document root', patch);
  }
  const parent = walkToParent(doc, segments, patch);
  const last = segments[segments.length - 1]!;
  if (Array.isArray(parent)) {
    const i = Number(last);
    if (!Number.isInteger(i) || i < 0 || i >= parent.length) {
      throw new PatchApplicationError(`Invalid array index "${last}"`, patch);
    }
    parent.splice(i, 1);
  } else {
    if (!(last in (parent as Record<string, unknown>))) {
      throw new PatchApplicationError(`Cannot remove missing key "${last}"`, patch);
    }
    delete (parent as Record<string, unknown>)[last];
  }
  return doc;
}

function replaceAt(doc: unknown, segments: string[], value: unknown, patch: RFC6902Patch): unknown {
  if (segments.length === 0) return value;
  const parent = walkToParent(doc, segments, patch);
  const last = segments[segments.length - 1]!;
  if (Array.isArray(parent)) {
    const i = Number(last);
    if (!Number.isInteger(i) || i < 0 || i >= parent.length) {
      throw new PatchApplicationError(`Invalid array index "${last}"`, patch);
    }
    parent[i] = value;
  } else {
    if (!(last in (parent as Record<string, unknown>))) {
      throw new PatchApplicationError(`Cannot replace missing key "${last}"`, patch);
    }
    (parent as Record<string, unknown>)[last] = value;
  }
  return doc;
}

function addAt(doc: unknown, segments: string[], value: unknown, patch: RFC6902Patch): unknown {
  if (segments.length === 0) return value;
  // For add/move, auto-create missing intermediate objects. This deviates from
  // strict RFC 6902 (which requires the parent to exist) but matches what real
  // override-fix workflows need: e.g. OA003's `move` from /pnpm/overrides/foo
  // to /overrides/foo needs to create the top-level "overrides" object when
  // the project never had one.
  const parent = walkToParent(doc, segments, patch, /* autoCreate */ true);
  const last = segments[segments.length - 1]!;
  if (Array.isArray(parent)) {
    if (last === '-') {
      parent.push(value);
      return doc;
    }
    const i = Number(last);
    if (!Number.isInteger(i) || i < 0 || i > parent.length) {
      throw new PatchApplicationError(`Invalid array index "${last}"`, patch);
    }
    parent.splice(i, 0, value);
  } else {
    (parent as Record<string, unknown>)[last] = value;
  }
  return doc;
}

function walkToParent(doc: unknown, segments: string[], patch: RFC6902Patch, autoCreate = false): object {
  let cur: any = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (cur == null || typeof cur !== 'object') {
      throw new PatchApplicationError(`Path traversal failed at "${seg}"`, patch);
    }
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
        throw new PatchApplicationError(`Invalid array index "${seg}"`, patch);
      }
      cur = cur[idx];
    } else {
      if (!(seg in cur)) {
        if (!autoCreate) {
          throw new PatchApplicationError(`Missing intermediate key "${seg}"`, patch);
        }
        cur[seg] = {};
      }
      cur = cur[seg];
    }
  }
  if (cur == null || typeof cur !== 'object') {
    throw new PatchApplicationError('Final parent is not an object', patch);
  }
  return cur as object;
}
