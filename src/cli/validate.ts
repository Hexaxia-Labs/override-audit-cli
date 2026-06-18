import { validateCaCertFile } from "./config.js";
import type { ParsedOptions } from "../types.js";

export function validateOptions(options: ParsedOptions): void {
  if ((options.offline || options.offlineDb) && options.osvUrl) {
    throw new Error("--offline/--offline-db cannot be used with --osv-url");
  }

  if (options.noCache && (options.offline || options.offlineDb)) {
    throw new Error("--no-cache cannot be used with --offline or --offline-db");
  }

  if (options.osvUrl) {
    try {
      new URL(options.osvUrl);
    } catch {
      throw new Error(`Invalid value for --osv-url: ${options.osvUrl}`);
    }
  }

  if (options.fix && options.json) {
    throw new Error("--fix cannot be used with --json");
  }

  if (options.createPr && !options.fix) {
    throw new Error("--create-pr requires --fix");
  }

  if (options.createPr && options.json) {
    throw new Error("--create-pr cannot be used with --json");
  }

  if (options.prBase && !options.createPr) {
    throw new Error("--base can only be used with --create-pr");
  }

  if (options.report && options.json) {
    throw new Error("--report cannot be used with --json");
  }

  if (options.caCert) {
    try {
      validateCaCertFile(options.caCert);
    } catch (err) {
      throw new Error(`--ca-cert: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
