import fs from "node:fs";
import path from "node:path";
import { loadPackages } from "../src/parsers/index.js";
import { buildSuggestedFixCommandPlan } from "../src/remediation/fix-commands.js";
import { isPrivateRegistrySource, isGitSource, hasCommitShaPinning } from "../src/utils/advisory.js";
import type { Finding, PackageRef, ScanInput } from "../src/types.js";

const examplesDir = path.join(process.cwd(), "examples");

function loadFixture(name: string): ScanInput {
  return loadPackages(path.join(examplesDir, name), false, 4);
}

function itWithFixture(name: string, testName: string, testFn: () => void): void {
  const fixtureTest = fs.existsSync(path.join(examplesDir, name)) ? it : it.skip;
  fixtureTest(testName, testFn);
}

function requirePackage(scanInput: ScanInput, name: string, version?: string): PackageRef {
  const pkg = scanInput.packages.find(
    item => item.name === name && (version === undefined || item.version === version),
  );
  if (!pkg) {
    const versionSuffix = version ? `@${version}` : "";
    throw new Error(`Expected fixture to include ${name}${versionSuffix}`);
  }
  return pkg;
}

function findingFor(
  scanInput: ScanInput,
  packageName: string,
  overrides: Partial<Finding>,
): Finding {
  const pkg = requirePackage(scanInput, packageName);
  return {
    pkg,
    vulnerabilities: [{ id: `OSV-${packageName}` }],
    severity: "high",
    cveAliases: [],
    dependencyPaths: pkg.paths ?? [["project", packageName]],
    relationship: "direct",
    firstFixedVersion: null,
    ...overrides,
  };
}

