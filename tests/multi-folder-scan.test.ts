import { jest } from "@jest/globals";

const loadMultiplePackagesMock = jest.fn<any>();
const scanPackagesMock = jest.fn<any>(() => Promise.resolve([]));
const buildCoverageNotesMock = jest.fn<any>(() => []);
const sortFindingsForOutputMock = jest.fn<any>((f: any[]) => f);
const normalizeSeverityMock = jest.fn<any>(() => "medium");
const selectFindingsForTableMock = jest.fn<any>((f: any[]) => f);
const buildSuggestedFixCommandPlanMock = jest.fn<any>(() => null);
const readDirectDependencyNamesMock = jest.fn<any>(() => new Set<string>());
const buildOverrideContextMock = jest.fn<any>(() => ({}));
const auditMock = jest.fn<any>(() => Promise.resolve({ findings: [] }));

jest.unstable_mockModule("../src/parsers/multi-package.js", () => ({
  loadMultiplePackages: loadMultiplePackagesMock,
  findNestedLockfiles: jest.fn(() => []),
  hasRootLockfile: jest.fn(() => false),
}));

jest.unstable_mockModule("../src/scanner.js", () => ({
  scanPackages: scanPackagesMock,
  buildCoverageNotes: buildCoverageNotesMock,
}));

