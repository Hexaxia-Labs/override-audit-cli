/**
 * Plan 2 sanity check: prove the ported OA detectors produce behaviorally
 * equivalent findings to the preserved override-audit detectors when given
 * the same inputs.
 *
 * "Equivalent" here normalizes for the intentional shape changes between
 * the preserved Finding shape and the new OverrideFinding shape:
 *   - rule ID:  "OA001-ORPHAN-TARGET" (old) vs "OA001" (new)
 *   - package:  string (old) vs { name: string } (new)
 *   - fix op:   remediation.action / remediation.patch.op (old)
 *               vs fix.patch[0].op (new)
 *
 * Severity differences between old and new are EXPECTED for OA001 and OA007
 * (the spec corrected those). The harness ignores severity for equivalence.
 *
 * Run with:  npm test -- tests/sanity/port-equivalence.test.ts
 */

import { detect as oldOA001 } from "../../_preserved-override-audit/src/detectors/orphan.js";
import { detect as oldOA002 } from "../../_preserved-override-audit/src/detectors/floating-tag.js";
import { detect as oldOA003 } from "../../_preserved-override-audit/src/detectors/wrong-section.js";
import { detect as oldOA004 } from "../../_preserved-override-audit/src/detectors/installed-newer.js";
import { detect as oldOA006 } from "../../_preserved-override-audit/src/detectors/coupled-platform-binary.js";
import { detect as oldOA007 } from "../../_preserved-override-audit/src/detectors/frozen-latest.js";
import { detect as oldOA008 } from "../../_preserved-override-audit/src/detectors/vulnerable-twin.js";

import { detect as newOA001 } from "../../src/overrides/detectors/oa001-orphaned-target.js";
import { detect as newOA002 } from "../../src/overrides/detectors/oa002-floating-tag.js";
import { detect as newOA003 } from "../../src/overrides/detectors/oa003-wrong-section.js";
import { detect as newOA004 } from "../../src/overrides/detectors/oa004-surpassed-pin.js";
import { detect as newOA006 } from "../../src/overrides/detectors/oa006-coupled-platform-binary.js";
import { detect as newOA007 } from "../../src/overrides/detectors/oa007-frozen-latest.js";
import { detect as newOA008 } from "../../src/overrides/detectors/oa008-materialized.js";

import type {
  Context as OldContext,
  Finding as OldFinding,
  OverrideEntry as OldEntry,
} from "../../_preserved-override-audit/src/types.js";
import type {
  OverrideContext as NewContext,
  OverrideEntry as NewEntry,
} from "../../src/overrides/context.js";
import type { OverrideFinding } from "../../src/overrides/types.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as any;

// --- Fixture builders ------------------------------------------------------

interface Fixture {
  packageManager: "npm" | "pnpm";
  packageJson: Record<string, unknown>;
  overrideEntries: Array<{
    key: string;
    packageName: string;
    value: any;
    path: string[];
    container: "overrides" | "pnpm.overrides" | "resolutions";
  }>;
  lockfilePackageNames?: string[];
  installedVersions?: Record<string, string>;
  installedCopies?: Record<string, Array<{ name: string; path: string; version: string }>>;
  parentDeclarations?: Record<string, any[]>;
  registryDistTags?: Record<string, { latest?: string; next?: string }>;
}

function buildOldContext(f: Fixture): OldContext {
  return {
    projectPath: "/x",
    packageJson: f.packageJson,
    packageJsonRaw: JSON.stringify(f.packageJson),
    packageManager: f.packageManager,
    overrideEntries: f.overrideEntries as OldEntry[],
    lockfilePackageNames: new Set(f.lockfilePackageNames ?? []),
    installedVersions: new Map(Object.entries(f.installedVersions ?? {})),
    installedCopies: new Map(Object.entries(f.installedCopies ?? {})),
    parentDeclarations: new Map(Object.entries(f.parentDeclarations ?? {})),
    registryDistTags: new Map(Object.entries(f.registryDistTags ?? {})) as any,
    skippedDetectors: [],
  };
}

