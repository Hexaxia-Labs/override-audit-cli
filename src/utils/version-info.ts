import fs from "node:fs";

type PackageJsonShape = {
  version?: string;
};

export function getCliVersion(): string {
  try {
    const packageJsonPath = new URL("../../package.json", import.meta.url);
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as PackageJsonShape;
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
