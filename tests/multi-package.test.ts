import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { hasRootLockfile, findNestedLockfiles, loadMultiplePackages } from "../src/parsers/multi-package.js";
import { removeDir } from "./test-utils.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cve-multi-test-"));
}

describe("hasRootLockfile", () => {
  it("returns true when package-lock.json exists at root", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "package-lock.json"), "{}");
    expect(hasRootLockfile(dir)).toBe(true);
    removeDir(dir);
  });

  it("returns false when no lockfile at root", () => {
    const dir = makeTempDir();
    expect(hasRootLockfile(dir)).toBe(false);
    removeDir(dir);
  });

  it("returns false when lockfile is nested, not at root", () => {
    const dir = makeTempDir();
    const sub = path.join(dir, "packages", "app");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, "package-lock.json"), "{}");
    expect(hasRootLockfile(dir)).toBe(false);
    removeDir(dir);
  });
});

describe("findNestedLockfiles", () => {
  it("finds lockfiles in immediate subdirectories", () => {
    const dir = makeTempDir();
    const a = path.join(dir, "a");
    const b = path.join(dir, "b");
    fs.mkdirSync(a);
    fs.mkdirSync(b);
    fs.writeFileSync(path.join(a, "package-lock.json"), "{}");
    fs.writeFileSync(path.join(b, "package-lock.json"), "{}");
    const result = findNestedLockfiles(dir, 4);
    expect(result).toHaveLength(2);
    expect(result.some(f => f.includes("a"))).toBe(true);
    expect(result.some(f => f.includes("b"))).toBe(true);
    removeDir(dir);
  });

  it("does not recurse past a lockfile", () => {
    const dir = makeTempDir();
    const a = path.join(dir, "a");
    const aSub = path.join(a, "nested");
    fs.mkdirSync(aSub, { recursive: true });
    fs.writeFileSync(path.join(a, "package-lock.json"), "{}");
    fs.writeFileSync(path.join(aSub, "package-lock.json"), "{}");
    const result = findNestedLockfiles(dir, 4);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain(path.join("a", "package-lock.json"));
    removeDir(dir);
  });

  it("returns empty array when no nested lockfiles", () => {
    const dir = makeTempDir();
    expect(findNestedLockfiles(dir, 4)).toEqual([]);
    removeDir(dir);
  });

  it("skips node_modules directories", () => {
    const dir = makeTempDir();
    const nm = path.join(dir, "node_modules", "some-pkg");
    fs.mkdirSync(nm, { recursive: true });
    fs.writeFileSync(path.join(nm, "package-lock.json"), "{}");
    expect(findNestedLockfiles(dir, 4)).toEqual([]);
    removeDir(dir);
  });
});

describe("loadMultiplePackages", () => {
  it("returns one ScanInput per nested lockfile", () => {
    const dir = makeTempDir();
    const a = path.join(dir, "a");
    fs.mkdirSync(a);
    // Minimal valid package-lock.json v3
    fs.writeFileSync(path.join(a, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { "lodash": "4.17.20" } },
        "node_modules/lodash": { version: "4.17.20", resolved: "", integrity: "" }
      }
    }));
    const b = path.join(dir, "b");
    fs.mkdirSync(b);
    fs.writeFileSync(path.join(b, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { "axios": "1.7.7" } },
        "node_modules/axios": { version: "1.7.7", resolved: "", integrity: "" }
      }
    }));
    const result = loadMultiplePackages(dir, false, 4);
    expect(result).toHaveLength(2);
    const subfolders = result.map(r => r.subfolder).sort();
    expect(subfolders).toEqual(["a", "b"]);
    removeDir(dir);
  });
});
