import { jest } from "@jest/globals";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { Finding, PackageRef, ScanInput } from "../src/types.js";
import { stripAnsi } from "../src/utils/chalk.js";

const printBannerMock = jest.fn<any>();
const printHelpMock = jest.fn<any>();
const parseArgsMock = jest.fn<any>();
const loadPackagesMock = jest.fn<any>();
const buildNoPackagesMessageMock = jest.fn<any>();
const scanPackagesMock = jest.fn<any>();
const syncOsvAdvisoriesMock = jest.fn<any>();
const printCacheSummaryMock = jest.fn<any>();
const logInfoMock = jest.fn<any>();
const logWarnMock = jest.fn<any>();
const serializeFindingMock = jest.fn<any>();
const sortFindingsForOutputMock = jest.fn((findings: Finding[]) => findings);
const printSummaryMock = jest.fn<any>();
const printActionSummaryMock = jest.fn<any>();
const printSuggestedFixCommandsMock = jest.fn<any>();
const printSuggestedFixCommandSkipsMock = jest.fn<any>();
const printCoverageMock = jest.fn<any>();
const printSkippedDependenciesMock = jest.fn<any>();
const printTableMock = jest.fn<any>();
const printFinalStatusMock = jest.fn<any>();
const printCompactOutputMock = jest.fn<any>();
const buildSuggestedFixCommandPlanMock = jest.fn<any>();
const spawnMock = jest.fn<any>();
const buildReportDataMock = jest.fn<any>();
const writeHtmlReportMock = jest.fn<any>();
const installSkillMock = jest.fn<any>();
const writeSarifReportMock = jest.fn<any>(() => "cve-lite-scan-test.sarif");
const deriveLockfileUriMock = jest.fn<any>(() => "package-lock.json");
const writeOutputsMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule("../src/cli/help.js", () => ({
  printBanner: printBannerMock,
  printHelp: printHelpMock,
}));

jest.unstable_mockModule("../src/cli/args.js", () => ({
  parseArgs: parseArgsMock,
}));

jest.unstable_mockModule("../src/parsers/index.js", () => ({
  loadPackages: loadPackagesMock,
  buildNoPackagesMessage: buildNoPackagesMessageMock,
}));

jest.unstable_mockModule("../src/scanner.js", () => ({
  scanPackages: scanPackagesMock,
  buildCoverageNotes: jest.fn(() => ["Coverage note"]),
  createAdvisorySource: jest.fn((options?: { osvUrl?: string; offline?: boolean; offlineDb?: string }) => ({
    advisorySource: {
      queryBatch: jest.fn(),
      getVuln: jest.fn(),
    },
    offline: !!options?.offline || !!options?.offlineDb,
    sourceLabel: options?.offline || options?.offlineDb
      ? `local advisory database (${options?.offlineDb ?? "/tmp/default-advisories.db"})`
      : options?.osvUrl
        ? `custom OSV endpoint (${options.osvUrl})`
        : "OSV (https://api.osv.dev)",
    advisoryDbMetadata: options?.offline || options?.offlineDb
      ? { lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), sourceUrl: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip" }
      : null,
    advisoryDbIsStale: false,
    cleanup: jest.fn(),
  })),
}));

jest.unstable_mockModule("../src/advisory/osv-sync.js", () => ({
  syncOsvAdvisories: syncOsvAdvisoriesMock,
}));

jest.unstable_mockModule("../src/output/formatters.js", () => ({
  formatAdvisorySourceLine: (value: string) => value,
  logInfo: logInfoMock,
  logWarn: logWarnMock,
  printCacheSummary: printCacheSummaryMock,
  serializeFinding: serializeFindingMock,
  sortFindingsForOutput: sortFindingsForOutputMock,
  formatAdvisorySourceLine: jest.fn<any>(sourceLabel => sourceLabel),
  getRecommendedAction: jest.fn<any>(() => "Upgrade to latest"),
}));

jest.unstable_mockModule("../src/output/printers.js", () => ({
  printSummary: printSummaryMock,
  printActionSummary: printActionSummaryMock,
  printSuggestedFixCommands: printSuggestedFixCommandsMock,
  printSuggestedFixCommandSkips: printSuggestedFixCommandSkipsMock,
  printCoverage: printCoverageMock,
  printSkippedDependencies: printSkippedDependenciesMock,
  printTable: printTableMock,
  printFinalStatus: printFinalStatusMock,
  printCompactOutput: printCompactOutputMock,
}));

