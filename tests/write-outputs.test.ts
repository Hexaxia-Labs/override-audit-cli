import { jest } from "@jest/globals";
import type { Finding, PackageRef, ParsedOptions, ScanInput } from "../src/types.js";
import type { ScanState } from "../src/output/write-outputs.js";

const writeFileSyncMock = jest.fn<any>();
const existsSyncMock = jest.fn<any>(() => false);
const readFileSyncMock = jest.fn<any>(() => JSON.stringify({ name: "my-project", version: "1.0.0" }));

const writeSarifReportMock = jest.fn<any>(() => "cve-lite-scan-test.sarif");
const deriveLockfileUriMock = jest.fn<any>(() => "package-lock.json");

const writeCycloneDxReportMock = jest.fn<any>(() => "cve-lite-scan-test.cdx.json");

jest.unstable_mockModule("node:fs", () => ({
  default: {
    writeFileSync: writeFileSyncMock,
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
  },
  writeFileSync: writeFileSyncMock,
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

jest.unstable_mockModule("../src/output/sarif.js", () => ({
  writeSarifReport: writeSarifReportMock,
  deriveLockfileUri: deriveLockfileUriMock,
}));

jest.unstable_mockModule("../src/output/cyclonedx.js", () => ({
  writeCycloneDxReport: writeCycloneDxReportMock,
}));

let writeOutputs: (
  options: ParsedOptions,
  scanState: ScanState,
  scanInput: ScanInput,
  projectPath: string,
) => Promise<void>;

beforeAll(async () => {
  const mod = await import("../src/output/write-outputs.js");
  writeOutputs = mod.writeOutputs;
});

beforeEach(() => {
  jest.clearAllMocks();
  writeSarifReportMock.mockReturnValue("cve-lite-scan-test.sarif");
  writeCycloneDxReportMock.mockReturnValue("cve-lite-scan-test.cdx.json");
  readFileSyncMock.mockReturnValue(JSON.stringify({ name: "my-project", version: "1.0.0" }));
  existsSyncMock.mockReturnValue(true);
});

const mockScanState = {
  sorted: [] as Finding[],
  allPackages: [] as PackageRef[],
  suggestedFixCommands: null,
  coverage: [],
  minSeverity: "medium" as const,
  tableFindings: [],
};

const mockScanInput: ScanInput = {
  mode: "resolved-lockfile",
  source: "package-lock",
  filePath: "/tmp/project/package-lock.json",
  packages: [],
  notes: [],
  warnings: [],
  skippedDependencies: [],
};

function makeOptions(overrides: Partial<ParsedOptions> = {}): ParsedOptions {
  return { failOn: "critical", batchSize: "100", ...overrides };
}

describe("writeOutputs", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("calls writeSarifReport when sarif: true", async () => {
    await writeOutputs(makeOptions({ sarif: true }), mockScanState, mockScanInput, "/tmp/project");
    expect(writeSarifReportMock).toHaveBeenCalledTimes(1);
  });

  it("calls writeCycloneDxReport when cdx: true", async () => {
    await writeOutputs(makeOptions({ cdx: true }), mockScanState, mockScanInput, "/tmp/project");
    expect(writeCycloneDxReportMock).toHaveBeenCalledTimes(1);
  });

  it("calls writeFileSync when json: true", async () => {
    await writeOutputs(makeOptions({ json: true }), mockScanState, mockScanInput, "/tmp/project");
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [, jsonContent] = writeFileSyncMock.mock.calls[0] as [string, string];
    const parsed = JSON.parse(jsonContent);
    expect(parsed).toMatchObject({
      projectPath: expect.any(String),
      mode: expect.any(String),
      source: expect.any(String),
      packageCount: expect.any(Number),
      findingCount: expect.any(Number),
      findings: expect.any(Array),
    });
  });

  it("does NOT call writeSarifReport when sarif is not set", async () => {
    await writeOutputs(makeOptions(), mockScanState, mockScanInput, "/tmp/project");
    expect(writeSarifReportMock).not.toHaveBeenCalled();
  });

  it("does NOT call writeCycloneDxReport when cdx is not set", async () => {
    await writeOutputs(makeOptions(), mockScanState, mockScanInput, "/tmp/project");
    expect(writeCycloneDxReportMock).not.toHaveBeenCalled();
  });

  describe("readProjectMeta (via cdx path)", () => {
    it("passes null projectMeta when package.json does not exist", async () => {
      existsSyncMock.mockReturnValueOnce(false);
      await writeOutputs(makeOptions({ cdx: true }), mockScanState, mockScanInput, "/project");
      const [,, planArg, metaArg] = writeCycloneDxReportMock.mock.calls[0] as any[];
      expect(metaArg).toBeNull();
    });

    it("passes null projectMeta when package.json has invalid JSON", async () => {
      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce("not valid json");
      await writeOutputs(makeOptions({ cdx: true }), mockScanState, mockScanInput, "/project");
      const [,, planArg, metaArg] = writeCycloneDxReportMock.mock.calls[0] as any[];
      expect(metaArg).toBeNull();
    });

    it("passes null projectMeta when package.json has no name field", async () => {
      existsSyncMock.mockReturnValueOnce(true);
      readFileSyncMock.mockReturnValueOnce(JSON.stringify({ version: "1.0.0" }));
      await writeOutputs(makeOptions({ cdx: true }), mockScanState, mockScanInput, "/project");
      const [,, planArg, metaArg] = writeCycloneDxReportMock.mock.calls[0] as any[];
      expect(metaArg).toBeNull();
    });
  });
});
