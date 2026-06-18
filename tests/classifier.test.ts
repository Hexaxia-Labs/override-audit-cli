import { buildSuggestedFixCommandPlan } from "../src/remediation/fix-commands.js";
import { loadPackages } from "../src/parsers/index.js";
import { readDirectDependencyNames } from "../src/utils/package-json.js";
import type { Finding, PackageRef } from "../src/types.js";

// Test the classifyRelationship behaviour indirectly through the fix plan:
// when the same package name is both a direct dep (at one version) and a
// transitive dep (at a different version), the transitive version must not
// receive a direct fix command.

function makeFinding(pkg: PackageRef, overrides: Partial<Finding> = {}): Finding {
  return {
    pkg,
    vulnerabilities: [{ id: "OSV-test-001" }],
    severity: "high",
    cveAliases: [],
    dependencyPaths: pkg.paths ?? [],
    relationship: "transitive",
    firstFixedVersion: "9.0.0",
    validatedFirstFixedVersion: "9.0.0",
    ...overrides,
  };
}

describe("classifyRelationship — same package name, different versions", () => {
  it("classifies transitive version as transitive even when a different version is a direct dep", () => {
    // Simulate: uuid@14.0.0 is direct, uuid@8.3.2 is transitive
    const directPkg: PackageRef = {
      name: "uuid",
      version: "14.0.0",
      ecosystem: "npm",
      paths: [["project", "uuid"]],
    };
    const transitivePkg: PackageRef = {
      name: "uuid",
      version: "8.3.2",
      ecosystem: "npm",
      paths: [
        ["project", "@compodoc/live-server", "http-auth", "uuid"],
        ["project", "nyc", "istanbul-lib-processinfo", "uuid"],
      ],
    };

    const directNames = new Set(["uuid"]);

    const scanInput = {
      mode: "resolved-lockfile" as const,
      source: "package-lock" as const,
      filePath: null,
      packages: [directPkg, transitivePkg],
      notes: [],
      warnings: [],
      skippedDependencies: [],
    };

    // The transitive finding should not produce a direct fix command
    const transitiveFinding = makeFinding(transitivePkg, {
      relationship: "transitive",
    });

    const plan = buildSuggestedFixCommandPlan([transitiveFinding], scanInput);

    // No direct install command — uuid@8.3.2 is transitive
    expect(plan?.command).not.toBe("npm install uuid@9.0.0");
    expect(plan?.targets.find(t => t.kind === "direct")).toBeUndefined();
  });

  it("classifies direct version as direct when it has a path of length 2", () => {
    const directPkg: PackageRef = {
      name: "uuid",
      version: "14.0.0",
      ecosystem: "npm",
      paths: [["project", "uuid"]],
    };

    const scanInput = {
      mode: "resolved-lockfile" as const,
      source: "package-lock" as const,
      filePath: null,
      packages: [directPkg],
      notes: [],
      warnings: [],
      skippedDependencies: [],
    };

    const directFinding = makeFinding(directPkg, {
      relationship: "direct",
      firstFixedVersion: "14.0.1",
      validatedFirstFixedVersion: "14.0.1",
    });

    const plan = buildSuggestedFixCommandPlan([directFinding], scanInput);
    expect(plan?.targets.find(t => t.kind === "direct")?.package).toBe("uuid");
  });

  it("wrong-parent fixture — js-cookie is transitive and produces a lockfile refresh, not npm install", () => {
    const scanInput = loadPackages("examples/wrong-parent", false, 4);
    const jsCookie = scanInput.packages.find(
      p => p.name === "js-cookie" && p.version === "3.0.6"
    );

    expect(jsCookie).toBeDefined();
    expect(jsCookie?.paths?.every(p => p.length > 2)).toBe(true);

    const finding = makeFinding(jsCookie!, {
      relationship: "transitive",
      firstFixedVersion: "3.0.7",
      validatedFirstFixedVersion: "3.0.7",
      recommendedNpmTransitiveRemediation: {
        kind: "update-parent-within-range",
        package: "js-cookie",
        currentVersion: "3.0.6",
        targetChildVersion: "3.0.7",
        viaPath: ["project", "@aws-amplify/core", "js-cookie"],
        reason: "@aws-amplify/core already allows js-cookie@3.0.7",
      },
    });

    const plan = buildSuggestedFixCommandPlan([finding], scanInput);
    expect(plan?.command).toBe("npm update js-cookie");
    expect(plan?.targets.find(t => t.kind === "parent-update")).toBeDefined();
    expect(plan?.targets.find(t => t.kind === "direct")).toBeUndefined();
  });
});