function buildNewContext(f: Fixture): NewContext {
  return {
    projectPath: "/x",
    packageJson: f.packageJson,
    packageJsonRaw: JSON.stringify(f.packageJson),
    packageManager: f.packageManager,
    overrideEntries: f.overrideEntries as NewEntry[],
    lockfilePackageNames: new Set(f.lockfilePackageNames ?? []),
    installedVersions: new Map(Object.entries(f.installedVersions ?? {})),
    installedCopies: new Map(Object.entries(f.installedCopies ?? {})),
    parentDeclarations: new Map(Object.entries(f.parentDeclarations ?? {})),
    registryDistTags: new Map(Object.entries(f.registryDistTags ?? {})),
    skippedDetectors: [],
    auditLog: NULL_AUDIT_LOG,
    logger: noopLogger,
  };
}

// --- Normalization ---------------------------------------------------------

interface NormalizedFinding {
  shortRuleId: string;          // "OA001" etc.
  subRule?: string;             // "OA005.a" etc. (short form)
  package: string;
  fixOp: string | null;         // first op in fix patch, or null if no fix
}

function shortenOldRuleId(id: string): string {
  // "OA001-ORPHAN-TARGET" -> "OA001"
  const match = id.match(/^(OA\d{3})/);
  return match ? match[1] : id;
}

function shortenOldSubRule(id: string | undefined): string | undefined {
  if (!id) return undefined;
  // "OA005.a-NON-NPM" -> "OA005.a"
  const match = id.match(/^(OA\d{3}\.[a-e])/);
  return match ? match[1] : id;
}

function normalizeOld(f: OldFinding): NormalizedFinding {
  // Old shape: package: string, remediation: { patch?: {op,path}, patches?: [{op,path}] }
  const r = (f as any).remediation;
  let fixOp: string | null = null;
  if (r?.patches?.length) fixOp = r.patches[0].op;
  else if (r?.patch?.op) fixOp = r.patch.op;
  return {
    shortRuleId: shortenOldRuleId(f.ruleId),
    subRule: shortenOldSubRule((f as any).subRuleId),
    package: (f as any).package,
    fixOp,
  };
}

function normalizeNew(f: OverrideFinding): NormalizedFinding {
  // New shape: package: { name }, fix: { type, patch: [{op,path}] }
  return {
    shortRuleId: f.ruleId,
    subRule: f.subRuleId,
    package: f.package.name,
    fixOp: f.fix?.patch?.[0]?.op ?? null,
  };
}

function sortByPackageThenRule(a: NormalizedFinding, b: NormalizedFinding): number {
  if (a.package !== b.package) return a.package < b.package ? -1 : 1;
  if (a.shortRuleId !== b.shortRuleId) return a.shortRuleId < b.shortRuleId ? -1 : 1;
  return 0;
}

// --- Fixtures (one or two per detector) ------------------------------------

const orphanEntry = {
  key: "gone-pkg",
  packageName: "gone-pkg",
  value: "1.0.0",
  path: ["overrides", "gone-pkg"],
  container: "overrides" as const,
};

const floatingTagEntry = {
  key: "foo",
  packageName: "foo",
  value: "latest",
  path: ["overrides", "foo"],
  container: "overrides" as const,
};

const wrongSectionEntry = {
  key: "foo",
  packageName: "foo",
  value: "1.0.0",
  path: ["pnpm", "overrides", "foo"],
  container: "pnpm.overrides" as const,
};

const surpassedPinEntry = {
  key: "foo",
  packageName: "foo",
  value: "1.0.0",
  path: ["overrides", "foo"],
  container: "overrides" as const,
};

const platformBinaryEntry = {
  key: "@esbuild/linux-x64",
  packageName: "@esbuild/linux-x64",
  value: "0.25.13",
  path: ["overrides", "@esbuild/linux-x64"],
  container: "overrides" as const,
};

