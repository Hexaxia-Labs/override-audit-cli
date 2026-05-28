import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export function readDirectDependencyNames(projectPath: string, prodOnly: boolean): Set<string> | null {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const directNames = new Set<string>();
    const rootManifest = readPackageJsonObject(packageJsonPath);
    if (!rootManifest) {
      return null;
    }

    addDependencyNamesFromManifest(directNames, rootManifest, prodOnly);

    const workspacePatterns = readWorkspacePatterns(rootManifest, projectPath);
    for (const workspacePackageJsonPath of resolveWorkspacePackageJsonPaths(projectPath, workspacePatterns)) {
      const workspaceManifest = readPackageJsonObject(workspacePackageJsonPath);
      if (!workspaceManifest) continue;
      addDependencyNamesFromManifest(directNames, workspaceManifest, prodOnly);
    }

    return directNames;
  } catch {
    return null;
  }
}

function readPackageJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function addDependencyNamesFromManifest(
  target: Set<string>,
  manifest: Record<string, unknown>,
  prodOnly: boolean,
) {
  const sections: Array<Record<string, unknown> | undefined> = [
    isRecord(manifest.dependencies) ? manifest.dependencies : undefined,
    isRecord(manifest.optionalDependencies) ? manifest.optionalDependencies : undefined,
  ];
  if (!prodOnly) {
    sections.push(isRecord(manifest.devDependencies) ? manifest.devDependencies : undefined);
  }

  for (const section of sections) {
    if (!section) continue;
    for (const name of Object.keys(section)) {
      target.add(name);
    }
  }
}

function readWorkspacePatterns(manifest: Record<string, unknown>, projectPath: string): string[] {
  const workspaces = manifest.workspaces;
  if (Array.isArray(workspaces)) {
    return workspaces.filter((value): value is string => typeof value === "string");
  }

  if (isRecord(workspaces) && Array.isArray(workspaces.packages)) {
    return workspaces.packages.filter((value): value is string => typeof value === "string");
  }

  const pnpmWorkspaceYamlPath = path.join(projectPath, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmWorkspaceYamlPath)) {
    try {
      const parsed = YAML.parse(fs.readFileSync(pnpmWorkspaceYamlPath, "utf8")) as any;
      const packages = parsed?.packages;
      if (Array.isArray(packages)) {
        return packages.filter((value): value is string => typeof value === "string");
      }
    } catch {
      // ignore
    }
  }

  return [];
}

function resolveWorkspacePackageJsonPaths(projectPath: string, patterns: string[]): string[] {
  const matches = new Set<string>();

  for (const pattern of patterns) {
    const normalized = pattern.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalized) continue;

    for (const relativeDir of expandWorkspacePattern(projectPath, normalized.split("/").filter(Boolean), "")) {
      const packageJsonPath = path.join(projectPath, relativeDir, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        matches.add(packageJsonPath);
      }
    }
  }

  return [...matches];
}

function expandWorkspacePattern(projectPath: string, segments: string[], currentRelativePath: string): string[] {
  if (segments.length === 0) {
    return currentRelativePath ? [currentRelativePath] : [];
  }

  const [segment, ...rest] = segments;
  if (segment === "*") {
    const baseDir = currentRelativePath ? path.join(projectPath, currentRelativePath) : projectPath;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch {
      return [];
    }

    return entries
      .filter(entry => entry.isDirectory())
      .flatMap(entry => {
        const nextRelativePath = currentRelativePath
          ? path.join(currentRelativePath, entry.name)
          : entry.name;
        return expandWorkspacePattern(projectPath, rest, nextRelativePath);
      });
  }

  const nextRelativePath = currentRelativePath ? path.join(currentRelativePath, segment) : segment;
  const nextAbsolutePath = path.join(projectPath, nextRelativePath);
  if (!fs.existsSync(nextAbsolutePath) || !fs.statSync(nextAbsolutePath).isDirectory()) {
    return [];
  }

  return expandWorkspacePattern(projectPath, rest, nextRelativePath);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
