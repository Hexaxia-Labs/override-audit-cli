import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PackageManager } from '../types.js';

/**
 * Read the lockfile for `projectPath` and return the set of all bare package
 * names appearing anywhere in the resolved dependency tree. Includes both
 * top-level and nested (`node_modules/<a>/node_modules/<b>`) entries.
 *
 * Returns an empty Set when the lockfile is missing — callers that need
 * lockfile data should also surface a `skippedDetectors` warning via Context.
 */
export function readLockfilePackages(projectPath: string, pm: PackageManager): Set<string> {
  if (pm === 'npm') return readNpmLockfile(projectPath);
  if (pm === 'pnpm') return readPnpmLockfile(projectPath);
  return new Set();
}

function readNpmLockfile(projectPath: string): Set<string> {
  const path = join(projectPath, 'package-lock.json');
  if (!existsSync(path)) return new Set();
  try {
    const lock = JSON.parse(readFileSync(path, 'utf-8')) as { packages?: Record<string, unknown> };
    const names = new Set<string>();
    for (const key of Object.keys(lock.packages ?? {})) {
      if (key === '') continue;       // root project entry
      // Key format: "node_modules/<name>" or "node_modules/<a>/node_modules/<b>".
      // Last "node_modules/" segment gives us the leaf package.
      const last = key.lastIndexOf('node_modules/');
      if (last === -1) continue;
      const name = key.slice(last + 'node_modules/'.length);
      if (name) names.add(name);
    }
    return names;
  } catch {
    return new Set();
  }
}

function readPnpmLockfile(projectPath: string): Set<string> {
  const path = join(projectPath, 'pnpm-lock.yaml');
  if (!existsSync(path)) return new Set();
  const text = readFileSync(path, 'utf-8');
  const names = new Set<string>();
  // Handles three pnpm-lock formats without pulling in a YAML parser:
  //   v6:           "  /postcss@8.5.15:"          or "  /@scope/pkg@1.0.0:"
  //   v9 quoted:    "  '@scope/pkg@1.0.0':"        (scoped names quoted)
  //   v9 unquoted:  "  pkg@1.0.0:"                 (bare names)
  // Optional leading quote or slash; then optional @scope/ then name; then @version.
  const re = /^\s+['"/]?((?:@[^/'"\s]+\/)?[^@/\s'"]+)@/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) names.add(m[1]);
  }
  return names;
}
