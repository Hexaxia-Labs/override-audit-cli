#!/usr/bin/env node
/**
 * Test hygiene gate. Runs before `npm test` (as a pretest hook) and in CI.
 *
 * Catches two classes of footgun that pass locally but break a clean checkout
 * or silently weaken the suite:
 *
 *   1. Mocha-isms in a Jest suite. `this.skip()`, `this.timeout()`,
 *      `this.retries()`, `this.slow()` are Mocha APIs. Under Jest, `this` is
 *      undefined inside an arrow-function test, so the call throws at runtime.
 *      It only fires when the branch runs, so a dogfood-fixture skip guard can
 *      pass on a dev machine (fixtures present) and explode on CI (absent).
 *      See issue #30.
 *
 *   2. Focused tests committed to the tree. `describe.only`, `it.only`,
 *      `test.only`, `fdescribe`, `fit` silently drop every other test in the
 *      file. A committed `.only` reads as green while covering almost nothing.
 *
 * Pure Node, no dependencies. Walks tests/ for *.test.ts and greps each line.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(repoRoot, "tests");

const RULES = [
  {
    id: "mocha-this",
    pattern: /\bthis\.(skip|timeout|retries|slow)\s*\(/,
    message:
      "Mocha-style this.* call in a Jest suite (this is undefined in Jest arrow-function tests). Use console.log(...) + return to skip, or it.skip / it.todo.",
  },
  {
    id: "focused-test",
    pattern: /\b(describe|it|test)\.only\s*\(|\bf(describe|it)\s*\(/,
    message:
      "Focused test committed to the tree. Remove .only / fdescribe / fit so the whole suite runs.",
  },
];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const file of walk(testsDir)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        violations.push({
          file: file.slice(repoRoot.length + 1),
          line: i + 1,
          rule: rule.id,
          message: rule.message,
          text: line.trim(),
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error("Test hygiene check failed:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
    console.error(`    ${v.text}`);
    console.error(`    ${v.message}\n`);
  }
  console.error(`${violations.length} violation(s) found.`);
  process.exit(1);
}

console.log("Test hygiene check passed (no Mocha-isms, no focused tests).");
