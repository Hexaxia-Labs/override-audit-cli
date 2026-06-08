import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OverrideFinding, OverrideFixOp } from "./types.js";
import type { AuditLogHandle } from "../audit-log/index.js";
import { jsonPointer } from "./parsing/json-pointer.js";

export interface FixOptions {
  projectPath: string;
  findings: ReadonlyArray<OverrideFinding>;
  auditLog: AuditLogHandle;
  dryRun: boolean;
}

export interface AppliedPatch {
  ruleId: OverrideFinding["ruleId"];
  package: string;
  patches: OverrideFixOp[];
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
    const before = overrideKeySet(state);
    let next = state;
    try {
      for (const op of finding.fix.patch) {
        next = applyOp(next, op);
      }
    } catch (err) {
      skipped.push({
        ruleId: finding.ruleId,
        package: finding.package.name,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Chokepoint guard: override hygiene must never invent a new override key.
    // The only sanctioned way to introduce a key is relocate, which writes a
    // dependency floor, not an override. Reject and log anything that grows the
    // override key set, and commit nothing for that finding.
    const created = [...overrideKeySet(next)].filter((k) => !before.has(k));
    if (created.length > 0) {
      auditLog.emit({
        ts: new Date().toISOString(),
        type: "error",
        schemaVersion: 1,
        phase: "fix-guard",
        message:
          `rejected fix for ${finding.ruleId} on ${finding.package.name}: ` +
          `would create override key(s) ${created.join(", ")}`,
      });
      skipped.push({
        ruleId: finding.ruleId,
        package: finding.package.name,
        reason: `fix-guard: would create override key(s) ${created.join(", ")}`,
      });
      continue;
    }

    state = next;
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
      patches: finding.fix.patch.map(loggableOp),
    });
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

function applyOp(doc: Record<string, unknown>, op: OverrideFixOp): Record<string, unknown> {
  switch (op.op) {
    case "remove":
      return mutate(doc, op.path, () => undefined);
    case "replace":
      return mutate(doc, op.path, () => op.value);
    case "move": {
      const value = read(doc, op.from);
      doc = mutate(doc, op.from, () => undefined);
      return mutate(doc, op.path, () => value);
    }
    case "relocate": {
      // Retire the child override and carry its constraint as a parent dependency
      // floor. This introduces a key under /dependencies (an upgrade), never a new
      // override - the chokepoint guard in applyFix enforces that invariant.
      doc = mutate(doc, op.fromChild, () => undefined);
      return mutate(doc, jsonPointer(["dependencies", op.toParent]), () => op.floor);
    }
  }
}

/**
 * Collect the set of keys under every override container. The chokepoint guard
 * compares this before/after a fix: override hygiene may remove or repin existing
 * overrides, but it must never invent a new one. relocate writes a dependency, not
 * an override, so it does not grow this set.
 */
function overrideKeySet(doc: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  const collect = (obj: unknown, prefix: string) => {
    if (obj && typeof obj === "object") {
      for (const k of Object.keys(obj as Record<string, unknown>)) out.add(prefix + k);
    }
  };
  collect(doc.overrides, "overrides/");
  const pnpm = doc.pnpm as { overrides?: unknown } | undefined;
  collect(pnpm?.overrides, "pnpm.overrides/");
  collect(doc.resolutions, "resolutions/");
  return out;
}

/** Loggable representation of a fix op (relocate has no single `path`). */
function loggableOp(op: OverrideFixOp): { op: string; path: string; value?: unknown; from?: string } {
  if (op.op === "relocate") {
    return { op: "relocate", path: op.fromChild, from: op.toParent, value: op.floor };
  }
  if (op.op === "move") return { op: "move", path: op.path, from: op.from };
  if (op.op === "remove") return { op: "remove", path: op.path };
  return { op: "replace", path: op.path, value: op.value };
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
