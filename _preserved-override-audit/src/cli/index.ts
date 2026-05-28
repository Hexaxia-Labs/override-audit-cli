#!/usr/bin/env node
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseArgs, UsageError } from './args.js';
import { HELP_TEXT } from './help.js';
import { scan } from '../scanner.js';
import { renderJson } from '../output/json.js';
import { renderHuman } from '../output/human.js';
import { fix } from '../fixer/fix.js';
import { SEVERITY_RANK } from '../types.js';
import { FileLogger, NullLogger, type ChangeControlLogger } from '../logging/change-control.js';

export interface RunIO {
  print: (s: string) => void;
  eprint: (s: string) => void;
}

const DEFAULT_IO: RunIO = {
  print: (s) => process.stdout.write(s),
  eprint: (s) => process.stderr.write(s),
};

function readToolVersion(): string {
  // dist/cli/index.js → ../../package.json (resolves at runtime)
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [join(here, '..', '..', 'package.json'), join(here, '..', 'package.json')];
    for (const p of candidates) {
      try { return (JSON.parse(readFileSync(p, 'utf-8')) as { version: string }).version; } catch { /* try next */ }
    }
  } catch { /* fall through */ }
  return '0.0.0-unknown';
}

export async function run(argv: string[], io: RunIO = DEFAULT_IO): Promise<number> {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      io.eprint(`error: ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  if (args.help) { io.print(HELP_TEXT + '\n'); return 0; }
  if (args.version) { io.print(readToolVersion() + '\n'); return 0; }

  const path = args.path ?? process.cwd();
  const attemptId = args.attemptId ?? `rem_${randomUUID()}`;
  const logger: ChangeControlLogger = args.logFile
    ? new FileLogger(args.logFile, args.logLevel ?? 'info')
    : new NullLogger();

  let result;
  try {
    result = await scan(path, {
      withRegistry: args.withRegistry,
      ...(args.registryTimeoutMs ? { registry: { timeoutMs: args.registryTimeoutMs } } : {}),
    });
  } catch (err) {
    io.eprint(`error: ${(err as Error).message}\n`);
    return 2;
  }

  // Filter findings by severity floor and by rule filters.
  const floor = SEVERITY_RANK[args.severity];
  const filtered = result.findings.filter(f => {
    if (SEVERITY_RANK[f.severity] < floor) return false;
    if (f.subRuleId && args.ruleFilters.get(f.subRuleId.split('-')[0]!) === false) return false;
    if (args.ruleFilters.get(f.ruleId.split('-')[0]!) === false) return false;
    if (f.subRuleId === 'OA005.e-SUSPECT' && !args.includeSubSuspect) return false;
    return true;
  });
  const filteredResult = { ...result, findings: filtered };

  // --fix branch: apply patches, optionally rescan, render output with FixReport.
  if (args.fix) {
    const report = await fix(
      filteredResult,
      {
        dryRun: args.dryRun,
        rescan: !args.noPostFixRescan,
        severityFloor: args.severity,
        ruleFilters: args.ruleFilters,
        includeSubSuspect: args.includeSubSuspect,
      },
      attemptId,
      logger,
      {
        toolVersion: readToolVersion(),
        source: args.source,
        advisory: args.advisory,
        meta: args.meta,
      },
    );
    logger.close();

    if (args.json) {
      const out = renderJson(filteredResult, { attemptId, toolVersion: readToolVersion() });
      out.fix = report;
      io.print(JSON.stringify(out, null, 2) + '\n');
    } else {
      io.print(renderHuman(filteredResult));
      io.print(renderFixSummary(report));
    }

    // Exit code:
    //   0 — clean post-fix (rescan happened and produced no findings, or dry-run with patches available)
    //   1 — findings remain after fix (rescan saw remaining or fix introduced new findings)
    //   0 — no findings at all (nothing to do)
    if (args.dryRun) return report.appliedPatches.length > 0 ? 0 : (filtered.length > 0 ? 1 : 0);
    if (report.remainingFindings === null) {
      // No rescan — base exit on whether patches were applied AND no findings remain skipped
      return report.skippedFindings.length === 0 ? 0 : 1;
    }
    const remainingAboveFloor = report.remainingFindings.filter(
      f => SEVERITY_RANK[f.severity] >= SEVERITY_RANK[args.severity],
    );
    return (remainingAboveFloor.length > 0 || report.newFindings.length > 0) ? 1 : 0;
  }

  if (args.json) {
    const out = renderJson(filteredResult, { attemptId, toolVersion: readToolVersion() });
    io.print(JSON.stringify(out, null, 2) + '\n');
  } else {
    io.print(renderHuman(filteredResult));
  }
  logger.close();

  return filtered.length > 0 ? 1 : 0;
}

function renderFixSummary(report: { dryRun: boolean; appliedPatches: { ruleId: string; package: string }[]; skippedFindings: { ruleId: string; package: string; reason: string }[]; remainingFindings: unknown[] | null; newFindings: unknown[] }): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`${report.dryRun ? 'DRY RUN' : 'FIX'} — ${report.appliedPatches.length} patch${report.appliedPatches.length === 1 ? '' : 'es'} applied${report.dryRun ? ' (no file written)' : ''}`);
  for (const p of report.appliedPatches) {
    lines.push(`  ✓ ${p.ruleId.split('-')[0]}  ${p.package}`);
  }
  if (report.skippedFindings.length > 0) {
    lines.push(`  ${report.skippedFindings.length} skipped (need human review):`);
    for (const s of report.skippedFindings) {
      lines.push(`    · ${s.ruleId.split('-')[0]}  ${s.package}  (${s.reason})`);
    }
  }
  if (report.remainingFindings !== null) {
    if (report.remainingFindings.length === 0) {
      lines.push('  ✓ Post-fix rescan: clean');
    } else {
      lines.push(`  ⚠ Post-fix rescan: ${report.remainingFindings.length} finding(s) remain`);
    }
  }
  if (report.newFindings.length > 0) {
    lines.push(`  ⚠ Fix introduced ${report.newFindings.length} new finding(s) — investigate`);
  }
  return lines.join('\n') + '\n';
}

// Direct execution (not under jest).
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`fatal: ${(err as Error).stack ?? err}\n`);
      process.exit(2);
    });
}
