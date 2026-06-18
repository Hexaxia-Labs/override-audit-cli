import { jest } from "@jest/globals";
import type { Finding, PackageRef } from "../src/types.js";
import { clearPackumentCache } from "../src/remediation/npm-registry.js";
import { createNpmTransitiveGraph, findSafeVersionWithinParentRange } from "../src/remediation/npm-transitive-graph.js";
import { resolveNpmTransitiveRemediation, resolveTransitiveRemediationViaRegistry } from "../src/remediation/npm-transitive-resolution.js";

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function createPackages(): PackageRef[] {
  return [
    {
      name: "app",
      version: "1.0.0",
      ecosystem: "npm",
      paths: [["project", "app"]],
    },
    {
      name: "mid",
      version: "2.0.0",
      ecosystem: "npm",
      paths: [["project", "app", "mid"]],
    },
    {
      name: "lodash",
      version: "4.17.20",
      ecosystem: "npm",
      paths: [
        ["project", "app", "lodash"],
        ["project", "app", "mid", "lodash"],
      ],
    },
  ];
}

function createFinding(overrides?: Partial<Finding>): Finding {
  return {
    pkg: {
      name: "lodash",
      version: "4.17.20",
      ecosystem: "npm",
      paths: [["project", "app", "lodash"]],
    },
    vulnerabilities: [{ id: "OSV-123" }],
    severity: "high",
    cveAliases: [],
    dependencyPaths: [["project", "app", "lodash"]],
    relationship: "transitive",
    firstFixedVersion: "4.17.21",
    recommendedParentUpgrade: undefined,
    ...overrides,
  };
}

function mockPackument(data: unknown, ok = true) {
  fetchMock.mockResolvedValue({
    ok,
    json: async () => data,
  });
}

function packageNameFromRegistryUrl(url: string): string {
  const prefix = "https://registry.npmjs.org/";
  if (url.startsWith(prefix)) {
    return decodeURIComponent(url.slice(prefix.length));
  }
  return decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
}

function mockPackumentsByPackage(packuments: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    const packageName = packageNameFromRegistryUrl(url);
    const data = packuments[packageName];

    return {
      ok: data !== undefined,
      json: async () => data,
    } as Response;
  });
}

async function loadResolver() {
  const module = await import(`../src/remediation/parent-upgrade.js?test=${Date.now()}-${Math.random()}`);
  return module.resolveRecommendedParentUpgrade;
}

describe("npm transitive graph helpers", () => {
  it("finds the highest safe child version that still satisfies the immediate parent range", () => {
    const graph = createNpmTransitiveGraph({
      nodes: [
        {
          id: "node_modules/mocha",
          name: "mocha",
          version: "10.0.0",
        },
        {
          id: "node_modules/diff",
          name: "diff",
          version: "5.0.0",
        },
      ],
      edges: [
        {
          parentNodeId: "node_modules/mocha",
          childName: "diff",
          childNodeId: "node_modules/diff",
          range: "^5.0.0",
        },
      ],
    });

    const result = findSafeVersionWithinParentRange({
      graph,
      parentNodeId: "node_modules/mocha",
      childName: "diff",
      candidates: ["5.0.1", "5.1.0", "6.0.0"],
    });

    expect(result).toBe("5.1.0");
  });

  it("returns null when no safe child version fits the current parent range", () => {
    const graph = createNpmTransitiveGraph({
      nodes: [
        {
          id: "node_modules/mocha",
          name: "mocha",
          version: "10.0.0",
        },
        {
          id: "node_modules/diff",
          name: "diff",
          version: "5.0.0",
        },
      ],
      edges: [
        {
          parentNodeId: "node_modules/mocha",
          childName: "diff",
          childNodeId: "node_modules/diff",
          range: "^5.0.0",
        },
      ],
    });

    const result = findSafeVersionWithinParentRange({
      graph,
      parentNodeId: "node_modules/mocha",
      childName: "diff",
      candidates: ["6.0.0", "6.1.0"],
    });

    expect(result).toBeNull();
  });
});