jest.unstable_mockModule("../src/remediation/fix-commands.js", () => ({
  buildSuggestedFixCommandPlan: buildSuggestedFixCommandPlanMock,
  findSuggestedCommandForFinding: jest.fn<any>(() => null),
}));

jest.unstable_mockModule("node:child_process", () => ({
  spawn: spawnMock,
}));

jest.unstable_mockModule("../src/output/html-reporter.js", () => ({
  buildReportData: buildReportDataMock,
  writeHtmlReport: writeHtmlReportMock,
}));

jest.unstable_mockModule("../src/skills/install.js", () => ({
  installSkill: installSkillMock,
}));

jest.unstable_mockModule("../src/output/sarif.js", () => ({
  writeSarifReport: writeSarifReportMock,
  deriveLockfileUri: deriveLockfileUriMock,
}));

jest.unstable_mockModule("../src/output/write-outputs.js", () => ({
  writeOutputs: writeOutputsMock,
}));

function createScanInput(overrides?: Partial<ScanInput>): ScanInput {
  return {
    mode: "manifest-fallback",
    source: "package-json",
    filePath: "/tmp/project/package.json",
    packages: [],
    notes: ["Parser note"],
    warnings: [],
    skippedDependencies: [],
    ...overrides,
  };
}

function createFinding(overrides?: Partial<Finding>): Finding {
  return {
    pkg: {
      name: "lodash",
      version: "4.17.20",
      ecosystem: "npm",
      paths: [["project", "lodash"]],
    },
    vulnerabilities: [{ id: "OSV-123" }],
    severity: "critical",
    cveAliases: ["CVE-2026-0001"],
    dependencyPaths: [["project", "lodash"]],
    relationship: "direct",
    firstFixedVersion: "4.17.21",
    recommendedParentUpgrade: undefined,
    ...overrides,
  };
}

const multerDirectFixFinding = createFinding({
  pkg: { name: "multer", version: "1.4.5-lts.2", ecosystem: "npm", paths: [["project", "multer"]] },
});

const npmFixPlan = {
  packageManager: "npm" as const,
  sourceLabel: "package-lock.json",
  command: "npm install multer@2.1.1",
  sections: [],
  targets: [
    {
      package: "multer",
      currentVersion: "1.4.5-lts.2",
      targetVersion: "2.1.1",
      kind: "direct" as const,
      urgent: false,
      severity: "medium" as const,
      adjusted: false,
      reason: "Direct upgrade target",
    },
  ],
  skipped: [],
};

const NPM_FIX_HINT = "Check that `npm` is available and you have write access to node_modules.";
const CI_FIX_HINT = "If running in CI, ensure the install step has already run before cve-lite --fix.";

function setupFixModeWithNpmDirectTarget() {
  parseArgsMock.mockReturnValue({
    command: "scan",
    options: {
      fix: true,
      failOn: "critical",
      batchSize: "100",
      searchDepth: "4",
      minSeverity: "medium",
    },
    projectArg: ".",
  });
  loadPackagesMock.mockReturnValue(
    createScanInput({
      source: "package-lock",
      filePath: "/tmp/project/package-lock.json",
      packages: [multerDirectFixFinding.pkg],
    }),
  );
  scanPackagesMock.mockResolvedValue([multerDirectFixFinding]);
  buildSuggestedFixCommandPlanMock.mockReturnValue(npmFixPlan);
}

