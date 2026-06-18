import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readBaseline, writeBaseline, filterNewFindings } from "../src/utils/baseline.js";
import type { Finding } from "../src/types.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-baseline-test-"));
}

function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeFinding(name: string, version: string, advisoryIds: string[]): Finding {
  return {
    pkg: { name, version, ecosystem: "npm" },
    vulnerabilities: advisoryIds.map(id => ({ id, aliases: [], summary: "" })),
    severity: "high",
    cveAliases: [],
    dependencyPaths: [["project", name]],
    relationship: "direct",
    firstFixedVersion: null,
  };
}

describe("baseline utilities", () => {
  it("readBaseline returns null when file does not exist", () => {
    const dir = makeTempDir();
    try {
      expect(readBaseline(dir)).toBeNull();
    } finally {
      removeDir(dir);
    }
  });

  it("writeBaseline creates .cve-lite directory and baseline.json", () => {
    const dir = makeTempDir();
    try {
      const findings = [makeFinding("lodash", "4.17.20", ["GHSA-xxx"])];
      writeBaseline(dir, findings);
      expect(fs.existsSync(path.join(dir, ".cve-lite", "baseline.json"))).toBe(true);
    } finally {
      removeDir(dir);
    }
  });

  it("readBaseline returns written baseline", () => {
    const dir = makeTempDir();
    try {
      const findings = [makeFinding("lodash", "4.17.20", ["GHSA-xxx"])];
      writeBaseline(dir, findings);
      const baseline = readBaseline(dir);
      expect(baseline).not.toBeNull();
      expect(baseline!.version).toBe(1);
      expect(baseline!.findings).toHaveLength(1);
      expect(baseline!.findings[0]).toEqual({ name: "lodash", version: "4.17.20", advisoryIds: ["GHSA-xxx"] });
    } finally {
      removeDir(dir);
    }
  });

  it("writeBaseline overwrites existing baseline", () => {
    const dir = makeTempDir();
    try {
      writeBaseline(dir, [makeFinding("lodash", "4.17.20", ["GHSA-xxx"])]);
      writeBaseline(dir, [makeFinding("axios", "0.21.1", ["GHSA-yyy"])]);
      const baseline = readBaseline(dir);
      expect(baseline!.findings).toHaveLength(1);
      expect(baseline!.findings[0].name).toBe("axios");
    } finally {
      removeDir(dir);
    }
  });

  it("filterNewFindings suppresses findings present in baseline", () => {
    const dir = makeTempDir();
    try {
      const findings = [makeFinding("lodash", "4.17.20", ["GHSA-xxx"])];
      writeBaseline(dir, findings);
      const baseline = readBaseline(dir)!;
      const { newFindings, suppressedCount } = filterNewFindings(findings, baseline);
      expect(newFindings).toHaveLength(0);
      expect(suppressedCount).toBe(1);
    } finally {
      removeDir(dir);
    }
  });

  it("filterNewFindings surfaces findings for packages not in baseline", () => {
    const dir = makeTempDir();
    try {
      writeBaseline(dir, [makeFinding("lodash", "4.17.20", ["GHSA-xxx"])]);
      const baseline = readBaseline(dir)!;
      const newPkg = makeFinding("axios", "0.21.1", ["GHSA-yyy"]);
      const { newFindings, suppressedCount } = filterNewFindings([newPkg], baseline);
      expect(newFindings).toHaveLength(1);
      expect(suppressedCount).toBe(0);
    } finally {
      removeDir(dir);
    }
  });

  it("filterNewFindings surfaces findings with new advisory IDs not in baseline", () => {
    const dir = makeTempDir();
    try {
      writeBaseline(dir, [makeFinding("lodash", "4.17.20", ["GHSA-xxx"])]);
      const baseline = readBaseline(dir)!;
      const findingWithNewAdvisory = makeFinding("lodash", "4.17.20", ["GHSA-xxx", "GHSA-new"]);
      const { newFindings, suppressedCount } = filterNewFindings([findingWithNewAdvisory], baseline);
      expect(newFindings).toHaveLength(1);
      expect(suppressedCount).toBe(0);
    } finally {
      removeDir(dir);
    }
  });

  it("filterNewFindings suppresses when all advisory IDs are in baseline", () => {
    const dir = makeTempDir();
    try {
      writeBaseline(dir, [makeFinding("lodash", "4.17.20", ["GHSA-xxx", "GHSA-yyy"])]);
      const baseline = readBaseline(dir)!;
      const finding = makeFinding("lodash", "4.17.20", ["GHSA-xxx", "GHSA-yyy"]);
      const { newFindings, suppressedCount } = filterNewFindings([finding], baseline);
      expect(newFindings).toHaveLength(0);
      expect(suppressedCount).toBe(1);
    } finally {
      removeDir(dir);
    }
  });
});
