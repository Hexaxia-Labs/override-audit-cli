/**
 * Plan 6.5 (#14 + #15): pnpm `parent>child` selective override partition.
 *
 *   - Parsing splits `parent>child` keys into parentScope + child target.
 *   - OA001 does NOT fire on parent>child keys (no orphan false positive).
 *   - OA005 owns them: fires .b when the parent is not in the resolved tree,
 *     and stays silent on a valid-or-unevaluable selective override.
 */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractOverrideEntries } from "../../src/overrides/parsing/package-json.js";
import { buildOverrideContext } from "../../src/overrides/context-builder.js";
import { detect as detectOA001 } from "../../src/overrides/detectors/oa001-orphaned-target.js";
import { detect as detectOA005 } from "../../src/overrides/detectors/oa005-nested-ineffective.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";

const noop = () =>
  ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) as any;

describe("parsing: parent>child override keys", () => {
  it("splits a flat-string parent>child key into child target + parentScope", () => {
    const entries = extractOverrideEntries({
      pnpm: { overrides: { "juice>cheerio": "0.22.0" } },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].packageName).toBe("cheerio");
    expect(entries[0].parentScope).toBe("juice");
    expect(entries[0].key).toBe("juice>cheerio");
  });

  it("handles a scoped child", () => {
    const entries = extractOverrideEntries({
      pnpm: { overrides: { "eslint-plugin-ghost>@typescript-eslint/utils": "8.49.0" } },
    });
    expect(entries[0].packageName).toBe("@typescript-eslint/utils");
    expect(entries[0].parentScope).toBe("eslint-plugin-ghost");
  });

  it("leaves a plain @spec key (no >) unchanged - no parentScope", () => {
    const entries = extractOverrideEntries({
      pnpm: { overrides: { "@babel/runtime@<7.26.10": "^7.26.10" } },
    });
    expect(entries[0].packageName).toBe("@babel/runtime");
    expect(entries[0].parentScope).toBeUndefined();
  });
});

describe("OA001 skips parent>child keys", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "pc-oa001-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("does not false-positive on a pnpm parent>child override", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      pnpm: { overrides: { "juice>cheerio": "0.22.0" } },
    }));
    writeFileSync(join(dir, "pnpm-lock.yaml"), [
      "lockfileVersion: '9.0'",
      "snapshots:",
      "  juice@9.1.0: {}",
      "  cheerio@0.22.0: {}",
    ].join("\n"));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false,
    });
    const findings = detectOA001(ctx);
    expect(findings.filter((f) => f.ruleId === "OA001")).toHaveLength(0);
  });
});

describe("OA005 owns parent>child keys", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "pc-oa005-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("fires OA005.b when the parent is not in the resolved tree", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      pnpm: { overrides: { "ghost-parent>cheerio": "0.22.0" } },
    }));
    // Lockfile has cheerio but NOT ghost-parent: the selective override is broken.
    writeFileSync(join(dir, "pnpm-lock.yaml"), [
      "lockfileVersion: '9.0'",
      "snapshots:",
      "  cheerio@0.22.0: {}",
      "  lodash@4.17.21: {}",
    ].join("\n"));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false,
    });
    const findings = detectOA005(ctx);
    const oa005 = findings.filter((f) => f.ruleId === "OA005");
    expect(oa005).toHaveLength(1);
    expect(oa005[0].subRuleId).toBe("OA005.b");
  });

  it("stays silent on a valid-or-unevaluable selective override (parent in tree, no node_modules)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      pnpm: { overrides: { "juice>cheerio": "0.22.0" } },
    }));
    // Parent IS in the lockfile; no node_modules so .c/.d cannot evaluate.
    writeFileSync(join(dir, "pnpm-lock.yaml"), [
      "lockfileVersion: '9.0'",
      "snapshots:",
      "  juice@9.1.0: {}",
      "  cheerio@0.22.0: {}",
    ].join("\n"));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false,
    });
    const findings = detectOA005(ctx);
    // No noise: a hygiene auditor flags proven problems, not maybes.
    expect(findings.filter((f) => f.ruleId === "OA005")).toHaveLength(0);
  });
});
