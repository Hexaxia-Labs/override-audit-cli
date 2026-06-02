import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OverrideFinding, RFC6902Op } from "./types.js";
import type { AuditLogHandle } from "../audit-log/index.js";

export interface FixOptions {
  projectPath: string;
  findings: ReadonlyArray<OverrideFinding>;
  auditLog: AuditLogHandle;
  dryRun: boolean;
}

export interface AppliedPatch {
  ruleId: OverrideFinding["ruleId"];
  package: string;
  patches: RFC6902Op[];
}

export interface SkippedForFix {
  ruleId: OverrideFinding["ruleId"];
  package: string;
  reason: string;
}

export interface FixReport {
  appliedAt: string;
  dryRun: boolean;
  appliedPatches: AppliedPatch[];
  skipped: SkippedForFix[];
}

export function applyFix(opts: FixOptions): FixReport {
  const { projectPath, findings, auditLog, dryRun } = opts;
  const applied: AppliedPatch[] = [];
  const skipped: SkippedForFix[] = [];
  const pkgPath = join(projectPath, "package.json");
  const original = readFileSync(pkgPath, "utf8");
  let state = JSON.parse(original) as Record<string, unknown>;

  for (const finding of findings) {
    if (!finding.fix || finding.fix.type !== "rfc6902") {
      skipped.push({
        ruleId: finding.ruleId,
        package: finding.package.name,
        reason: "no fix patch attached",
      });
      continue;
    }
    try {
      for (const op of finding.fix.patch) {
        state = applyOp(state, op);
      }
      applied.push({
        ruleId: finding.ruleId,
        package: finding.package.name,
        patches: finding.fix.patch.slice(),
      });
      auditLog.emit({
        ts: new Date().toISOString(),
        type: "oa.fix.applied",
        schemaVersion: 1,
        ruleId: finding.ruleId,
        package: finding.package.name,
        patches: finding.fix.patch,
      });
    } catch (err) {
      skipped.push({
        ruleId: finding.ruleId,
        package: finding.package.name,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!dryRun && applied.length > 0) {
    const indent = detectIndent(original);
    writeFileSync(pkgPath, JSON.stringify(state, null, indent) + "\n");
  }

  return {
    appliedAt: new Date().toISOString(),
    dryRun,
    appliedPatches: applied,
    skipped,
  };
}

function detectIndent(raw: string): number {
  const m = raw.match(/^\{\n([ \t]+)/);
  if (!m) return 2;
  return m[1].length;
}

function applyOp(doc: Record<string, unknown>, op: RFC6902Op): Record<string, unknown> {
  switch (op.op) {
    case "remove":
      return mutate(doc, op.path, () => undefined);
    case "replace":
      return mutate(doc, op.path, () => op.value);
    case "add":
      return mutate(doc, op.path, () => op.value);
    case "move": {
      const value = read(doc, op.from);
      doc = mutate(doc, op.from, () => undefined);
      return mutate(doc, op.path, () => value);
    }
    case "copy": {
      const value = read(doc, op.from);
      return mutate(doc, op.path, () => value);
    }
    case "test": {
      const value = read(doc, op.path);
      if (JSON.stringify(value) !== JSON.stringify(op.value)) {
        throw new Error(`test failed at ${op.path}`);
      }
      return doc;
    }
  }
}

function read(doc: unknown, pointer: string): unknown {
  const parts = splitPointer(pointer);
  let cur: any = doc;
  for (const p of parts) cur = cur?.[p];
  return cur;
}

function mutate(
  doc: Record<string, unknown>,
  pointer: string,
  fn: (prev: unknown) => unknown
): Record<string, unknown> {
  const parts = splitPointer(pointer);
  if (parts.length === 0) {
    throw new Error("cannot mutate root pointer");
  }
  const root: any = Array.isArray(doc) ? [...doc] : { ...doc };
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (next === undefined || next === null) {
      cur[p] = {};
      cur = cur[p];
    } else if (Array.isArray(next)) {
      cur[p] = [...next];
      cur = cur[p];
    } else if (typeof next === "object") {
      cur[p] = { ...next };
      cur = cur[p];
    } else {
      throw new Error(
        `cannot descend into non-object at ${parts.slice(0, i + 1).join("/")}`
      );
    }
  }
  const last = parts[parts.length - 1];
  const newValue = fn(cur[last]);
  if (newValue === undefined) {
    delete cur[last];
  } else {
    cur[last] = newValue;
  }
  return root;
}

function splitPointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`bad RFC6902 pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}
