import { buildCycloneDxBom, buildPurl } from "../src/output/cyclonedx.js";
import type { Finding, PackageRef } from "../src/types.js";

function makePackage(name: string, version: string): PackageRef {
  return { name, version, ecosystem: "npm" };
}

function makeFinding(name: string, version: string, cveId: string, severity: "critical" | "high" | "medium" | "low" | "unknown" = "high"): Finding {
  return {
    pkg: makePackage(name, version),
    vulnerabilities: [{ id: cveId }],
    severity,
    cveAliases: [cveId],
    dependencyPaths: [[name]],
    relationship: "direct",
    firstFixedVersion: "2.0.0",
    validatedFirstFixedVersion: "2.0.0",
  };
}

describe("buildPurl", () => {
  it("builds purl for unscoped package", () => {
    expect(buildPurl("lodash", "4.17.21")).toBe("pkg:npm/lodash@4.17.21");
  });

  it("encodes scoped package @ prefix", () => {
    expect(buildPurl("@babel/core", "7.0.0")).toBe("pkg:npm/%40babel/core@7.0.0");
  });
});

describe("buildCycloneDxBom", () => {
  const allPackages = [
    makePackage("lodash", "4.17.21"),
    makePackage("@babel/core", "7.0.0"),
    makePackage("express", "4.18.0"),
  ];

  it("has valid top-level shape", () => {
    const bom = buildCycloneDxBom(allPackages, [], null, "1.0.0");
    expect(bom.bomFormat).toBe("CycloneDX");
    expect(bom.specVersion).toBe("1.4");
    expect(bom.serialNumber).toMatch(/^urn:uuid:/);
    expect(bom.metadata).toBeDefined();
    expect(Array.isArray(bom.components)).toBe(true);
    expect(Array.isArray(bom.vulnerabilities)).toBe(true);
  });

  it("includes all packages as components, not just vulnerable ones", () => {
    const findings = [makeFinding("lodash", "4.17.21", "CVE-2021-1234")];
    const bom = buildCycloneDxBom(allPackages, findings, null, "1.0.0");
    expect(bom.components).toHaveLength(3);
    const names = bom.components.map(c => c.name);
    expect(names).toContain("lodash");
    expect(names).toContain("@babel/core");
    expect(names).toContain("express");
  });

  it("sets correct bom-ref and purl on components", () => {
    const bom = buildCycloneDxBom(allPackages, [], null, "1.0.0");
    const scoped = bom.components.find(c => c.name === "@babel/core")!;
    expect(scoped["bom-ref"]).toBe("pkg:npm/%40babel/core@7.0.0");
    expect(scoped.purl).toBe("pkg:npm/%40babel/core@7.0.0");
  });

  it("emits one vulnerability entry per CVE ID", () => {
    const findings = [
      makeFinding("lodash", "4.17.21", "CVE-2021-1111"),
      makeFinding("express", "4.18.0", "CVE-2021-2222"),
    ];
    const bom = buildCycloneDxBom(allPackages, findings, null, "1.0.0");
    expect(bom.vulnerabilities).toHaveLength(2);
  });

  it("deduplicates CVE shared across multiple components into one entry with multiple affects", () => {
    const pkgs = [makePackage("a", "1.0.0"), makePackage("b", "2.0.0")];
    const findings = [
      makeFinding("a", "1.0.0", "CVE-2021-9999"),
      makeFinding("b", "2.0.0", "CVE-2021-9999"),
    ];
    const bom = buildCycloneDxBom(pkgs, findings, null, "1.0.0");
    expect(bom.vulnerabilities).toHaveLength(1);
    expect(bom.vulnerabilities[0].affects).toHaveLength(2);
  });

  it("uses runnableFixCommand as recommendation when available", () => {
    const findings = [makeFinding("lodash", "4.17.21", "CVE-2021-1234")];
    const fixCommand = "npm install lodash@2.0.0";
    const plan = {
      packageManager: "npm" as const,
      sourceLabel: "package-lock.json",
      command: fixCommand,
      sections: [],
      targets: [
        {
          package: "lodash",
          currentVersion: "4.17.21",
          targetVersion: "2.0.0",
          kind: "direct" as const,
          urgent: true,
          severity: "high" as const,
          adjusted: false,
          adjustmentNote: null,
          reason: "Direct upgrade target for lodash@4.17.21",
          command: fixCommand,
        },
      ],
      skipped: [],
    };
    const bom = buildCycloneDxBom(allPackages, findings, null, "1.0.0", plan);
    expect(bom.vulnerabilities[0].recommendation).toBe(fixCommand);
  });

  it("produces valid BOM with zero vulnerabilities when findings is empty", () => {
    const bom = buildCycloneDxBom(allPackages, [], null, "1.0.0");
    expect(bom.components).toHaveLength(3);
    expect(bom.vulnerabilities).toHaveLength(0);
  });

  it("populates metadata.component from projectMeta", () => {
    const bom = buildCycloneDxBom(allPackages, [], { name: "my-app", version: "1.2.3" }, "1.0.0");
    expect(bom.metadata.component?.name).toBe("my-app");
    expect(bom.metadata.component?.version).toBe("1.2.3");
  });

  it("omits metadata.component when projectMeta is null", () => {
    const bom = buildCycloneDxBom(allPackages, [], null, "1.0.0");
    expect(bom.metadata.component).toBeUndefined();
  });
});
