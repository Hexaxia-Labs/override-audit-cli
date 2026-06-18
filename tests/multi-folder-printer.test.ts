import { jest } from "@jest/globals";

const printSummaryMock = jest.fn<any>();
const printActionSummaryMock = jest.fn<any>();
const printSuggestedFixCommandsMock = jest.fn<any>();
const printSuggestedFixCommandSkipsMock = jest.fn<any>();
const printCoverageMock = jest.fn<any>();
const printSkippedDependenciesMock = jest.fn<any>();
const printTableMock = jest.fn<any>();
const printFinalStatusMock = jest.fn<any>();
const printCompactOutputMock = jest.fn<any>();
const logInfoMock = jest.fn<any>();
const logWarnMock = jest.fn<any>();

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

jest.unstable_mockModule("../src/output/formatters.js", () => ({
  logInfo: logInfoMock,
  logWarn: logWarnMock,
}));

const consoleLogMock = jest.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => jest.clearAllMocks());
afterAll(() => consoleLogMock.mockRestore());

let printMultiFolderResults: (results: any[], options: any) => void;

beforeAll(async () => {
  const mod = await import("../src/output/multi-folder-printer.js");
  printMultiFolderResults = mod.printMultiFolderResults;
});

const makeResult = (subfolder: string, overrides?: Record<string, unknown>) => ({
  subfolder,
  sorted: [],
  scanInput: {
    mode: "resolved-lockfile" as const,
    source: "package-lock" as const,
    filePath: null,
    packages: [],
    notes: [],
    warnings: [],
    skippedDependencies: [],
  },
  suggestedFixCommands: null,
  coverage: [],
  minSeverity: "medium" as const,
  tableFindings: [],
  allPackages: [],
  ...overrides,
});

const baseOptions = { failOn: "none", batchSize: "100" } as any;

describe("printMultiFolderResults — compact mode (default)", () => {
  it("prints a folder header for each result", () => {
    printMultiFolderResults([makeResult("sessionManager"), makeResult("apiServer")], baseOptions);
    const output = consoleLogMock.mock.calls.flat().join("\n");
    expect(output).toContain("sessionManager");
    expect(output).toContain("apiServer");
  });

  it("prints summary line with folder count", () => {
    printMultiFolderResults([makeResult("sessionManager"), makeResult("apiServer")], baseOptions);
    const output = consoleLogMock.mock.calls.flat().join("\n");
    expect(output).toMatch(/2 folders/i);
  });

  it("calls printCompactOutput once per folder", () => {
    printMultiFolderResults([makeResult("sessionManager"), makeResult("apiServer")], baseOptions);
    expect(printCompactOutputMock).toHaveBeenCalledTimes(2);
  });

  it("does not call verbose printer functions in compact mode", () => {
    printMultiFolderResults([makeResult("sessionManager")], baseOptions);
    expect(printSummaryMock).not.toHaveBeenCalled();
    expect(printActionSummaryMock).not.toHaveBeenCalled();
    expect(printTableMock).not.toHaveBeenCalled();
    expect(printFinalStatusMock).not.toHaveBeenCalled();
  });

  it("passes subfolder to printCompactOutput", () => {
    printMultiFolderResults([makeResult("sessionManager")], baseOptions);
    expect(printCompactOutputMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ subfolder: "sessionManager" }),
    );
  });

  it("emits a warning for each scanInput warning", () => {
    const result = makeResult("sessionManager", {
      scanInput: {
        mode: "resolved-lockfile",
        source: "package-lock",
        filePath: null,
        packages: [],
        notes: [],
        warnings: ["Nested lockfile fallback used"],
        skippedDependencies: [],
      },
    });
    printMultiFolderResults([result], baseOptions);
    expect(logWarnMock).toHaveBeenCalledWith("Nested lockfile fallback used", expect.anything());
  });
});

describe("printMultiFolderResults — verbose mode", () => {
  const verboseOptions = { ...baseOptions, verbose: true } as any;

  it("calls verbose printer functions instead of printCompactOutput", () => {
    printMultiFolderResults([makeResult("sessionManager")], verboseOptions);
    expect(printSummaryMock).toHaveBeenCalledTimes(1);
    expect(printActionSummaryMock).toHaveBeenCalledTimes(1);
    expect(printFinalStatusMock).toHaveBeenCalledTimes(1);
    expect(printCompactOutputMock).not.toHaveBeenCalled();
  });

  it("passes subfolder to printSuggestedFixCommands", () => {
    printMultiFolderResults([makeResult("apiServer")], verboseOptions);
    expect(printSuggestedFixCommandsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ subfolder: "apiServer" }),
    );
  });

  it("calls printCoverage with notes and coverage combined", () => {
    const result = makeResult("sessionManager", {
      coverage: ["Covered 10 of 12 packages"],
      scanInput: {
        mode: "resolved-lockfile",
        source: "package-lock",
        filePath: null,
        packages: [],
        notes: ["Parser note"],
        warnings: [],
        skippedDependencies: [],
      },
    });
    printMultiFolderResults([result], verboseOptions);
    expect(printCoverageMock).toHaveBeenCalledWith(
      expect.arrayContaining(["Parser note", "Covered 10 of 12 packages"]),
    );
  });

  it("calls printSkippedDependencies when skippedDependencies is non-empty", () => {
    const result = makeResult("sessionManager", {
      scanInput: {
        mode: "resolved-lockfile",
        source: "package-lock",
        filePath: null,
        packages: [],
        notes: [],
        warnings: [],
        skippedDependencies: ["dependencies:debug@^4.3.0"],
      },
    });
    printMultiFolderResults([result], verboseOptions);
    expect(printSkippedDependenciesMock).toHaveBeenCalledWith(["dependencies:debug@^4.3.0"]);
  });

  it("does not call printSkippedDependencies when skippedDependencies is empty", () => {
    printMultiFolderResults([makeResult("sessionManager")], verboseOptions);
    expect(printSkippedDependenciesMock).not.toHaveBeenCalled();
  });

  it("calls printTable when tableFindings is non-empty", () => {
    const finding = {
      pkg: { name: "axios", version: "1.7.7", ecosystem: "npm" },
      vulnerabilities: [],
      severity: "high" as const,
      cveAliases: [],
      dependencyPaths: [],
      relationship: "direct" as const,
      firstFixedVersion: null,
    };
    const result = makeResult("sessionManager", {
      sorted: [finding],
      tableFindings: [finding],
    });
    printMultiFolderResults([result], verboseOptions);
    expect(printTableMock).toHaveBeenCalled();
  });
});