const frozenLatestEntry = {
  key: "foo",
  packageName: "foo",
  value: "latest",
  path: ["overrides", "foo"],
  container: "overrides" as const,
};

const materializedEntry = {
  key: "foo",
  packageName: "foo",
  value: "2.0.0",
  path: ["overrides", "foo"],
  container: "overrides" as const,
};

// --- Tests -----------------------------------------------------------------

describe("Plan 2 port equivalence: OA001 orphaned-target", () => {
  it("preserved and ported produce the same package+fixOp findings", () => {
    const fixture: Fixture = {
      packageManager: "npm",
      packageJson: { name: "x", overrides: { "gone-pkg": "1.0.0" } },
      overrideEntries: [orphanEntry],
      lockfilePackageNames: ["other-pkg"],
    };
    const oldF = oldOA001(buildOldContext(fixture)).map(normalizeOld).sort(sortByPackageThenRule);
    const newF = newOA001(buildNewContext(fixture)).map(normalizeNew).sort(sortByPackageThenRule);
    expect(newF).toEqual(oldF);
    expect(newF.length).toBeGreaterThan(0);
  });
});

describe("Plan 2 port equivalence: OA002 floating-tag", () => {
  it("preserved and ported produce equivalent findings on `latest`", () => {
    const fixture: Fixture = {
      packageManager: "npm",
      packageJson: { name: "x", overrides: { foo: "latest" } },
      overrideEntries: [floatingTagEntry],
      lockfilePackageNames: ["foo"],
    };
    const oldF = oldOA002(buildOldContext(fixture)).map(normalizeOld).sort(sortByPackageThenRule);
    const newF = newOA002(buildNewContext(fixture)).map(normalizeNew).sort(sortByPackageThenRule);
    // Both detectors fire on packageName "foo"; fix op may differ (old may not emit one;
    // new emits ">=installed" suggestion if version known). Compare on package + rule.
    const stripFixOp = (f: NormalizedFinding) => ({ shortRuleId: f.shortRuleId, package: f.package });
    expect(newF.map(stripFixOp)).toEqual(oldF.map(stripFixOp));
    expect(newF.length).toBeGreaterThan(0);
  });
});

describe("Plan 2 port equivalence: OA003 wrong-section", () => {
  it("preserved and ported both fire on pnpm.overrides under an npm project", () => {
    const fixture: Fixture = {
      packageManager: "npm",
      packageJson: { name: "x", pnpm: { overrides: { foo: "1.0.0" } } },
      overrideEntries: [wrongSectionEntry],
      lockfilePackageNames: ["foo"],
    };
    const oldF = oldOA003(buildOldContext(fixture)).map(normalizeOld).sort(sortByPackageThenRule);
    const newF = newOA003(buildNewContext(fixture)).map(normalizeNew).sort(sortByPackageThenRule);
    expect(newF).toEqual(oldF);
    expect(newF.length).toBeGreaterThan(0);
    expect(newF[0].fixOp).toBe("move");
  });
});

describe("Plan 2 port equivalence: OA004 surpassed-pin", () => {
  it("preserved and ported both fire when installed > pin", () => {
    const fixture: Fixture = {
      packageManager: "npm",
      packageJson: { name: "x", overrides: { foo: "1.0.0" } },
      overrideEntries: [surpassedPinEntry],
      lockfilePackageNames: ["foo"],
      installedVersions: { foo: "1.5.0" }, // same major, surpasses pin
    };
    const oldF = oldOA004(buildOldContext(fixture)).map(normalizeOld).sort(sortByPackageThenRule);
    const newF = newOA004(buildNewContext(fixture)).map(normalizeNew).sort(sortByPackageThenRule);
    // Both should fire on "foo".
    const stripFixOp = (f: NormalizedFinding) => ({ shortRuleId: f.shortRuleId, package: f.package });
    expect(newF.map(stripFixOp)).toEqual(oldF.map(stripFixOp));
    expect(newF.length).toBeGreaterThan(0);
  });
});

