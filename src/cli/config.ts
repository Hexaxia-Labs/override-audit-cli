import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ConfigAction = {
  Set: "set",
  Unset: "unset",
  Show: "show",
} as const;
export type ConfigAction = (typeof ConfigAction)[keyof typeof ConfigAction];

export const ConfigKey = {
  CaCert: "ca-cert",
} as const;
export type ConfigKey = (typeof ConfigKey)[keyof typeof ConfigKey];

export type CliConfig = {
  caCert?: string;
};

export function getConfigDir(): string {
  return path.join(os.homedir(), ".cve-lite-cli");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function readConfig(): CliConfig {
  const configPath = getConfigPath();
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const config: CliConfig = {};
    if (typeof (parsed as Record<string, unknown>).caCert === "string") {
      config.caCert = (parsed as Record<string, unknown>).caCert as string;
    }
    return config;
  } catch {
    return {};
  }
}

export function validateCaCertFile(filePath: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new Error(`cannot read file: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`not a file: ${filePath}`);
  }
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    throw new Error(`cannot read file: ${filePath}`);
  }
  if (content.trim().length === 0) {
    throw new Error(`file is empty: ${filePath}`);
  }
  if (!content.trimStart().startsWith("-----BEGIN")) {
    throw new Error(`not a valid PEM certificate (expected file to start with -----BEGIN): ${filePath}`);
  }
}

export function writeConfig(config: CliConfig): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n", "utf8");
}
