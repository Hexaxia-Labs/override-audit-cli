import { existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PackageManager } from '../types.js';

export class UnsupportedPackageManagerError extends Error {
  constructor(public readonly detected: string | null, public readonly projectPath: string) {
    super(
      detected
        ? `Unsupported package manager '${detected}' at ${projectPath} (v1 supports npm and pnpm only).`
        : `No supported lockfile found at ${projectPath} (expected package-lock.json or pnpm-lock.yaml).`
    );
    this.name = 'UnsupportedPackageManagerError';
  }
}

/**
 * Detect the project's package manager.
 *
 * Priority:
 *   1. Most-recently-modified lockfile (package-lock.json vs pnpm-lock.yaml).
 *   2. `packageManager` field in package.json (npm@x / pnpm@x).
 *   3. `pnpm-workspace.yaml` presence → pnpm.
 *   4. Throws UnsupportedPackageManagerError otherwise.
 */
export function detectPackageManager(projectPath: string): PackageManager {
  const lockCandidates: { pm: PackageManager; file: string }[] = [
    { pm: 'npm', file: 'package-lock.json' },
    { pm: 'pnpm', file: 'pnpm-lock.yaml' },
  ];

  const present = lockCandidates
    .map(({ pm, file }) => {
      const p = join(projectPath, file);
      return existsSync(p) ? { pm, mtimeMs: statSync(p).mtimeMs } : null;
    })
    .filter((x): x is { pm: PackageManager; mtimeMs: number } => x !== null);

  if (present.length > 0) {
    present.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return present[0]!.pm;
  }

  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { packageManager?: string };
      if (typeof pkg.packageManager === 'string') {
        if (pkg.packageManager.startsWith('npm@')) return 'npm';
        if (pkg.packageManager.startsWith('pnpm@')) return 'pnpm';
        throw new UnsupportedPackageManagerError(pkg.packageManager.split('@')[0] ?? null, projectPath);
      }
    } catch (err) {
      if (err instanceof UnsupportedPackageManagerError) throw err;
      // Fall through to other detection strategies on JSON parse failure.
    }
  }

  if (existsSync(join(projectPath, 'pnpm-workspace.yaml'))) return 'pnpm';

  throw new UnsupportedPackageManagerError(null, projectPath);
}
