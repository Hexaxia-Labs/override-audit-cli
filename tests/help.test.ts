import { jest } from "@jest/globals";
import { printBanner } from "../src/cli/help.js";
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
