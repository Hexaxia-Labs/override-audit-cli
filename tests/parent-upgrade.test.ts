import { jest } from "@jest/globals";
import type { Finding, PackageRef } from "../src/types.js";
import { clearPackumentCache } from "../src/remediation/npm-registry.js";
import { createNpmTransitiveGraph, findSafeVersionWithinParentRange } from "../src/remediation/npm-transitive-graph.js";
import { resolveNpmTransitiveRemediation } from "../src/remediation/npm-transitive-resolution.js";

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

function mockPackumentsByPackage(packuments: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    const packageName = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
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
});
