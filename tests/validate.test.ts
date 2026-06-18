import { validateOptions } from "../src/cli/validate.js";
import type { ParsedOptions } from "../src/types.js";

function opts(overrides: Partial<ParsedOptions> = {}): ParsedOptions {
  return { failOn: "none", batchSize: "50", ...overrides };
}

describe("validateOptions", () => {
  describe("--offline / --offline-db with --osv-url", () => {
    it("throws when --offline and --osv-url are combined", () => {
      expect(() => validateOptions(opts({ offline: true, osvUrl: "https://example.com" }))).toThrow(
        "--offline/--offline-db cannot be used with --osv-url",
      );
    });

    it("throws when --offline-db and --osv-url are combined", () => {
      expect(() => validateOptions(opts({ offlineDb: "/path/to/db", osvUrl: "https://example.com" }))).toThrow(
        "--offline/--offline-db cannot be used with --osv-url",
      );
    });

    it("does not throw when --offline is used without --osv-url", () => {
      expect(() => validateOptions(opts({ offline: true }))).not.toThrow();
    });
  });

  describe("--no-cache with --offline / --offline-db", () => {
    it("throws when --no-cache and --offline are combined", () => {
      expect(() => validateOptions(opts({ noCache: true, offline: true }))).toThrow(
        "--no-cache cannot be used with --offline or --offline-db",
      );
    });

    it("throws when --no-cache and --offline-db are combined", () => {
      expect(() => validateOptions(opts({ noCache: true, offlineDb: "/path/to/db" }))).toThrow(
        "--no-cache cannot be used with --offline or --offline-db",
      );
    });

    it("does not throw when --no-cache is used without offline flags", () => {
      expect(() => validateOptions(opts({ noCache: true }))).not.toThrow();
    });
  });

  describe("--osv-url validation", () => {
    it("throws when --osv-url is not a valid URL", () => {
      expect(() => validateOptions(opts({ osvUrl: "not-a-url" }))).toThrow(
        "Invalid value for --osv-url: not-a-url",
      );
    });

    it("does not throw when --osv-url is a valid URL", () => {
      expect(() => validateOptions(opts({ osvUrl: "https://custom.osv.example.com" }))).not.toThrow();
    });
  });

  describe("--fix with --json", () => {
    it("throws when --fix and --json are combined", () => {
      expect(() => validateOptions(opts({ fix: true, json: true }))).toThrow(
        "--fix cannot be used with --json",
      );
    });

    it("does not throw when --fix is used without --json", () => {
      expect(() => validateOptions(opts({ fix: true }))).not.toThrow();
    });
  });

  describe("--report with --json", () => {
    it("throws when --report and --json are combined", () => {
      expect(() => validateOptions(opts({ report: "report.html", json: true }))).toThrow(
        "--report cannot be used with --json",
      );
    });

    it("does not throw when --report is used without --json", () => {
      expect(() => validateOptions(opts({ report: "report.html" }))).not.toThrow();
    });
  });

  describe("--ca-cert validation", () => {
    it("throws with a --ca-cert: prefix when the cert file does not exist or is invalid", () => {
      expect(() => validateOptions(opts({ caCert: "invalid-fake-cert.pem" }))).toThrow(
        "--ca-cert:"
      );
    });

    it("does not throw when --ca-cert is not set", () => {
      expect(() => validateOptions(opts({}))).not.toThrow();
    });
  });

  it("does not throw for a valid set of options", () => {
    expect(() => validateOptions(opts({ fix: true, verbose: true }))).not.toThrow();
  });
});
