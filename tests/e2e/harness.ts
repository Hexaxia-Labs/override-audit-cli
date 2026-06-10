/**
 * Shared end-to-end harness: spawn the real built CLI and build throwaway
 * projects. Plan 8 (100% control coverage). dist/ is guaranteed fresh by
 * tests/e2e/global-setup.mjs.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const CLI = join(here, "..", "..", "dist", "index.js");

export interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

/**
 * Spawn `node dist/index.js <args>` in cwd. Never throws on non-zero exit;
 * returns the captured streams and status so a test can assert on any of them.
 */
export function runCli(args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): CliResult {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    encoding: "utf8",
  });
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    // spawnSync status is null when killed by signal; normalize to -1.
    status: res.status ?? -1,
  };
}

type FileSpec = string | Record<string, unknown>;

/**
 * Make a throwaway project directory. Keys are relative paths; object values
 * are JSON-stringified, string values written verbatim. Returns the dir; the
 * caller cleans up (use makeTempRoot + afterEach, or rmProject).
 */
export function mkProject(files: Record<string, FileSpec>): string {
  const dir = mkdtempSync(join(tmpdir(), "e2e-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}

export function rmProject(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Minimal npm project with a package-lock listing the given installed names@versions. */
export function npmProject(pkg: Record<string, unknown>, lockNames: Record<string, string>): Record<string, FileSpec> {
  const packages: Record<string, unknown> = { "": { name: (pkg.name as string) ?? "x" } };
  for (const [name, version] of Object.entries(lockNames)) {
    packages[`node_modules/${name}`] = { version };
  }
  return {
    "package.json": pkg,
    "package-lock.json": { lockfileVersion: 3, packages },
  };
}

/** Minimal pnpm project: package.json + a pnpm-lock snapshots section. */
export function pnpmProject(pkg: Record<string, unknown>, snapshotNames: Record<string, string>): Record<string, FileSpec> {
  const lines = ["lockfileVersion: '9.0'", "snapshots:"];
  for (const [name, version] of Object.entries(snapshotNames)) {
    const key = name.startsWith("@") ? `'${name}@${version}'` : `${name}@${version}`;
    lines.push(`  ${key}: {}`);
  }
  return {
    "package.json": pkg,
    "pnpm-lock.yaml": lines.join("\n") + "\n",
  };
}

/** Write an installed manifest under node_modules (for OA004/OA006/OA008 fixtures). */
export function installedManifest(dir: string, name: string, manifest: Record<string, unknown>): void {
  const full = join(dir, "node_modules", name, "package.json");
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(manifest, null, 2));
}

/** Build dist if a test needs it explicitly (globalSetup already does this). */
export function ensureBuilt(): void {
  execFileSync("npm", ["run", "build"], { cwd: join(here, "..", ".."), stdio: "ignore" });
}
