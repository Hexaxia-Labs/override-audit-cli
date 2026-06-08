import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OverrideEntry, OverrideValue } from '../context.js';

export class MalformedPackageJsonError extends Error {
  constructor(public readonly path: string, public readonly cause: unknown) {
    super(`Failed to parse package.json at ${path}: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = 'MalformedPackageJsonError';
  }
}

export interface PackageJsonReadResult {
  parsed: Record<string, unknown>;
  raw: string;
}

export function readPackageJson(projectPath: string): PackageJsonReadResult {
  const path = join(projectPath, 'package.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    throw new MalformedPackageJsonError(path, err);
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return { parsed, raw };
  } catch (err) {
    throw new MalformedPackageJsonError(path, err);
  }
}

/**
 * Strip pnpm's optional `@<specifier>` suffix from an override key segment.
 * Handles both `pkg@>=1.0.0` and `@scope/pkg@>=1.0.0`.
 *
 * NOTE: this operates on a single segment and does NOT split pnpm selective
 * `parent>child` keys. Splitting on `>` is handled by `parseOverrideKey`,
 * which feeds each side through `bareName` separately.
 */
export function bareName(overrideKey: string): string {
  if (overrideKey.startsWith('@')) {
    // Scoped: keep the leading @, look for the SECOND @ as specifier delimiter.
    const second = overrideKey.indexOf('@', 1);
    return second === -1 ? overrideKey : overrideKey.slice(0, second);
  }
  const at = overrideKey.indexOf('@');
  return at === -1 ? overrideKey : overrideKey.slice(0, at);
}

/**
 * Index of the `@` that introduces a version specifier on a single selector,
 * or -1 if there is none. For scoped names the leading `@` (index 0) is the
 * scope, not a specifier, so we look past it.
 */
function specifierAt(selector: string): number {
  if (selector.startsWith('@')) {
    return selector.indexOf('@', 1);
  }
  return selector.indexOf('@');
}

/**
 * Resolve an override key into its real target package name and (for pnpm
 * selective `parent>child` keys) the parent scope.
 *
 * - Plain key (`postcss`, `@babel/runtime@<7.26.10`, `debug@>=4.0.0 <4.3.1`):
 *   no SELECTIVE `>`, so `packageName = bareName(key)` and `parentScope`
 *   stays undefined. Unchanged from the historical behavior. Note that a `>`
 *   inside a semver range (`@>=4.0.0`) is NOT a selective separator: it always
 *   follows the specifier `@`, so we only treat a `>` that appears BEFORE the
 *   specifier `@` as the pnpm `parent>child` separator.
 * - pnpm selective key (`parent>child`, `parent>@scope/child`): split on that
 *   FIRST selective `>`; the child (after `>`, with any `@spec` stripped) is
 *   the real target, the parent (also bareName'd) is the scope.
 */
export function parseOverrideKey(overrideKey: string): {
  packageName: string;
  parentScope?: string;
} {
  const gt = overrideKey.indexOf('>');
  const spec = specifierAt(overrideKey);
  // A `>` is the selective separator only if it precedes any version
  // specifier `@` (otherwise it belongs to a semver comparator like `@>=`).
  const isSelective = gt !== -1 && (spec === -1 || gt < spec);
  if (!isSelective) {
    return { packageName: bareName(overrideKey) };
  }
  const parent = overrideKey.slice(0, gt);
  const childRaw = overrideKey.slice(gt + 1);
  return {
    packageName: bareName(childRaw),
    parentScope: bareName(parent),
  };
}

/**
 * Extract all override entries from `overrides` (npm/bun), `pnpm.overrides`,
 * and `resolutions` (yarn), preserving nested-object values without flattening
 * them. Each entry records its container so detectors can reason about
 * misplacement.
 */
export function extractOverrideEntries(pkgJson: Record<string, unknown>): OverrideEntry[] {
  const out: OverrideEntry[] = [];

  const npmOverrides = pkgJson.overrides as Record<string, OverrideValue> | undefined;
  if (npmOverrides && typeof npmOverrides === 'object') {
    for (const [key, value] of Object.entries(npmOverrides)) {
      const { packageName, parentScope } = parseOverrideKey(key);
      out.push({
        key,
        packageName,
        ...(parentScope !== undefined ? { parentScope } : {}),
        value,
        path: ['overrides', key],
        container: 'overrides',
      });
    }
  }

  const pnpmSection = pkgJson.pnpm as { overrides?: Record<string, OverrideValue> } | undefined;
  if (pnpmSection?.overrides && typeof pnpmSection.overrides === 'object') {
    for (const [key, value] of Object.entries(pnpmSection.overrides)) {
      const { packageName, parentScope } = parseOverrideKey(key);
      out.push({
        key,
        packageName,
        ...(parentScope !== undefined ? { parentScope } : {}),
        value,
        path: ['pnpm', 'overrides', key],
        container: 'pnpm.overrides',
      });
    }
  }

  const yarnResolutions = pkgJson.resolutions as Record<string, OverrideValue> | undefined;
  if (yarnResolutions && typeof yarnResolutions === 'object') {
    for (const [key, value] of Object.entries(yarnResolutions)) {
      const { packageName, parentScope } = parseOverrideKey(key);
      out.push({
        key,
        packageName,
        ...(parentScope !== undefined ? { parentScope } : {}),
        value,
        path: ['resolutions', key],
        container: 'resolutions',
      });
    }
  }

  return out;
}