describe("fixture remediation scans", () => {
  it("suggests a package-lock refresh for wrong-parent instead of upgrading the parent", () => {
    const scanInput = loadFixture("wrong-parent");
    const finding = findingFor(scanInput, "js-cookie", {
      relationship: "transitive",
      firstFixedVersion: "3.0.7",
      recommendedNpmTransitiveRemediation: {
        kind: "update-parent-within-range",
        package: "js-cookie",
        currentVersion: "3.0.6",
        targetChildVersion: "3.0.7",
        viaPath: ["project", "@aws-amplify/core", "js-cookie"],
        reason: "js-cookie can be refreshed within @aws-amplify/core's declared range.",
      },
    });

    const plan = buildSuggestedFixCommandPlan([finding], scanInput);

    expect(plan?.packageManager).toBe("npm");
    expect(plan?.command).toBe("npm update js-cookie");
    expect(plan?.targets).toEqual([
      expect.objectContaining({
        package: "js-cookie",
        kind: "parent-update",
        displayTargetVersion: "lockfile refresh",
      }),
    ]);
    expect(plan?.targets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ package: "@aws-amplify/core", kind: "parent-upgrade" }),
      ]),
    );
  });

  itWithFixture(
    "yarn-within-range",
    "suggests a yarn lockfile refresh for yarn-within-range instead of upgrading the parent",
    () => {
      const scanInput = loadFixture("yarn-within-range");
      const finding = findingFor(scanInput, "js-cookie", {
        relationship: "transitive",
        firstFixedVersion: "3.0.7",
        dependencyPaths: [["project", "@aws-amplify/core", "js-cookie"]],
        recommendedNpmTransitiveRemediation: {
          kind: "update-parent-within-range",
          package: "@aws-amplify/core",
          currentVersion: "6.16.1",
          targetChildVersion: "3.0.7",
          viaPath: ["project", "@aws-amplify/core", "js-cookie"],
          reason: "js-cookie can be refreshed within @aws-amplify/core's declared range.",
        },
      });

      const plan = buildSuggestedFixCommandPlan([finding], scanInput);

      expect(plan?.packageManager).toBe("yarn");
      expect(plan?.command).toBe("yarn upgrade js-cookie");
      expect(plan?.targets).toEqual([
        expect.objectContaining({
          package: "js-cookie",
          kind: "parent-update",
          displayTargetVersion: "lockfile refresh",
        }),
      ]);
      expect(plan?.targets).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ package: "@aws-amplify/core", kind: "parent-upgrade" }),
        ]),
      );
    },
  );

  it("builds a direct dependency target for direct-fixable", () => {
    const scanInput = loadFixture("direct-fixable");
    const finding = findingFor(scanInput, "axios", {
      relationship: "direct",
      firstFixedVersion: "0.21.2",
      validatedFirstFixedVersion: "0.21.2",
    });

    const plan = buildSuggestedFixCommandPlan([finding], scanInput);

    expect(plan?.command).toBe("npm install axios@0.21.2");
    expect(plan?.sections).toEqual([
      expect.objectContaining({
        kind: "urgent",
        command: "npm install axios@0.21.2",
      }),
    ]);
    expect(plan?.targets).toEqual([
      expect.objectContaining({ package: "axios", kind: "direct" }),
    ]);
  });

  it("keeps transitive-only findings out of direct fix targets", () => {
    const scanInput = loadFixture("transitive-only");
    const finding = findingFor(scanInput, "string-width", {
      relationship: "transitive",
      firstFixedVersion: "7.2.1",
      dependencyPaths: [["project", "lint-staged", "string-width"]],
      recommendedParentUpgrade: {
        package: "lint-staged",
        currentVersion: "15.2.0",
        targetVersion: "15.2.1",
        viaPath: ["project", "lint-staged", "string-width"],
        vulnerablePackage: "string-width",
        confidence: "exact-direct-child",
        reason: "Upgrade lint-staged to pick up a safe string-width release.",
      },
    });

    const plan = buildSuggestedFixCommandPlan([finding], scanInput);

    expect(plan?.targets).toEqual([
      expect.objectContaining({
        package: "lint-staged",
        kind: "parent-upgrade",
      }),
    ]);
    expect(plan?.targets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ package: "string-width", kind: "direct" }),
      ]),
    );
  });

  it("loads no-findings with no mocked findings and produces no fix command", () => {
    const scanInput = loadFixture("no-findings");

    expect(scanInput.packages.length).toBeGreaterThan(0);
    expect(buildSuggestedFixCommandPlan([], scanInput)).toEqual(
      expect.objectContaining({
        command: null,
        sections: [],
        targets: [],
        skipped: [],
        totalFindingCount: 0,
      }),
    );
  });

  itWithFixture(
    "multiple-versions-same-pkg",
    "reports lodash@3 and lodash@4 as separate installed packages with correct relationships",
    () => {
      const scanInput = loadFixture("multiple-versions-same-pkg");
      const lodash3 = requirePackage(scanInput, "lodash", "3.10.1");
      const lodash4 = requirePackage(scanInput, "lodash", "4.17.20");

      expect(scanInput.packages.filter(item => item.name === "lodash")).toHaveLength(2);
      expect(lodash3.paths?.every(path => path.length > 2)).toBe(true);
      expect(lodash4.paths?.some(path => path.length <= 2)).toBe(true);

      const directFinding = findingFor(scanInput, "lodash", {
        relationship: "direct",
        firstFixedVersion: "4.18.0",
        validatedFirstFixedVersion: "4.18.0",
      });
      directFinding.pkg = lodash4;

      const transitiveFinding = findingFor(scanInput, "lodash", {
        relationship: "transitive",
        firstFixedVersion: "4.18.0",
        validatedFirstFixedVersion: "4.18.0",
        dependencyPaths: lodash3.paths ?? [],
      });
      transitiveFinding.pkg = lodash3;

      const directPlan = buildSuggestedFixCommandPlan([directFinding], scanInput);
      const transitivePlan = buildSuggestedFixCommandPlan([transitiveFinding], scanInput);

      expect(directPlan?.command).toBe("npm install lodash@4.18.0");
      expect(directPlan?.targets.find(t => t.kind === "direct")?.package).toBe("lodash");
      expect(transitivePlan?.targets.find(t => t.kind === "direct")).toBeUndefined();
    },
  );

  it("mal-private-registry fixture - node-ipc resolvedUrl is from a private registry", () => {
    const scanInput = loadFixture("mal-private-registry");
    const nodeIpc = scanInput.packages.find(p => p.name === "node-ipc");

    expect(nodeIpc).toBeDefined();
    expect(nodeIpc?.resolvedUrl).toBe("https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz");
    expect(isPrivateRegistrySource(nodeIpc!)).toBe(true);
  });

  it("pnpm-mal-private-registry fixture - node-ipc resolvedUrl is from a private registry", () => {
    const scanInput = loadFixture("pnpm-mal-private-registry");
    const nodeIpc = scanInput.packages.find(p => p.name === "node-ipc");
    expect(nodeIpc).toBeDefined();
    expect(nodeIpc?.resolvedUrl).toBe("https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz");
    expect(isPrivateRegistrySource(nodeIpc!)).toBe(true);
  });

  it("pnpm-legacy-mal-private-registry fixture - node-ipc resolvedUrl is from a private registry", () => {
    const scanInput = loadFixture("pnpm-legacy-mal-private-registry");
    const nodeIpc = scanInput.packages.find(p => p.name === "node-ipc");
    expect(nodeIpc).toBeDefined();
    expect(nodeIpc?.resolvedUrl).toBe("https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz");
    expect(isPrivateRegistrySource(nodeIpc!)).toBe(true);
  });

  it("yarn-classic-mal-private-registry fixture - node-ipc resolvedUrl is from a private registry", () => {
    const scanInput = loadFixture("yarn-classic-mal-private-registry");
    const nodeIpc = scanInput.packages.find(p => p.name === "node-ipc");
    expect(nodeIpc).toBeDefined();
    expect(nodeIpc?.resolvedUrl).toBe("https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz");
    expect(isPrivateRegistrySource(nodeIpc!)).toBe(true);
  });

  it("bun-mal-private-registry fixture - node-ipc resolvedUrl is from a private registry", () => {
    const scanInput = loadFixture("bun-mal-private-registry");
    const nodeIpc = scanInput.packages.find(p => p.name === "node-ipc");
    expect(nodeIpc).toBeDefined();
    expect(nodeIpc?.resolvedUrl).toBe("https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz");
    expect(isPrivateRegistrySource(nodeIpc!)).toBe(true);
  });

  it("git-source-mal fixture - node-ipc is detected as git source with SHA pinning", () => {
    const scanInput = loadFixture("git-source-mal");
    const nodeIpc = scanInput.packages.find(p => p.name === "node-ipc");
    expect(nodeIpc).toBeDefined();
    expect(isGitSource(nodeIpc!)).toBe(true);
    expect(hasCommitShaPinning(nodeIpc!)).toBe(true);
    expect(nodeIpc?.resolvedUrl).toContain("codeload.github.com");
  });
});
