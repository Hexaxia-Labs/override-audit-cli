import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface InstalledManifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** Return the installed version of `pkgName` under `projectPath`, or null. */
export function readInstalledVersion(projectPath: string, pkgName: string): string | null {
  const m = readInstalledManifest(projectPath, pkgName);
  return m?.version ?? null;
}

/** Return the parsed `node_modules/<pkgName>/package.json`, or null. */
export function readInstalledManifest(projectPath: string, pkgName: string): InstalledManifest | null {
  const path = join(projectPath, 'node_modules', pkgName, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as InstalledManifest;
  } catch {
    return null;
  }
}
