import { readFileSync } from 'fs';
import { join } from 'path';
import type { OverrideEntry, OverrideValue } from '../types.js';

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
 * Strip pnpm's optional `@<specifier>` suffix from an override key.
 * Handles both `pkg@>=1.0.0` and `@scope/pkg@>=1.0.0`.
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
 * Extract all override entries from `overrides` (npm) and `pnpm.overrides`,
 * preserving nested-object values without flattening them. Each entry records
 * its container so detectors can reason about misplacement.
 */
export function extractOverrideEntries(pkgJson: Record<string, unknown>): OverrideEntry[] {
  const out: OverrideEntry[] = [];

  const npmOverrides = pkgJson.overrides as Record<string, OverrideValue> | undefined;
  if (npmOverrides && typeof npmOverrides === 'object') {
    for (const [key, value] of Object.entries(npmOverrides)) {
      out.push({
        key,
        packageName: bareName(key),
        value,
        path: ['overrides', key],
        container: 'overrides',
      });
    }
  }

  const pnpmSection = pkgJson.pnpm as { overrides?: Record<string, OverrideValue> } | undefined;
  if (pnpmSection?.overrides && typeof pnpmSection.overrides === 'object') {
    for (const [key, value] of Object.entries(pnpmSection.overrides)) {
      out.push({
        key,
        packageName: bareName(key),
        value,
        path: ['pnpm', 'overrides', key],
        container: 'pnpm.overrides',
      });
    }
  }

  return out;
}
