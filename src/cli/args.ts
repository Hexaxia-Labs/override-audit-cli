import type { CliCommand, ParsedOptions } from "../types.js";
import { ConfigAction, ConfigKey } from "./config.js";

export type ConfigSubcommand =
  | { action: typeof ConfigAction.Set; key: typeof ConfigKey.CaCert; value: string }
  | { action: typeof ConfigAction.Unset; key: typeof ConfigKey.CaCert }
  | { action: typeof ConfigAction.Show };

export function parseArgs(argv: string[]): {
  command: CliCommand;
  options: ParsedOptions;
  projectArg?: string;
  configSubcommand?: ConfigSubcommand;
} {
  const options: ParsedOptions = {
    failOn: "critical",
    batchSize: "100",
    searchDepth: "4",
    minSeverity: "medium"
  };

  if (argv[0] === "advisories" && argv[1] === "sync") {
    for (let i = 2; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "-h" || arg === "--help") {
        options.help = true;
        continue;
      }
      if (arg === "-v" || arg === "--version") {
        options.version = true;
        continue;
      }
      if (arg === "--output") {
        options.output = argv[++i];
        continue;
      }
      if (arg.startsWith("--output=")) {
        options.output = arg.slice("--output=".length);
        continue;
      }
      if (arg === "--ca-cert") {
        const val = argv[++i];
        if (!val) throw new Error("--ca-cert requires a path argument");
        options.caCert = val;
        continue;
      }
      if (arg.startsWith("--ca-cert=")) {
        const val = arg.slice("--ca-cert=".length);
        if (!val) throw new Error("--ca-cert requires a path argument");
        options.caCert = val;
        continue;
      }
      if (arg.startsWith("-")) {
        throw new Error(`Unknown option: ${arg}`);
      }
      throw new Error(`Unexpected argument: ${arg}`);
    }

    return { command: "advisories-sync", options };
  }

  if (argv[0] === "install-skill") {
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "-h" || arg === "--help") {
        options.help = true;
        continue;
      }
      if (arg.startsWith("-")) {
        throw new Error(`Unknown option: ${arg}`);
      }
      throw new Error(`Unexpected argument: ${arg}`);
    }
    return { command: "install-skill", options };
  }

  if (argv[0] === "config") {
    const sub = argv[1];
    if (sub === ConfigAction.Show) {
      return { command: "config", options, configSubcommand: { action: ConfigAction.Show } };
    }
    if (sub === ConfigAction.Set) {
      const key = argv[2];
      const value = argv[3];
      if (key !== ConfigKey.CaCert) throw new Error(`Unknown config key: ${key ?? "(none)"}. Valid keys: ${ConfigKey.CaCert}`);
      if (!value) throw new Error(`cve-lite config set ${ConfigKey.CaCert} requires a path argument`);
      return { command: "config", options, configSubcommand: { action: ConfigAction.Set, key: ConfigKey.CaCert, value } };
    }
    if (sub === ConfigAction.Unset) {
      const key = argv[2];
      if (key !== ConfigKey.CaCert) throw new Error(`Unknown config key: ${key ?? "(none)"}. Valid keys: ${ConfigKey.CaCert}`);
      return { command: "config", options, configSubcommand: { action: ConfigAction.Unset, key: ConfigKey.CaCert } };
    }
    throw new Error(`Unknown config subcommand: ${sub ?? "(none)"}. Use: ${ConfigAction.Set}, ${ConfigAction.Unset}, ${ConfigAction.Show}`);
  }

  let projectArg: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      options.version = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }
    if (arg === "--fix") {
      options.fix = true;
      continue;
    }
    if (arg === "--prod-only") {
      options.prodOnly = true;
      continue;
    }
    if (arg === "--offline") {
      options.offline = true;
      continue;
    }
    if (arg === "--offline-db") {
      options.offlineDb = argv[++i];
      continue;
    }
    if (arg.startsWith("--offline-db=")) {
      options.offlineDb = arg.slice("--offline-db=".length);
      continue;
    }
    if (arg === "--all") {
      options.all = true;
      continue;
    }
    if (arg === "--fail-on") {
      options.failOn = argv[++i] ?? options.failOn;
      continue;
    }
    if (arg.startsWith("--fail-on=")) {
      options.failOn = arg.slice("--fail-on=".length);
      continue;
    }
    if (arg === "--batch-size") {
      options.batchSize = argv[++i] ?? options.batchSize;
      continue;
    }
    if (arg.startsWith("--batch-size=")) {
      options.batchSize = arg.slice("--batch-size=".length);
      continue;
    }
    if (arg === "--cache-dir") {
      options.cacheDir = argv[++i];
      continue;
    }
    if (arg.startsWith("--cache-dir=")) {
      options.cacheDir = arg.slice("--cache-dir=".length);
      continue;
    }
    if (arg === "--osv-url") {
      options.osvUrl = argv[++i];
      continue;
    }
    if (arg.startsWith("--osv-url=")) {
      options.osvUrl = arg.slice("--osv-url=".length);
      continue;
    }
    if (arg === "--output") {
      options.output = argv[++i];
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }
    if (arg === "--search-depth") {
      options.searchDepth = argv[++i] ?? options.searchDepth;
      continue;
    }
    if (arg.startsWith("--search-depth=")) {
      options.searchDepth = arg.slice("--search-depth=".length);
      continue;
    }
    if (arg === "--min-severity") {
      options.minSeverity = argv[++i] ?? options.minSeverity;
      continue;
    }
    if (arg.startsWith("--min-severity=")) {
      options.minSeverity = arg.slice("--min-severity=".length);
      continue;
    }
    if (arg === "--usage" || arg === "--usage-hints") {
      options.usage = true;
      continue;
    }
    if (arg === "--only-used") {
      options.onlyUsed = true;
      options.usage = true;
      continue;
    }
    if (arg === "--report") {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        options.report = next;
        i++;
      } else {
        options.report = true;
      }
      continue;
    }
    if (arg.startsWith("--report=")) {
      options.report = arg.slice("--report=".length);
      continue;
    }
    if (arg === "--no-open") {
      options.noOpen = true;
      continue;
    }
    if (arg === "--no-cache") {
      options.noCache = true;
      continue;
    }
    if (arg === "--ca-cert") {
      const val = argv[++i];
      if (!val) throw new Error("--ca-cert requires a path argument");
      options.caCert = val;
      continue;
    }
    if (arg.startsWith("--ca-cert=")) {
      options.caCert = arg.slice("--ca-cert=".length);
      continue;
    }
    if (arg === "--sarif") {
      options.sarif = true;
      continue;
    }
    if (arg === "--cdx") {
      options.cdx = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!projectArg) {
      projectArg = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (options.sarif && options.report) {
    throw new Error("cannot combine --sarif and --report");
  }

  if (options.cdx && options.report) {
    throw new Error("cannot combine --cdx and --report");
  }

  return { command: "scan", options, projectArg };
}
