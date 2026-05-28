import fs from "node:fs";
import type { PackageRef } from "../types.js";
import { parseExactManifestVersion } from "../utils/version.js";
import { upsertPackage } from "./utils.js";

export function loadFromPackageJson(
  filePath: string,
  prodOnly: boolean
): { packages: PackageRef[]; skippedDependencies: string[] } {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const map = new Map<string, PackageRef>();
  const skipped: string[] = [];

  const sections: Array<{ name: string; deps: Record<string, string> | undefined; dev: boolean }> = [
    { name: "dependencies", deps: raw.dependencies, dev: false },
    { name: "optionalDependencies", deps: raw.optionalDependencies, dev: false }
  ];

  if (!prodOnly) {
    sections.push({ name: "devDependencies", deps: raw.devDependencies, dev: true });
  }

  for (const section of sections) {
    if (!section.deps || typeof section.deps !== "object") continue;

    for (const [name, spec] of Object.entries(section.deps)) {
      const exactVersion = parseExactManifestVersion(String(spec));
      if (!exactVersion) {
        skipped.push(`${section.name}:${name}@${spec}`);
        continue;
      }

      upsertPackage(map, {
        name,
        version: exactVersion,
        ecosystem: "npm",
        dev: section.dev,
        paths: [["project", name]]
      });
    }
  }

  return {
    packages: [...map.values()],
    skippedDependencies: skipped.slice(0, 50)
  };
}