describe("resolveNpmTransitiveRemediation", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    clearPackumentCache();
  });

  it("returns an in-range parent update outcome when the parent can absorb a safe child version", async () => {
    const graph = createNpmTransitiveGraph({
      nodes: [
        { id: "node_modules/mocha", name: "mocha", version: "10.0.0" },
        { id: "node_modules/diff", name: "diff", version: "5.0.0" },
      ],
      edges: [
        {
          parentNodeId: "node_modules/mocha",
          childName: "diff",
          childNodeId: "node_modules/diff",
          range: "^5.0.0",
        },
      ],
    });

    mockPackumentsByPackage({
      diff: {
        versions: {
          "5.0.0": {},
          "5.0.1": {},
          "5.1.0": {},
          "6.0.0": {},
        },
      },
    });

    const result = await resolveNpmTransitiveRemediation({
      finding: {
        pkg: {
          name: "diff",
          version: "5.0.0",
          ecosystem: "npm",
          paths: [["project", "mocha", "diff"]],
        },
        vulnerabilities: [{ id: "OSV-1" }],
        severity: "high",
        cveAliases: [],
        dependencyPaths: [["project", "mocha", "diff"]],
        relationship: "transitive",
        firstFixedVersion: "5.0.1",
      },
      graph,
      packages: [
        {
          name: "mocha",
          version: "10.0.0",
          ecosystem: "npm",
          paths: [["project", "mocha"]],
        },
      ],
    });

    expect(result).toMatchObject({
      kind: "update-parent-within-range",
      package: "mocha",
      currentVersion: "10.0.0",
      targetChildVersion: "5.1.0",
      viaPath: ["project", "mocha", "diff"],
    });
  });

  it("matches workspace-local parent nodes when the display path is normalized", async () => {
    const graph = createNpmTransitiveGraph({
      nodes: [
        {
          id: "client/node_modules/chokidar",
          name: "chokidar",
          version: "3.5.3",
          packagePath: "client/node_modules/chokidar",
        },
        {
          id: "client/node_modules/chokidar/node_modules/braces",
          name: "braces",
          version: "3.0.2",
          packagePath: "client/node_modules/chokidar/node_modules/braces",
        },
      ],
      edges: [
        {
          parentNodeId: "client/node_modules/chokidar",
          childName: "braces",
          childNodeId: "client/node_modules/chokidar/node_modules/braces",
          range: "~3.0.2",
        },
      ],
    });

    mockPackumentsByPackage({
      braces: {
        versions: {
          "3.0.2": {},
          "3.0.3": {},
          "3.1.0": {},
        },
      },
    });

    const result = await resolveNpmTransitiveRemediation({
      finding: {
        pkg: {
          name: "braces",
          version: "3.0.2",
          ecosystem: "npm",
          paths: [["project", "client", "chokidar", "braces"]],
        },
        vulnerabilities: [{ id: "OSV-1" }],
        severity: "high",
        cveAliases: [],
        dependencyPaths: [["project", "client", "chokidar", "braces"]],
        relationship: "transitive",
        firstFixedVersion: "3.0.3",
      },
      graph,
      packages: [
        {
          name: "chokidar",
          version: "3.5.3",
          ecosystem: "npm",
          paths: [["project", "client", "chokidar"]],
        },
      ],
      directDependencyNames: new Set(["chokidar"]),
    });

    expect(result).toMatchObject({
      kind: "update-parent-within-range",
      package: "chokidar",
      currentVersion: "3.5.3",
      targetChildVersion: "3.0.3",
      viaPath: ["project", "client", "chokidar", "braces"],
    });
  });

  it("synthesizes safe-child candidates from the advisory hint when offline and the parent range allows the fix", async () => {
    const graph = createNpmTransitiveGraph({
      nodes: [
        { id: "node_modules/mocha", name: "mocha", version: "10.0.0" },
        { id: "node_modules/diff", name: "diff", version: "5.0.0" },
      ],
      edges: [
        {
          parentNodeId: "node_modules/mocha",
          childName: "diff",
          childNodeId: "node_modules/diff",
          range: "^5.0.0",
        },
      ],
    });

    const result = await resolveNpmTransitiveRemediation({
      finding: {
        pkg: {
          name: "diff",
          version: "5.0.0",
          ecosystem: "npm",
          paths: [["project", "mocha", "diff"]],
        },
        vulnerabilities: [{ id: "OSV-1" }],
        severity: "high",
        cveAliases: [],
        dependencyPaths: [["project", "mocha", "diff"]],
        relationship: "transitive",
        firstFixedVersion: "5.0.1",
      },
      graph,
      packages: [
        {
          name: "mocha",
          version: "10.0.0",
          ecosystem: "npm",
          paths: [["project", "mocha"]],
        },
      ],
      offline: true,
    });

    expect(result).toMatchObject({
      kind: "update-parent-within-range",
      package: "mocha",
      currentVersion: "10.0.0",
      targetChildVersion: "5.0.1",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null offline when the upgrade-parent path would otherwise need the registry", async () => {
    // The advisory hint is outside the parent's current range, so an in-range
    // resolution is not possible. Online this would walk newer parent versions;
    // offline that data is unavailable, so the resolver must return null
    // without hitting the registry.
    const graph = createNpmTransitiveGraph({
      nodes: [
        { id: "node_modules/mocha", name: "mocha", version: "10.0.0" },
        { id: "node_modules/diff", name: "diff", version: "5.0.0" },
      ],
      edges: [
        {
          parentNodeId: "node_modules/mocha",
          childName: "diff",
          childNodeId: "node_modules/diff",
          range: "^5.0.0",
        },
      ],
    });

    const result = await resolveNpmTransitiveRemediation({
      finding: {
        pkg: {
          name: "diff",
          version: "5.0.0",
          ecosystem: "npm",
          paths: [["project", "mocha", "diff"]],
        },
        vulnerabilities: [{ id: "OSV-1" }],
        severity: "high",
        cveAliases: [],
        dependencyPaths: [["project", "mocha", "diff"]],
        relationship: "transitive",
        firstFixedVersion: "6.0.0",
      },
      graph,
      packages: [
        {
          name: "mocha",
          version: "10.0.0",
          ecosystem: "npm",
          paths: [["project", "mocha"]],
        },
      ],
      offline: true,
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null offline when the advisory hint is missing", async () => {
    const graph = createNpmTransitiveGraph({
      nodes: [
        { id: "node_modules/mocha", name: "mocha", version: "10.0.0" },
        { id: "node_modules/diff", name: "diff", version: "5.0.0" },
      ],
      edges: [
        {
          parentNodeId: "node_modules/mocha",
          childName: "diff",
          childNodeId: "node_modules/diff",
          range: "^5.0.0",
        },
      ],
    });

    const result = await resolveNpmTransitiveRemediation({
      finding: {
        pkg: {
          name: "diff",
          version: "5.0.0",
          ecosystem: "npm",
          paths: [["project", "mocha", "diff"]],
        },
        vulnerabilities: [{ id: "OSV-1" }],
        severity: "high",
        cveAliases: [],
        dependencyPaths: [["project", "mocha", "diff"]],
        relationship: "transitive",
        firstFixedVersion: null,
      },
      graph,
      packages: [
        {
          name: "mocha",
          version: "10.0.0",
          ecosystem: "npm",
          paths: [["project", "mocha"]],
        },
      ],
      offline: true,
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("escalates to a parent upgrade when no safe child version fits the current range", async () => {
    const graph = createNpmTransitiveGraph({
      nodes: [
        { id: "node_modules/mocha", name: "mocha", version: "10.0.0" },
        { id: "node_modules/diff", name: "diff", version: "5.0.0" },
      ],
      edges: [
        {
          parentNodeId: "node_modules/mocha",
          childName: "diff",
          childNodeId: "node_modules/diff",
          range: "^5.0.0",
        },
      ],
    });

    mockPackumentsByPackage({
      diff: {
        versions: {
          "5.0.0": {},
          "6.0.0": {},
          "6.1.0": {},
        },
      },
      mocha: {
        versions: {
          "10.0.0": { dependencies: { diff: "^5.0.0" } },
          "10.1.0": { dependencies: { diff: "^5.0.0" } },
          "11.0.0": { dependencies: { diff: "^6.0.0" } },
        },
      },
    });

    const result = await resolveNpmTransitiveRemediation({
      finding: {
        pkg: {
          name: "diff",
          version: "5.0.0",
          ecosystem: "npm",
          paths: [["project", "mocha", "diff"]],
        },
        vulnerabilities: [{ id: "OSV-1" }],
        severity: "high",
        cveAliases: [],
        dependencyPaths: [["project", "mocha", "diff"]],
        relationship: "transitive",
        firstFixedVersion: "6.0.0",
      },
      graph,
      packages: [
        {
          name: "mocha",
          version: "10.0.0",
          ecosystem: "npm",
          paths: [["project", "mocha"]],
        },
      ],
    });

    expect(result).toMatchObject({
      kind: "upgrade-parent-to-version",
      package: "mocha",
      currentVersion: "10.0.0",
      targetVersion: "11.0.0",
      targetChildVersion: "6.1.0",
      viaPath: ["project", "mocha", "diff"],
    });
  });
});

describe("resolveNpmTransitiveRemediation — 3-level within-range gap (#522)", () => {
  // Reproduces: project → aws-amplify → @aws-amplify/core → js-cookie
  // @aws-amplify/core declares js-cookie: ^3.0.5 which already covers 3.0.7.
  // The correct fix is npm update js-cookie (within-range lockfile refresh).
  // Bug: resolveNpmTransitiveRemediation bails out when directParentName !== immediateParentName,
  // so it returns null and falls back to the wrong best-effort parent upgrade.
  beforeEach(() => {
    fetchMock.mockReset();
    clearPackumentCache();
  });

  it("returns null for 3-level chains even when the immediate parent range already covers the fix (known bug #522)", async () => {
    const graph = createNpmTransitiveGraph({
      nodes: [
        { id: "node_modules/aws-amplify", name: "aws-amplify", version: "6.16.3" },
        { id: "node_modules/@aws-amplify/core", name: "@aws-amplify/core", version: "6.16.1" },
        { id: "node_modules/js-cookie", name: "js-cookie", version: "3.0.6" },
      ],
      edges: [
        {
          parentNodeId: "node_modules/aws-amplify",
          childName: "@aws-amplify/core",
          childNodeId: "node_modules/@aws-amplify/core",
          range: "6.16.1",
        },
        {
          parentNodeId: "node_modules/@aws-amplify/core",
          childName: "js-cookie",
          childNodeId: "node_modules/js-cookie",
          range: "^3.0.5",
        },
      ],
    });

    mockPackumentsByPackage({
      "js-cookie": {
        versions: {
          "3.0.5": {},
          "3.0.6": {},
          "3.0.7": {},
          "3.0.8": {},
        },
      },
    });

    const result = await resolveNpmTransitiveRemediation({
      finding: {
        pkg: { name: "js-cookie", version: "3.0.6", ecosystem: "npm" },
        vulnerabilities: [{ id: "GHSA-qjx8-664m-686j" }],
        severity: "high",
        cveAliases: [],
        dependencyPaths: [["project", "aws-amplify", "@aws-amplify/core", "js-cookie"]],
        relationship: "transitive",
        firstFixedVersion: "3.0.7",
      },
      graph,
      packages: [
        { name: "aws-amplify", version: "6.16.3", ecosystem: "npm", paths: [["project", "aws-amplify"]] },
        { name: "@aws-amplify/core", version: "6.16.1", ecosystem: "npm", paths: [["project", "aws-amplify", "@aws-amplify/core"]] },
      ],
      directDependencyNames: new Set(["aws-amplify"]),
    });

    expect(result).toMatchObject({
      kind: "update-parent-within-range",
      package: "js-cookie",
      currentVersion: "3.0.6",
      targetChildVersion: "3.0.8",
      viaPath: ["project", "aws-amplify", "@aws-amplify/core", "js-cookie"],
    });
    expect(result?.reason).toContain("@aws-amplify/core@6.16.1 already allows js-cookie@3.0.8");
  });
});

describe("resolveTransitiveRemediationViaRegistry — deep-chain within-range", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    clearPackumentCache();
  });

  it("returns within-range lockfile refresh for deep chains when the immediate parent range already covers the fix", async () => {
    mockPackumentsByPackage({
      "js-cookie": {
        versions: {
          "3.0.5": {},
          "3.0.6": {},
          "3.0.7": {},
          "3.0.8": {},
        },
      },
      "@aws-amplify/core": {
        versions: {
          "6.16.1": {
            dependencies: {
              "js-cookie": "^3.0.5",
            },
          },
        },
      },
    });

    const result = await resolveTransitiveRemediationViaRegistry({
      finding: {
        pkg: { name: "js-cookie", version: "3.0.6", ecosystem: "npm" },
        vulnerabilities: [{ id: "GHSA-qjx8-664m-686j" }],
        severity: "high",
        cveAliases: [],
        dependencyPaths: [["project", "aws-amplify", "@aws-amplify/core", "js-cookie"]],
        relationship: "transitive",
        firstFixedVersion: "3.0.7",
      },
      packages: [
        { name: "aws-amplify", version: "6.16.3", ecosystem: "npm", paths: [["project", "aws-amplify"]] },
        { name: "@aws-amplify/core", version: "6.16.1", ecosystem: "npm", paths: [["project", "aws-amplify", "@aws-amplify/core"]] },
      ],
      directDependencyNames: new Set(["aws-amplify"]),
    });

    expect(result).toMatchObject({
      kind: "update-parent-within-range",
      package: "js-cookie",
      currentVersion: "3.0.6",
      targetChildVersion: "3.0.8",
      viaPath: ["project", "aws-amplify", "@aws-amplify/core", "js-cookie"],
    });
  });
});

describe("resolveRecommendedParentUpgrade", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    clearPackumentCache();
  });

  it("returns null for non-transitive findings or missing usable paths", async () => {
    const resolveRecommendedParentUpgrade = await loadResolver();
    const packages = createPackages();

    await expect(
      resolveRecommendedParentUpgrade(
        createFinding({ relationship: "direct" }),
        packages,
      ),
    ).resolves.toBeNull();

    await expect(
      resolveRecommendedParentUpgrade(
        createFinding({ dependencyPaths: [], pkg: { name: "lodash", version: "4.17.20", ecosystem: "npm" } }),
        packages,
      ),
    ).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when the direct parent cannot be found in the package list", async () => {
    const resolveRecommendedParentUpgrade = await loadResolver();
    const finding = createFinding({
      dependencyPaths: [["project", "missing-parent", "lodash"]],
    });

    await expect(resolveRecommendedParentUpgrade(finding, createPackages())).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recommends an exact direct-child parent upgrade when a newer parent stops allowing the vulnerable version", async () => {
    const resolveRecommendedParentUpgrade = await loadResolver();
    mockPackumentsByPackage({
      app: {
        versions: {
          "1.0.0": { dependencies: { lodash: "^4.17.20" } },
          "1.0.5": { dependencies: { lodash: "^4.17.20" } },
          "1.1.0": { dependencies: { lodash: "^4.17.21" } },
        },
      },
      lodash: {
        versions: {
          "4.17.20": {},
          "4.17.21": {},
        },
      },
    });

    const result = await resolveRecommendedParentUpgrade(createFinding(), createPackages());

    expect(result).toMatchObject({
      package: "app",
      currentVersion: "1.0.0",
      targetVersion: "1.1.0",
      vulnerablePackage: "lodash",
      confidence: "exact-direct-child",
    });
    expect(result?.reason).toContain("no longer allows lodash@4.17.20");
    expect(result?.reason).toContain("allows 4.17.21+");
  });

  it("uses validated lowest known non-vulnerable version when evaluating exact direct-child upgrades", async () => {
    const resolveRecommendedParentUpgrade = await loadResolver();
    mockPackumentsByPackage({
      app: {
        versions: {
          "1.0.0": { dependencies: { lodash: "^4.17.20" } },
          "1.1.0": { dependencies: { lodash: "^4.18.0" } },
        },
      },
      lodash: {
        versions: {
          "4.17.20": {},
          "4.17.21": {},
          "4.18.0": {},
        },
      },
    });

    const result = await resolveRecommendedParentUpgrade(
      createFinding({
        firstFixedVersion: "4.17.21",
        validatedFirstFixedVersion: "4.18.0",
      }),
      createPackages(),
    );

    expect(result).toMatchObject({
      package: "app",
      currentVersion: "1.0.0",
      targetVersion: "1.1.0",
      vulnerablePackage: "lodash",
      confidence: "exact-direct-child",
    });
    expect(result?.reason).toContain("allows 4.18.0+");
  });

  it("recommends a best-effort upgrade for deeper paths when the direct parent stops allowing the current intermediate version", async () => {
    const resolveRecommendedParentUpgrade = await loadResolver();
    mockPackument({
      versions: {
        "1.0.0": { dependencies: { mid: "^2.0.0" } },
        "1.1.0": { dependencies: { mid: "^2.0.0" } },
        "2.0.0": { dependencies: { mid: "^3.0.0" } },
      },
    });

    const finding = createFinding({
      dependencyPaths: [["project", "app", "mid", "lodash"]],
      pkg: {
        name: "lodash",
        version: "4.17.20",
        ecosystem: "npm",
        paths: [["project", "app", "mid", "lodash"]],
      },
    });

    const result = await resolveRecommendedParentUpgrade(finding, createPackages());

    expect(result).toMatchObject({
      package: "app",
      currentVersion: "1.0.0",
      targetVersion: "2.0.0",
      vulnerablePackage: "lodash",
      confidence: "best-effort",
    });
    expect(result?.reason).toContain("no longer allows mid@2.0.0");
  });

  it("returns null when the immediate parent version is missing or invalid in deeper paths", async () => {
    const resolveRecommendedParentUpgrade = await loadResolver();
    mockPackument({
      versions: {
        "1.1.0": { dependencies: { mid: "^3.0.0" } },
      },
    });

    const packages: PackageRef[] = [
      {
        name: "app",
        version: "1.0.0",
        ecosystem: "npm",
        paths: [["project", "app"]],
      },
      {
        name: "lodash",
        version: "4.17.20",
        ecosystem: "npm",
        paths: [["project", "app", "mid", "lodash"]],
      },
    ];

    const finding = createFinding({
      dependencyPaths: [["project", "app", "mid", "lodash"]],
      pkg: {
        name: "lodash",
        version: "4.17.20",
        ecosystem: "npm",
        paths: [["project", "app", "mid", "lodash"]],
      },
    });

    await expect(resolveRecommendedParentUpgrade(finding, packages)).resolves.toBeNull();
  });

  it("returns null when all newer parent versions are pre-release", async () => {
    const resolveRecommendedParentUpgrade = await loadResolver();
    mockPackumentsByPackage({
      app: {
        versions: {
          "1.0.0": { dependencies: { lodash: "^4.17.20" } },
          "1.1.0-beta.1": { dependencies: { lodash: "^4.17.21" } },
          "1.1.0-next.0": { dependencies: { lodash: "^4.17.21" } },
        },
      },
      lodash: {
        versions: {
          "4.17.20": {},
          "4.17.21": {},
        },
      },
    });

    const result = await resolveRecommendedParentUpgrade(createFinding(), createPackages());

    expect(result).toBeNull();
  });

  it("skips pre-release parent versions and recommends the first stable upgrade", async () => {
    const resolveRecommendedParentUpgrade = await loadResolver();
    mockPackumentsByPackage({
      app: {
        versions: {
          "1.0.0": { dependencies: { lodash: "^4.17.20" } },
          "1.1.0-beta.1": { dependencies: { lodash: "^4.17.21" } },
          "1.1.0": { dependencies: { lodash: "^4.17.21" } },
        },
      },
      lodash: {
        versions: {
          "4.17.20": {},
          "4.17.21": {},
        },
      },
    });

    const result = await resolveRecommendedParentUpgrade(createFinding(), createPackages());

    expect(result).toMatchObject({
      package: "app",
      targetVersion: "1.1.0",
    });
  });

  it("returns null when the registry packument cannot be fetched successfully", async () => {
    const resolveRecommendedParentUpgrade = await loadResolver();
    mockPackument({}, false);

    await expect(resolveRecommendedParentUpgrade(createFinding(), createPackages())).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null in offline mode without making any registry calls", async () => {
    // Every code path in this resolver needs the parent's published manifests,
    // so offline scans must short-circuit before the network call rather than
    // letting a fetch attempt fall through.
    const resolveRecommendedParentUpgrade = await loadResolver();

    await expect(
      resolveRecommendedParentUpgrade(createFinding(), createPackages(), null, { offline: true }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects the correct version of a package installed at multiple versions based on dependency path", async () => {
    // Regression test: when the same package (e.g. "mid") is installed at two
    // different versions on different dependency paths, findPackageVersion must
    // use path-aware iteration rather than a name-keyed Map. A Map only holds
    // one entry (last write wins), so the version on the other path would be
    // returned incorrectly or null.
    //
    // Graph: project -> app -> mid@2.0.0 -> lodash (vulnerable path)
    //        project -> app -> other -> mid@3.0.0 (different path, different version)
    const resolveRecommendedParentUpgrade = await loadResolver();

    mockPackumentsByPackage({
      app: {
        versions: {
          "1.0.0": { dependencies: { mid: "^2.0.0" } },
          "2.0.0": { dependencies: { mid: "^3.0.0" } },
        },
      },
    });

    // Two versions of "mid" installed at different paths.
    const packages: PackageRef[] = [
      {
        name: "app",
        version: "1.0.0",
        ecosystem: "npm",
        paths: [["project", "app"]],
      },
      {
        name: "mid",
        version: "2.0.0",  // old version — the one on the vulnerable path
        ecosystem: "npm",
        paths: [["project", "app", "mid"]],
      },
      {
        name: "mid",
        version: "3.0.0",  // new version — different path, must not shadow the above
        ecosystem: "npm",
        paths: [["project", "app", "other", "mid"]],
      },
      {
        name: "lodash",
        version: "4.17.20",
        ecosystem: "npm",
        paths: [["project", "app", "mid", "lodash"]],
      },
    ];

    const finding = createFinding({
      dependencyPaths: [["project", "app", "mid", "lodash"]],
      pkg: {
        name: "lodash",
        version: "4.17.20",
        ecosystem: "npm",
        paths: [["project", "app", "mid", "lodash"]],
      },
    });

    // The resolver should use mid@2.0.0 (the version on the vulnerable path)
    // when calling findUpgradeForImmediateIntermediate. If it mistakenly used
    // mid@3.0.0 (from the Map's last-write-wins), the app@2.0.0 entry requires
    // mid ^3.0.0 which satisfies 3.0.0, so it would not be selected. With the
    // correct version (2.0.0), app@2.0.0 requires mid ^3.0.0 which no longer
    // allows mid@2.0.0, triggering the best-effort upgrade recommendation.
    const result = await resolveRecommendedParentUpgrade(finding, packages, new Set(["app"]));

    expect(result).toMatchObject({
      package: "app",
      currentVersion: "1.0.0",
      targetVersion: "2.0.0",
      vulnerablePackage: "lodash",
      confidence: "best-effort",
    });
    expect(result?.reason).toContain("no longer allows mid@2.0.0");
  });
});
