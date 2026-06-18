import { chalk } from "../utils/chalk.js";
import { getCliVersion } from "../utils/version-info.js";
import { checkForUpdate } from "../utils/update-check.js";
import type { UpdateCheckOptions } from "../utils/update-check.js";

const CLI_VERSION = getCliVersion();

const CLI_BANNER = [
  `${chalk.green(">_")}  ${chalk.bold.whiteBright(`CVE Lite CLI (${CLI_VERSION})`)}`,
  chalk.gray("────────────────────────────────"),
  `${chalk.green("✔")} Scan dependencies`,
  `${chalk.green("✔")} Highlight critical issues`,
  `${chalk.green("✔")} Show a clear fix plan`,
  "",
  chalk.gray("Fast. Local. Developer-first.")
].join("\n");

export function printBanner(options?: UpdateCheckOptions): void {
  if (options?.json) return;
  console.log(CLI_BANNER);
  console.log("");
  checkForUpdate(options);
}

export function printHelp(): void {
  printBanner();

  const lines = [
    "Usage:",
    "  cve-lite [projectPath] [options]",
    "  cve-lite advisories sync [options]",
    "  cve-lite install-skill",
    "  cve-lite config <set|unset|show> [key] [value]",
    "  cve-lite overrides [path] [flags]",
    "",
    "Scan options:",
    "  --json                    Save scan results to a timestamped JSON file",
    "  --report [dir]            Generate an HTML report in [dir] (default: ./cve-report)",
    "  --sarif                   Write SARIF 2.1.0 output to a timestamped .sarif file",
    "  --cdx                     Write CycloneDX 1.4 SBOM to a timestamped .cdx.json file",
    "  --no-open                 Don't auto-open the report in the browser",
    "  --fix                     Apply validated direct dependency fixes and rescan",
    "  --ratchet                 Save current findings as baseline or, if baseline exists, only fail on new findings",
    "  --create-pr               After --fix, commit changes and open a GitHub pull request (requires gh)",
    "  --base <branch>           Base branch for --create-pr (default: main)",
    "  --osv-url <url>           Use a custom OSV-compatible advisory endpoint",
    "  --ca-cert <path>          Path to a CA certificate file for corporate SSL proxies",
    "  --debug                   Write verbose runtime/network diagnostics to a timestamped log file",
    "  --verbose                 Show detailed output with fix plan, paths, and full table",
    "  --prod-only               Exclude dev dependencies where available",
    "  --fail-on <severity>      Exit non-zero at or above severity (default: critical)",
    "  --batch-size <number>     OSV batch size (default: 100)",
    "  --usage                   Scan project source files to check if vulnerable dependencies are imported",
    "  --only-used               Filter out findings for packages that are not imported in your source code",
    "  --offline                 Scan using the local advisory database",
    "  --offline-db <path>       Use a specific local advisory database file",
    "  --cache-dir <path>        Override cache directory",
    "  --no-cache                Skip the query cache and fetch fresh results from OSV",
    "  --search-depth <number>   Recursive search depth (default: 4)",
    "  --all                     Show all findings in the main table",
    "  --min-severity <level>    Minimum severity shown in table (default: medium)",
    "",
    "Advisory sync options:",
    "  --output <path>           Write the local advisory database to this path",
    "",
    "Other commands:",
    "  install-skill             Install AI assistant skill files for Claude Code,",
    "                            Codex CLI, Gemini CLI, Cursor, and GitHub Copilot",
    "",
    "  config set ca-cert <path>  Save a CA certificate path to ~/.cve-lite-cli/config.json",
    "  config unset ca-cert       Remove the saved CA certificate path",
    "  config show                Show current configuration",
    "",
    "  -v, --version             Show the CLI version",
    "  -h, --help                Show this help message",
    "",
    "Examples:",
    "  cve-lite .                        Scan the current directory",
    "  cve-lite . --verbose              Full output with fix plan and findings table",
    "  cve-lite . --fail-on high         Exit 1 if any high or critical findings are found",
    "  cve-lite . --json                 Write findings to a timestamped JSON file",
    "  cve-lite . --report               Generate an interactive HTML report",
    "  cve-lite . --fix                  Apply validated direct dependency fixes and rescan",
    "  cve-lite . --offline              Scan using the local advisory database (no network)",
    "  cve-lite advisories sync          Sync the local advisory database"
  ];
  console.log(lines.join("\n"));
}

export function printOverridesHelp(): void {
  printBanner();

  const lines = [
    "cve-lite overrides [path] [flags]",
    "",
    "Audit package.json overrides for hygiene problems (OA001..OA008).",
    "",
    "Flags:",
    "  --json                  Emit findings as JSON",
    "  --fix                   Apply RFC 6902 patches for findings with auto-fix",
    "  --rule <id>             Only run a specific rule (OA001..OA008)",
    "  --check-network         Enable OA007 registry drift check (opt-in network)",
    "  --audit-log <path>      Stream NDJSON change-control to <path>",
    "  --fail-on <severity>    Exit non-zero at or above this severity (default: critical)",
    "  --debug                 Enable debug logging",
    "  -h, --help              Show this help"
  ];
  console.log(lines.join("\n"));
}
