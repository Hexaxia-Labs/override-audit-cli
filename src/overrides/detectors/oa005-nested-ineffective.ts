import type { OverrideContext } from "../context.js";
import type { OverrideFinding } from "../types.js";
import { jsonPointer } from "../parsing/json-pointer.js";
import { readInstalledManifest, type InstalledManifest } from "../parsing/node-modules.js";
import { satisfiesRange, isValidRange } from "../../utils/version.js";

const RULE_ID = "OA005" as const;

interface NestedCtxExtension {
  _testManifestLookup?: (name: string) => InstalledManifest | null;
}

/**
 * OA005-NESTED-INEFFECTIVE - nested-object override entries `{ parent: { inner: ver } }`.
 * Single detector, five sub-codes routed in priority order:
 *   .a         (critical) - nested form in pnpm project (silently ignored)
 *   .b         (high)     - outer parent not in resolved tree
 *   .c         (high)     - outer in tree, but inner not declared in parent's deps
 *   .d         (medium)   - inner installed elsewhere at version not satisfying pin
 *   .e         (info)     - valid + effective, stylistic suggestion to flatten
 */
export function detect(ctx: OverrideContext): OverrideFinding[] {
  const lookup =
    (ctx as OverrideContext & NestedCtxExtension)._testManifestLookup
    ?? ((name: string) => readInstalledManifest(ctx.projectPath, name));

  const findings: OverrideFinding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== "string") {
      // Each nested-object entry yields one finding per inner key.
      for (const [innerKey, innerValue] of Object.entries(entry.value as Record<string, unknown>)) {
        if (typeof innerValue !== "string") continue;
        const finding = classify({
          ctx,
          outerKey: entry.key,
          innerKey,
          innerValue,
          entryPath: entry.path,
          lookup,
        });
        if (finding) findings.push(finding);
      }
    }
  }
  return findings;
}

interface ClassifyArgs {
  ctx: OverrideContext;
  outerKey: string;
  innerKey: string;
  innerValue: string;
  entryPath: string[];
  lookup: (name: string) => InstalledManifest | null;
}

function classify(args: ClassifyArgs): OverrideFinding | null {
  const { ctx, outerKey, innerKey, innerValue, entryPath, lookup } = args;

  const findingBase = (
    subId: import("../types.js").OverrideSubRuleId,
    severity: OverrideFinding["severity"],
    message: string,
    details: string,
    action: "remove" | "suggest",
  ): OverrideFinding => ({
    ruleId: RULE_ID,
    subRuleId: subId,
    severity,
    package: { name: outerKey },
    location: { file: "package.json", jsonPath: jsonPointer(entryPath) },
    message,
    details,
    fix: {
      type: "rfc6902",
      patch:
        action === "remove"
          ? [{ op: "remove", path: jsonPointer(entryPath) }]
          : [],
      runnableCommand: `cve-lite overrides --fix --rule OA005 --target ${shellQuote(outerKey)}`,
    },
    references: [
      "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA005.md",
    ],
  });

  // .a - npm-only nested form in non-npm project: silently ignored entirely.
  if (ctx.packageManager !== "npm") {
    return findingBase(
      "OA005.a",
      "critical",
      "Nested override in non-npm project (silently ignored)",
      `${ctx.packageManager} does not honour the npm-specific nested-object override form. The pin "${outerKey}.${innerKey}" = "${innerValue}" has no effect.`,
      "remove",
    );
  }

  // .b - outer parent not in resolved tree.
  if (!ctx.lockfilePackageNames.has(outerKey)) {
    return findingBase(
      "OA005.b",
      "high",
      "Nested override outer parent not in resolved tree",
      `Outer parent ${outerKey} is not in the dependency tree. The nested override "${innerKey}" has no parent to apply to.`,
      "remove",
    );
  }

  // .c - outer in tree but inner is not declared in parent's manifest deps.
  const parentManifest = lookup(outerKey);
  const declaredAsDep =
    !!parentManifest &&
    (
      (parentManifest.dependencies && innerKey in parentManifest.dependencies) ||
      (parentManifest.optionalDependencies && innerKey in parentManifest.optionalDependencies) ||
      (parentManifest.peerDependencies && innerKey in parentManifest.peerDependencies)
    );
  if (parentManifest && !declaredAsDep) {
    return findingBase(
      "OA005.c",
      "high",
      "Nested override inner dep not declared by parent",
      `${outerKey} does not declare ${innerKey} as a dependency. The override has no install path to apply to.`,
      "remove",
    );
  }

  // .d - leaky: same inner installed elsewhere at non-satisfying version.
  const installedInner = ctx.installedVersions.get(innerKey);
  if (installedInner && isValidRange(innerValue)) {
    if (!satisfiesRange(installedInner, innerValue)) {
      return findingBase(
        "OA005.d",
        "medium",
        "Nested override leaks: same dep installed elsewhere at non-conforming version",
        `Override forces ${innerKey} to ${innerValue} only when installed via ${outerKey}. Another tree path installed ${installedInner}, which does not satisfy the pin.`,
        "suggest",
      );
    }
  }

  // .e - suspect: valid and effective, but flat form would be more durable.
  return findingBase(
    "OA005.e",
    "low",
    "Nested override could be flattened to top-level",
    `Nested override ${outerKey}.${innerKey} is valid and effective. A flat top-level "overrides": { "${innerKey}": "${innerValue}" } would apply across the whole tree.`,
    "suggest",
  );
}

function shellQuote(s: string): string {
  return /[^A-Za-z0-9_@./:-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
}