jest.unstable_mockModule("../src/output/formatters.js", () => ({
  sortFindingsForOutput: sortFindingsForOutputMock,
  serializeFinding: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

jest.unstable_mockModule("../src/osv/severity.js", () => ({
  normalizeSeverity: normalizeSeverityMock,
}));

jest.unstable_mockModule("../src/output/finding-display.js", () => ({
  selectFindingsForTable: selectFindingsForTableMock,
}));

jest.unstable_mockModule("../src/remediation/fix-commands.js", () => ({
  buildSuggestedFixCommandPlan: buildSuggestedFixCommandPlanMock,
  findSuggestedCommandForFinding: jest.fn(() => null),
}));

jest.unstable_mockModule("../src/utils/package-json.js", () => ({
  readDirectDependencyNames: readDirectDependencyNamesMock,
}));

jest.unstable_mockModule("../src/overrides/index.js", () => ({
  buildOverrideContext: buildOverrideContextMock,
  audit: auditMock,
}));

jest.unstable_mockModule("../src/audit-log/index.js", () => ({
  NULL_AUDIT_LOG: { emit: jest.fn(), close: jest.fn() },
  createAuditLog: jest.fn(() => ({ emit: jest.fn(), close: jest.fn() })),
}));

jest.unstable_mockModule("../src/output/multi-folder-printer.js", () => ({
  printMultiFolderResults: jest.fn(),
}));

jest.unstable_mockModule("../src/output/multi-folder-html-reporter.js", () => ({
  writeMultiFolderHtmlReport: jest.fn(() => Promise.resolve({ reportPath: "/tmp/report/index.html" })),
}));

jest.unstable_mockModule("../src/utils/version-info.js", () => ({
  getCliVersion: jest.fn(() => "1.18.1"),
}));

const stdoutWriteSpy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
const consoleLogMock = jest.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => jest.clearAllMocks());
afterAll(() => {
  stdoutWriteSpy.mockRestore();
  consoleLogMock.mockRestore();
});

const makeScanInput = () => ({
  mode: "resolved-lockfile" as const,
  source: "package-lock" as const,
  filePath: "/project/sessionManager/package-lock.json",
  packages: [{ name: "lodash", version: "4.17.20", ecosystem: "npm" }],
  notes: [],
  warnings: [],
  skippedDependencies: [],
});

const baseOptions = {
  failOn: "none",
  batchSize: "100",
  searchDepth: "4",
  minSeverity: "medium",
} as any;

let runMultiFolderScan: any;

beforeAll(async () => {
  const mod = await import("../src/scan/multi-folder-scan.js");
  runMultiFolderScan = mod.runMultiFolderScan;
});

describe("runMultiFolderScan", () => {
  it("returns one result per folder", async () => {
    loadMultiplePackagesMock.mockReturnValue([
      { subfolder: "sessionManager", scanInput: makeScanInput() },
      { subfolder: "apiServer", scanInput: makeScanInput() },
    ]);

    const results = await runMultiFolderScan({
      projectRoot: "/project",
      batchSize: 100,
      options: baseOptions,
    });

    expect(results).toHaveLength(2);
    expect(results[0].subfolder).toBe("sessionManager");
    expect(results[1].subfolder).toBe("apiServer");
  });

  it("calls scanPackages once per folder", async () => {
    loadMultiplePackagesMock.mockReturnValue([
      { subfolder: "sessionManager", scanInput: makeScanInput() },
      { subfolder: "apiServer", scanInput: makeScanInput() },
    ]);

    await runMultiFolderScan({ projectRoot: "/project", batchSize: 100, options: baseOptions });

    expect(scanPackagesMock).toHaveBeenCalledTimes(2);
  });

  it("skips folders with zero packages", async () => {
    const emptyScanInput = { ...makeScanInput(), packages: [] };
    loadMultiplePackagesMock.mockReturnValue([
      { subfolder: "empty", scanInput: emptyScanInput },
      { subfolder: "apiServer", scanInput: makeScanInput() },
    ]);

    const results = await runMultiFolderScan({ projectRoot: "/project", batchSize: 100, options: baseOptions });

    expect(results).toHaveLength(1);
    expect(results[0].subfolder).toBe("apiServer");
  });

  it("writes a folder header to stdout for each scanned folder when not in JSON mode", async () => {
    loadMultiplePackagesMock.mockReturnValue([
      { subfolder: "sessionManager", scanInput: makeScanInput() },
      { subfolder: "apiServer", scanInput: makeScanInput() },
    ]);

    await runMultiFolderScan({ projectRoot: "/project", batchSize: 100, options: baseOptions });

    const written = stdoutWriteSpy.mock.calls.map(call => String(call[0])).join("");
    expect(written).toContain("sessionManager/");
    expect(written).toContain("apiServer/");
  });

  it("does not write folder headers to stdout in JSON mode", async () => {
    loadMultiplePackagesMock.mockReturnValue([
      { subfolder: "sessionManager", scanInput: makeScanInput() },
    ]);

    await runMultiFolderScan({
      projectRoot: "/project",
      batchSize: 100,
      options: { ...baseOptions, json: true },
    });

    const written = stdoutWriteSpy.mock.calls.map(call => String(call[0])).join("");
    expect(written).not.toContain("sessionManager/");
  });

  it("runs the override audit once per folder and attaches findings when --check-overrides is set", async () => {
    loadMultiplePackagesMock.mockReturnValue([
      { subfolder: "a", scanInput: makeScanInput() },
      { subfolder: "b", scanInput: makeScanInput() },
    ]);
    auditMock.mockResolvedValue({
      findings: [
        { ruleId: "OA001", severity: "high", package: { name: "x" }, location: { file: "package.json" }, message: "orphan" },
      ],
    });

    const results = await runMultiFolderScan({
      projectRoot: "/project",
      batchSize: 100,
      options: { ...baseOptions, checkOverrides: true },
    });

    expect(auditMock).toHaveBeenCalledTimes(2);
    expect(results[0].overrideFindings).toHaveLength(1);
    expect(results[0].overrideFindings[0].ruleId).toBe("OA001");
  });

  it("does not run the override audit when --check-overrides is not set", async () => {
    loadMultiplePackagesMock.mockReturnValue([
      { subfolder: "a", scanInput: makeScanInput() },
    ]);

    const results = await runMultiFolderScan({ projectRoot: "/project", batchSize: 100, options: baseOptions });

    expect(auditMock).not.toHaveBeenCalled();
    expect(results[0].overrideFindings ?? []).toHaveLength(0);
  });

  it("attaches subfolder to suggestedFixCommands plan", async () => {
    loadMultiplePackagesMock.mockReturnValue([
      { subfolder: "sessionManager", scanInput: makeScanInput() },
    ]);
    buildSuggestedFixCommandPlanMock.mockReturnValue({ sections: [], targets: [], skipped: [], command: "npm install" });

    await runMultiFolderScan({ projectRoot: "/project", batchSize: 100, options: baseOptions });

    expect(buildSuggestedFixCommandPlanMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ subfolder: "sessionManager" }),
    );
  });
});
