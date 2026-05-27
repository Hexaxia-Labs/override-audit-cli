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
import { SEVERITY_RANK } from '../types.js';

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
  const attemptId = `rem_${randomUUID()}`;

  let result;
  try {
    result = await scan(path);
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

  if (args.json) {
    const out = renderJson(filteredResult, { attemptId, toolVersion: readToolVersion() });
    io.print(JSON.stringify(out, null, 2) + '\n');
  } else {
    io.print(renderHuman(filteredResult));
  }

  return filtered.length > 0 ? 1 : 0;
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
