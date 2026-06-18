import { jest } from "@jest/globals";
import { printBanner, printHelp } from "../src/cli/help.js";
import { stripAnsi } from "../src/utils/chalk.js";

function captureLogs(run: () => void): string[] {
  const logs: string[] = [];
  const spy = jest.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(arg => String(arg)).join(" "));
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return logs.map(line => stripAnsi(line));
}

describe("printBanner", () => {
  it("suppresses all stdout when json: true", () => {
    const logs = captureLogs(() => {
      printBanner({ json: true });
    });
    expect(logs).toHaveLength(0);
  });

  it("prints the CLI banner text when json is not set", () => {
    // Suppress the update-check network call in test environments.
    process.env["NO_UPDATE_NOTIFIER"] = "1";
    try {
      const logs = captureLogs(() => {
        printBanner();
      });
      expect(logs.some(line => line.includes("CVE Lite CLI"))).toBe(true);
    } finally {
      delete process.env["NO_UPDATE_NOTIFIER"];
    }
  });
});

describe("printHelp", () => {
  it("prints the help examples section with common invocations", () => {
    process.env["NO_UPDATE_NOTIFIER"] = "1";
    try {
      const logs = captureLogs(() => {
        printHelp();
      });
      const output = logs.join("\n");

      expect(output).toContain("Examples:");
      expect(output).toContain("cve-lite .                        Scan the current directory");
      expect(output).toContain("cve-lite . --verbose              Full output with fix plan and findings table");
      expect(output).toContain("cve-lite . --fail-on high         Exit 1 if any high or critical findings are found");
      expect(output).toContain("cve-lite . --json                 Write findings to a timestamped JSON file");
      expect(output).toContain("cve-lite . --report               Generate an interactive HTML report");
      expect(output).toContain("cve-lite . --fix                  Apply validated direct dependency fixes and rescan");
      expect(output).toContain("cve-lite . --offline              Scan using the local advisory database (no network)");
      expect(output).toContain("cve-lite advisories sync          Sync the local advisory database");
    } finally {
      delete process.env["NO_UPDATE_NOTIFIER"];
    }
  });
});
