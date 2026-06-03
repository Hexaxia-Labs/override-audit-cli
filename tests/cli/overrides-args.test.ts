import { parseArgs } from "../../src/cli/args.js";

describe("parseArgs - overrides subcommand", () => {
  it("parses `cve-lite overrides .` as command=overrides", () => {
    const { command, projectArg } = parseArgs(["overrides", "."]);
    expect(command).toBe("overrides");
    expect(projectArg).toBe(".");
  });

  it("parses `overrides --json --check-network`", () => {
    const { command, options } = parseArgs(["overrides", ".", "--json", "--check-network"]);
    expect(command).toBe("overrides");
    expect(options.json).toBe(true);
    expect(options.checkNetwork).toBe(true);
  });

  it("parses --audit-log path", () => {
    const { options } = parseArgs(["overrides", ".", "--audit-log", "/tmp/x.ndjson"]);
    expect(options.auditLog).toBe("/tmp/x.ndjson");
  });

  it("parses --rule OA001", () => {
    const { options } = parseArgs(["overrides", ".", "--rule", "OA001"]);
    expect(options.rule).toBe("OA001");
  });

  it("parses --fix on the overrides command", () => {
    const { options } = parseArgs(["overrides", ".", "--fix"]);
    expect(options.fix).toBe(true);
  });

  it("parses --debug on the overrides command", () => {
    const { options } = parseArgs(["overrides", ".", "--debug"]);
    expect(options.debug).toBe(true);
  });
});

describe("parseArgs - scan flags additions", () => {
  it("parses --audit-log on the scan path", () => {
    const { command, options } = parseArgs([".", "--audit-log=/tmp/x.ndjson"]);
    expect(command).toBe("scan");
    expect(options.auditLog).toBe("/tmp/x.ndjson");
  });

  it("parses --check-overrides", () => {
    const { options } = parseArgs([".", "--check-overrides"]);
    expect(options.checkOverrides).toBe(true);
  });
});