function createMockSpawnChild(): EventEmitter & { stdout: PassThrough; stderr: PassThrough } {
  const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

async function runIndexModule() {
  const exitSpy = jest
    .spyOn(process, "exit")
    .mockImplementation(((code?: number) => code as never) as never);
  const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  try {
    await import(`../src/index.ts?test=${Date.now()}-${Math.random()}`);
    await new Promise(resolve => setTimeout(resolve, 0));
  } finally {
  }

  const exitCalls = exitSpy.mock.calls.map(call => call[0]);
  const stdout = logSpy.mock.calls.map(call => call.map(value => String(value)).join(" "));
  const stderr = errorSpy.mock.calls.map(call => call.map(value => String(value)).join(" "));

  exitSpy.mockRestore();
  logSpy.mockRestore();
  errorSpy.mockRestore();

  if (exitCalls.length === 0) {
    throw new Error("index.ts did not call process.exit");
  }

  return {
    exitCode: Number(exitCalls[exitCalls.length - 1] ?? 0),
    exitCalls,
    stdout,
    stderr,
  };
}

describe("CLI integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildSuggestedFixCommandPlanMock.mockReturnValue(null);
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      setImmediate(() => child.emit("close", 0));
      return child;
    });
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: {
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
      projectArg: ".",
    });
    buildNoPackagesMessageMock.mockReturnValue("No scannable packages were found.");
    loadPackagesMock.mockReturnValue(createScanInput());
    scanPackagesMock.mockResolvedValue([]);
    syncOsvAdvisoriesMock.mockResolvedValue({
      advisoryCount: 0,
      dbPath: "/tmp/advisories.db",
      sourceUrl: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
    });
    serializeFindingMock.mockImplementation((finding: Finding) => ({
      package: finding.pkg.name,
      severity: finding.severity,
    }));
    buildReportDataMock.mockReturnValue({ cliVersion: "1.8.0", findings: [] });
    writeHtmlReportMock.mockResolvedValue({ reportPath: "/tmp/cve-report/index.html" });
    installSkillMock.mockReturnValue(undefined);
  });

  it("returns a json payload and exits successfully when no findings are present", async () => {
    const packages: PackageRef[] = [
      { name: "lodash", version: "4.17.21", ecosystem: "npm", paths: [["project", "lodash"]] },
    ];
    const parsedOptions = {
      json: true,
      failOn: "critical",
      batchSize: "100",
      searchDepth: "4",
      minSeverity: "medium",
    };
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: parsedOptions,
      projectArg: ".",
    });
    const scanInput = createScanInput({ packages });
    loadPackagesMock.mockReturnValue(scanInput);

    const result = await runIndexModule();

    expect(result.exitCode).toBe(0);
    expect(writeOutputsMock).toHaveBeenCalledWith(
      expect.objectContaining({ json: true }),
      expect.objectContaining({ sorted: [], suggestedFixCommands: null }),
      expect.objectContaining({ mode: "manifest-fallback", source: "package-json" }),
      expect.any(String),
    );
    expect(printCompactOutputMock).not.toHaveBeenCalled();
  });

  it("suppresses compact output when --sarif is used", async () => {
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: { sarif: true, failOn: "critical", batchSize: "100" },
      projectArg: ".",
    });
    loadPackagesMock.mockReturnValue(createScanInput({ packages: [] }));
    await runIndexModule();
    expect(printCompactOutputMock).not.toHaveBeenCalled();
  });

  it("suppresses compact output when --cdx is used", async () => {
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: { cdx: true, failOn: "critical", batchSize: "100" },
      projectArg: ".",
    });
    loadPackagesMock.mockReturnValue(createScanInput({ packages: [] }));
    await runIndexModule();
    expect(printCompactOutputMock).not.toHaveBeenCalled();
  });

  it("includes child workspace dependency names in direct classification context", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-workspace-context-"));
    const clientDir = path.join(projectDir, "packages", "client");
    const experienceDir = path.join(projectDir, "packages", "experience");

    fs.mkdirSync(clientDir, { recursive: true });
    fs.mkdirSync(experienceDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "fixture",
        private: true,
        workspaces: ["packages/*"],
        dependencies: {
          husky: "^9.1.7",
        },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(clientDir, "package.json"),
      JSON.stringify({
        name: "client",
        private: true,
        dependencies: {
          "@eslint/eslintrc": "3.2.0",
        },
      }),
      "utf8",
    );

    parseArgsMock.mockReturnValue({
      command: "scan",
      options: {
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
      projectArg: projectDir,
    });
    loadPackagesMock.mockReturnValue(
      createScanInput({
        mode: "resolved-lockfile",
        source: "package-lock",
        filePath: path.join(projectDir, "package-lock.json"),
        packages: [
          {
            name: "@eslint/eslintrc",
            version: "3.2.0",
            ecosystem: "npm",
            paths: [["project", "@eslint/eslintrc"]],
          },
        ],
      }),
    );

    try {
      const result = await runIndexModule();

      expect(result.exitCode).toBe(0);
      expect(scanPackagesMock).toHaveBeenCalled();
      const context = scanPackagesMock.mock.calls[0]?.[3] as { directDependencyNames?: Set<string> } | undefined;
      expect(context?.directDependencyNames?.has("husky")).toBe(true);
      expect(context?.directDependencyNames?.has("@eslint/eslintrc")).toBe(true);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("prints the versioned banner and exits when --version is requested", async () => {
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: {
        version: true,
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
      projectArg: ".",
    });

    const result = await runIndexModule();

    expect(result.exitCode).toBe(0);
    expect(printBannerMock).toHaveBeenCalled();
    expect(loadPackagesMock).not.toHaveBeenCalled();
    expect(scanPackagesMock).not.toHaveBeenCalled();
  });

  it("fails cleanly when argument parsing throws for an unknown option", async () => {
    parseArgsMock.mockImplementation(() => {
      throw new Error("Unknown option: --wat");
    });

    const result = await runIndexModule();

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Error: Unknown option: --wat");
    expect(result.stderr.join("\n")).toContain("Run `cve-lite --help` to see supported options.");
    expect(printBannerMock).not.toHaveBeenCalled();
    expect(loadPackagesMock).not.toHaveBeenCalled();
  });

  it("exits with a failure code when findings meet the fail-on threshold", async () => {
    const finding = createFinding();
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: {
        json: true,
        failOn: "high",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
      projectArg: ".",
    });
    loadPackagesMock.mockReturnValue(createScanInput({ packages: [finding.pkg] }));
    scanPackagesMock.mockResolvedValue([finding]);

    const result = await runIndexModule();

    expect(result.exitCode).toBe(1);
    expect(writeOutputsMock).toHaveBeenCalledWith(
      expect.objectContaining({ json: true }),
      expect.objectContaining({ sorted: [finding], suggestedFixCommands: null }),
      expect.any(Object),
      expect.any(String),
    );
  });

  it("warns and exits cleanly when no scannable packages are found", async () => {
    loadPackagesMock.mockReturnValue(createScanInput({ packages: [] }));

    const result = await runIndexModule();

    expect(result.exitCode).toBe(0);
    expect(logWarnMock).toHaveBeenCalledWith("No scannable packages were found.", expect.anything());
  });

  it("fails fast for an invalid osv url", async () => {
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: {
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
        osvUrl: "not-a-url",
      },
      projectArg: ".",
    });

    const result = await runIndexModule();

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("Invalid value for --osv-url: not-a-url");
    expect(loadPackagesMock).not.toHaveBeenCalled();
  });

  it("prints an offline advisory DB hint when OSV requests appear blocked", async () => {
    loadPackagesMock.mockReturnValue(createScanInput({
      packages: [{ name: "lodash", version: "4.17.21", ecosystem: "npm", paths: [["project", "lodash"]] }],
    }));
    scanPackagesMock.mockRejectedValue(
      new Error("OSV batch query failed for https://api.osv.dev: fetch failed"),
    );

    const result = await runIndexModule();
    const stderr = stripAnsi(result.stderr.join("\n"));

    expect(result.exitCode).toBe(1);
    expect(stderr).toContain("Error: OSV batch query failed for https://api.osv.dev: fetch failed");
    expect(stderr).toContain("Hint: Outbound access to the OSV API may be blocked or restricted in this environment.");
    expect(stderr).toContain("build the advisory DB on a machine with OSV access");
    expect(stderr).toContain("cve-lite advisories sync --output /path/to/advisories.db");
  });

  it("prints a retry and offline hint when OSV rate limits the scan", async () => {
    loadPackagesMock.mockReturnValue(createScanInput({
      packages: [{ name: "lodash", version: "4.17.21", ecosystem: "npm", paths: [["project", "lodash"]] }],
    }));
    scanPackagesMock.mockRejectedValue(
      new Error("OSV batch query failed for https://api.osv.dev: OSV batch query failed: 429 Too Many Requests"),
    );

    const result = await runIndexModule();
    const stderr = stripAnsi(result.stderr.join("\n"));

    expect(result.exitCode).toBe(1);
    expect(stderr).toContain("Error: OSV batch query failed for https://api.osv.dev: OSV batch query failed: 429 Too Many Requests");
    expect(stderr).toContain("Hint: OSV API rate limit reached. Wait a moment and retry, or scan offline:");
    expect(stderr).toContain("cve-lite . --offline");
    expect(stderr).toContain("cve-lite advisories sync");
    expect(stderr).not.toContain("Outbound access to the OSV API may be blocked");
  });

  it("prints a transient service hint when OSV returns a server error", async () => {
    loadPackagesMock.mockReturnValue(createScanInput({
      packages: [{ name: "lodash", version: "4.17.21", ecosystem: "npm", paths: [["project", "lodash"]] }],
    }));
    scanPackagesMock.mockRejectedValue(
      new Error("OSV batch query failed for https://api.osv.dev: OSV batch query failed: 503 Service Unavailable"),
    );

    const result = await runIndexModule();
    const stderr = stripAnsi(result.stderr.join("\n"));

    expect(result.exitCode).toBe(1);
    expect(stderr).toContain("Error: OSV batch query failed for https://api.osv.dev: OSV batch query failed: 503 Service Unavailable");
    expect(stderr).toContain("Hint: OSV API may be temporarily unavailable. Wait a moment and retry, or scan offline:");
    expect(stderr).toContain("cve-lite . --offline");
    expect(stderr).toContain("cve-lite advisories sync");
    expect(stderr).not.toContain("Outbound access to the OSV API may be blocked");
  });

  it("routes verbose mode through the detailed printer pipeline", async () => {
    const finding = createFinding({ severity: "medium" });
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: {
        verbose: true,
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
        all: false,
      },
      projectArg: ".",
    });
    loadPackagesMock.mockReturnValue(
      createScanInput({
        packages: [finding.pkg],
        warnings: ["Manifest fallback warning"],
        skippedDependencies: ["dependencies:debug@^4.3.0"],
      }),
    );
    scanPackagesMock.mockResolvedValue([finding]);

    const result = await runIndexModule();

    expect(result.exitCode).toBe(0);
    expect(logWarnMock).toHaveBeenCalledWith("Manifest fallback warning", expect.anything());
    expect(printSummaryMock).toHaveBeenCalled();
    expect(printActionSummaryMock).toHaveBeenCalled();
    expect(printCoverageMock).toHaveBeenCalledWith(["Parser note", "Coverage note"]);
    expect(printSkippedDependenciesMock).toHaveBeenCalledWith(["dependencies:debug@^4.3.0"]);
    expect(printTableMock).toHaveBeenCalled();
    expect(printFinalStatusMock).toHaveBeenCalled();
    expect(printCompactOutputMock).not.toHaveBeenCalled();
  });

  it("reports the local advisory database as the scan source in offline mode", async () => {
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: {
        offline: true,
        offlineDb: "/tmp/advisories.db",
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
      projectArg: ".",
    });
    loadPackagesMock.mockReturnValue(createScanInput({
      packages: [{ name: "lodash", version: "4.17.21", ecosystem: "npm", paths: [["project", "lodash"]] }],
    }));

    const result = await runIndexModule();

    expect(result.exitCode).toBe(0);
    expect(stripAnsi(result.stdout[0] ?? "")).toContain("Offline mode: enabled");
    expect(stripAnsi(result.stdout[1] ?? "")).toContain("Advisory source: local advisory database");
    expect(stripAnsi(result.stdout[1] ?? "")).toContain("/tmp/advisories.db");
    expect(stripAnsi(result.stdout[2] ?? "")).toContain("Advisory DB freshness: synced");
  });

  it("warns when the local advisory DB appears stale", async () => {
    const createAdvisorySourceMock = (await import("../src/scanner.js")).createAdvisorySource as jest.Mock;
    createAdvisorySourceMock.mockReturnValueOnce({
      advisorySource: { queryBatch: jest.fn(), getVuln: jest.fn() },
      offline: true,
      sourceLabel: "local advisory database (/tmp/advisories.db)",
      advisoryDbMetadata: {
        lastSyncAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        sourceUrl: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
      },
      advisoryDbIsStale: true,
      cleanup: jest.fn(),
    });

    parseArgsMock.mockReturnValue({
      command: "scan",
      options: {
        json: true,
        offline: true,
        offlineDb: "/tmp/advisories.db",
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
      projectArg: ".",
    });
    loadPackagesMock.mockReturnValue(createScanInput({
      packages: [{ name: "lodash", version: "4.17.21", ecosystem: "npm", paths: [["project", "lodash"]] }],
    }));

    const result = await runIndexModule();

    expect(result.exitCode).toBe(0);
    expect(logWarnMock).toHaveBeenCalledWith(
      "The local advisory DB appears stale. Re-run `cve-lite advisories sync` to refresh it.",
      expect.anything(),
    );
  });

  it("routes advisories sync through the sync module and exits successfully", async () => {
    syncOsvAdvisoriesMock.mockResolvedValue({
      advisoryCount: 2,
      dbPath: "/tmp/advisories.db",
      sourceUrl: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
    });
    parseArgsMock.mockReturnValue({
      command: "advisories-sync",
      options: {
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
        output: "/tmp/advisories.db",
      },
    });

    const result = await runIndexModule();

    expect(result.exitCode).toBe(0);
    expect(syncOsvAdvisoriesMock).toHaveBeenCalledWith(
      expect.objectContaining({ outputPath: "/tmp/advisories.db", onProgress: expect.any(Function) }),
    );
    expect(loadPackagesMock).not.toHaveBeenCalled();
    expect(result.stdout.some(line => stripAnsi(line).includes("Advisory sync complete (2 records)"))).toBe(true);
    expect(result.stdout.some(line => stripAnsi(line).includes("Advisory database: synced 2 records"))).toBe(true);
  });

  it("applies validated direct fixes and rescans in --fix mode", async () => {
    const finding = createFinding({ pkg: { name: "multer", version: "1.4.5-lts.2", ecosystem: "npm", paths: [["project", "multer"]] } });
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: {
        fix: true,
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
      projectArg: ".",
    });
    loadPackagesMock
      .mockReturnValueOnce(createScanInput({ source: "package-lock", filePath: "/tmp/project/package-lock.json", packages: [finding.pkg] }))
      .mockReturnValueOnce(createScanInput({ source: "package-lock", filePath: "/tmp/project/package-lock.json", packages: [finding.pkg] }));
    scanPackagesMock.mockResolvedValueOnce([finding]).mockResolvedValueOnce([]);
    buildSuggestedFixCommandPlanMock.mockReturnValueOnce({
      packageManager: "npm",
      sourceLabel: "package-lock.json",
      command: "npm install multer@2.1.1",
      sections: [],
      targets: [
        {
          package: "multer",
          currentVersion: "1.4.5-lts.2",
          targetVersion: "2.1.1",
          kind: "direct",
          urgent: false,
          severity: "medium",
          adjusted: false,
          reason: "Direct upgrade target",
        },
      ],
      skipped: [],
    });

    const result = await runIndexModule();
    const output = stripAnsi(result.stdout.join("\n"));

    expect(result.exitCode).toBe(0);
    expect(spawnMock).toHaveBeenCalledWith(
      "npm",
      ["install", "multer@2.1.1"],
      expect.objectContaining({ cwd: expect.any(String), stdio: ["ignore", "pipe", "pipe"] }),
    );
    expect(loadPackagesMock).toHaveBeenCalledTimes(2);
    expect(scanPackagesMock).toHaveBeenCalledTimes(2);
    expect(output).toContain("Applying fixes (--fix)");
    expect(output).toContain("Applied fixes");
    expect(output).toContain("Fix summary");
    expect(printCompactOutputMock).not.toHaveBeenCalled();
    expect(printSummaryMock).not.toHaveBeenCalled();
  });

  it("includes a package manager hint when the fix command fails to spawn", async () => {
    setupFixModeWithNpmDirectTarget();
    spawnMock.mockImplementationOnce(() => {
      const child = createMockSpawnChild();
      process.nextTick(() => child.emit("error", new Error("spawn npm ENOENT")));
      return child;
    });

    const result = await runIndexModule();
    const stderr = stripAnsi(result.stderr.join("\n"));

    expect(result.exitCode).toBe(1);
    expect(stderr).toContain("Failed to apply fixes: spawn npm ENOENT");
    expect(stderr).toContain(NPM_FIX_HINT);
    expect(stderr).toContain(CI_FIX_HINT);
  });

  it("includes a package manager hint when the fix command exits with non-zero status", async () => {
    setupFixModeWithNpmDirectTarget();
    spawnMock.mockImplementationOnce(() => {
      const child = createMockSpawnChild();
      process.nextTick(() => child.emit("close", 1));
      return child;
    });

    const result = await runIndexModule();
    const stderr = stripAnsi(result.stderr.join("\n"));

    expect(result.exitCode).toBe(1);
    expect(stderr).toContain("Fix command exited with status 1");
    expect(stderr).toContain(NPM_FIX_HINT);
    expect(stderr).toContain(CI_FIX_HINT);
  });

  it("fails fast when --fix is used with --json", async () => {
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: {
        fix: true,
        json: true,
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
      projectArg: ".",
    });

    const result = await runIndexModule();

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("--fix cannot be used with --json");
  });

  it("throws when --no-cache is used with --offline", async () => {
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: { failOn: "critical", batchSize: "100", noCache: true, offline: true },
      projectArg: ".",
    });
    loadPackagesMock.mockResolvedValue({ scanInput: { packages: [], notes: [], warnings: [], skippedDependencies: [] }, projectPath: "." });

    const result = await runIndexModule();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("--no-cache cannot be used with --offline");
  });

  it("throws when --no-cache is used with --offline-db", async () => {
    parseArgsMock.mockReturnValue({
      command: "scan",
      options: { failOn: "critical", batchSize: "100", noCache: true, offlineDb: "/tmp/advisories.db" },
      projectArg: ".",
    });
    loadPackagesMock.mockResolvedValue({ scanInput: { packages: [], notes: [], warnings: [], skippedDependencies: [] }, projectPath: "." });

    const result = await runIndexModule();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join("\n")).toContain("--no-cache cannot be used with --offline");
  });

  it("routes install-skill command, calls installSkill with cwd, and exits 0", async () => {
    parseArgsMock.mockReturnValue({ command: "install-skill", options: {} });

    const result = await runIndexModule();

    expect(installSkillMock).toHaveBeenCalledWith(process.cwd());
    expect(result.exitCode).toBe(0);
  });

  describe("--report flag", () => {
    it("calls writeHtmlReport and prints the report path", async () => {
      const packages = [
        { name: "lodash", version: "4.17.21", ecosystem: "npm", paths: [["project", "lodash"]] },
      ];
      loadPackagesMock.mockReturnValue(createScanInput({ packages }));
      scanPackagesMock.mockResolvedValue([]);
      parseArgsMock.mockReturnValue({
        command: "scan",
        options: {
          failOn: "critical",
          batchSize: "100",
          searchDepth: "4",
          minSeverity: "medium",
          report: "./my-report",
          noOpen: true,
        },
        projectArg: ".",
      });

      const result = await runIndexModule();

      expect(writeHtmlReportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outputDir: expect.stringContaining("my-report"),
          autoOpen: false,
        })
      );
      const output = result.stdout.join("\n");
      expect(output).toContain("/tmp/cve-report/index.html");
    });

    it("throws when --report and --json are both set", async () => {
      parseArgsMock.mockReturnValue({
        command: "scan",
        options: {
          failOn: "critical",
          batchSize: "100",
          searchDepth: "4",
          minSeverity: "medium",
          report: true,
          json: true,
        },
        projectArg: ".",
      });

      const result = await runIndexModule();

      expect(result.stderr.join("\n")).toContain("--report cannot be used with --json");
    });

    it("uses ./cve-report as default output dir when --report is true (boolean)", async () => {
      const packages = [
        { name: "lodash", version: "4.17.21", ecosystem: "npm", paths: [["project", "lodash"]] },
      ];
      loadPackagesMock.mockReturnValue(createScanInput({ packages }));
      scanPackagesMock.mockResolvedValue([]);
      parseArgsMock.mockReturnValue({
        command: "scan",
        options: {
          failOn: "critical",
          batchSize: "100",
          searchDepth: "4",
          minSeverity: "medium",
          report: true,
          noOpen: true,
        },
        projectArg: ".",
      });

      await runIndexModule();

      const callArgs: Parameters<typeof writeHtmlReport>[0] = writeHtmlReportMock.mock.calls[0][0];
      expect(callArgs.outputDir).toContain("cve-report");
    });
  });
});