describe("Plan 2 port equivalence: OA006 coupled-platform-binary", () => {
  it("preserved and ported both fire on a platform-binary override fighting an exact-pinned parent", () => {
    const fixture: Fixture = {
      packageManager: "npm",
      packageJson: { name: "x", overrides: { "@esbuild/linux-x64": "0.25.13" } },
      overrideEntries: [platformBinaryEntry],
      lockfilePackageNames: ["@esbuild/linux-x64", "esbuild"],
      installedVersions: { "@esbuild/linux-x64": "0.25.13" },
      parentDeclarations: {
        "@esbuild/linux-x64": [
          {
            parentName: "esbuild",
            parentVersion: "0.25.10",
            declaredIn: "optionalDependencies",
            declaredValue: "0.25.10",
            exactVersion: true,
          },
        ],
      },
    };
    const oldF = oldOA006(buildOldContext(fixture)).map(normalizeOld).sort(sortByPackageThenRule);
    const newF = newOA006(buildNewContext(fixture)).map(normalizeNew).sort(sortByPackageThenRule);
    const stripFixOp = (f: NormalizedFinding) => ({ shortRuleId: f.shortRuleId, package: f.package });
    expect(newF.map(stripFixOp)).toEqual(oldF.map(stripFixOp));
    expect(newF.length).toBeGreaterThan(0);
  });
});

describe("Plan 2 port equivalence: OA007 frozen-latest", () => {
  it("preserved and ported both fire when `latest` has moved", () => {
    const fixture: Fixture = {
      packageManager: "npm",
      packageJson: { name: "x", overrides: { foo: "latest" } },
      overrideEntries: [frozenLatestEntry],
      lockfilePackageNames: ["foo"],
      installedVersions: { foo: "1.0.0" },
      registryDistTags: { foo: { latest: "2.0.0" } },
    };
    const oldF = oldOA007(buildOldContext(fixture)).map(normalizeOld).sort(sortByPackageThenRule);
    const newF = newOA007(buildNewContext(fixture)).map(normalizeNew).sort(sortByPackageThenRule);
    const stripFixOp = (f: NormalizedFinding) => ({ shortRuleId: f.shortRuleId, package: f.package });
    expect(newF.map(stripFixOp)).toEqual(oldF.map(stripFixOp));
    expect(newF.length).toBeGreaterThan(0);
  });
});

describe("Plan 2 port equivalence: OA008 materialized", () => {
  it("preserved and ported both fire when a vulnerable copy is on disk despite the override floor", () => {
    const fixture: Fixture = {
      packageManager: "npm",
      packageJson: { name: "x", overrides: { foo: "2.0.0" } },
      overrideEntries: [materializedEntry],
      lockfilePackageNames: ["foo"],
      installedCopies: {
        foo: [
          { name: "foo", path: "/x/node_modules/foo", version: "2.0.0" },
          { name: "foo", path: "/x/node_modules/parent/node_modules/foo", version: "1.0.0" },
        ],
      },
    };
    const oldF = oldOA008(buildOldContext(fixture)).map(normalizeOld).sort(sortByPackageThenRule);
    const newF = newOA008(buildNewContext(fixture)).map(normalizeNew).sort(sortByPackageThenRule);
    const stripFixOp = (f: NormalizedFinding) => ({ shortRuleId: f.shortRuleId, package: f.package });
    expect(newF.map(stripFixOp)).toEqual(oldF.map(stripFixOp));
    expect(newF.length).toBeGreaterThan(0);
  });
});

// OA005 is intentionally omitted from the per-detector loop. Its 5 sub-rules
// (.a-.e) involve nested entries with installed-version inspections and
// per-sub-rule fix shapes that diverge between preserved and new (preserved
// uses long sub-rule codes; new uses short). The migrated OA005 tests in
// `tests/overrides/detectors/oa005.test.ts` cover its 14 cases. A future
// follow-up could add a normalized OA005 equivalence pass here.
