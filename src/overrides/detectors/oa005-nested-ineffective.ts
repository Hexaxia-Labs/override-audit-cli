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
 * OA005-NESTED-INEFFECTIVE - nested overrides in two shapes:
 *   - npm object form    `{ parent: { inner: ver } }`
 *   - pnpm flat-string   `"parent>inner": ver`
 * Single detector, five sub-codes routed in priority order:
 *   .a         (critical) - nested form ineffective for this pm (silently ignored)
 *   .b         (high)     - outer parent not in resolved tree
 *   .c         (high)     - outer in tree, but inner not declared in parent's deps
 *   .d         (medium)   - inner installed elsewhere at version not satisfying pin
 *   .e         (info)     - valid + effective, stylistic suggestion to flatten
 *
 * The `.a` ineffectiveness test depends on the shape:
 *   - object form is npm-specific, so it is ineffective in any non-npm project.
 *   - flat-string `parent>child` is pnpm-specific, so it is ineffective in any
 *     non-pnpm project (npm/yarn/bun do not honour `>` selective syntax).
 */
export function detect(ctx: OverrideContext): OverrideFinding[] {
  const lookup =
    (ctx as OverrideContext & NestedCtxExtension)._testManifestLookup
    ?? ((name: string) => readInstalledManifest(ctx.projectPath, name));

  const findings: OverrideFinding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== "string") {
      // npm object form: each nested-object entry yields one finding per inner key.
      for (const [innerKey, innerValue] of Object.entries(entry.value as Record<string, unknown>)) {
        if (typeof innerValue !== "string") continue;
        const finding = classify({
          ctx,
          outerKey: entry.key,
          innerKey,
          innerValue,
          entryPath: entry.path,
          lookup,
          form: "object",
        });
        if (finding) findings.push(finding);
      }
    } else if (entry.parentScope !== undefined) {
      // pnpm flat-string form: `"parent>child": ver`. The parser put the child
      // in packageName and the parent in parentScope.
      const finding = classify({
        ctx,
        outerKey: entry.parentScope,
        innerKey: entry.packageName,
        innerValue: entry.value,
        entryPath: entry.path,
        lookup,
        form: "flat-pnpm",
      });
      if (finding) findings.push(finding);
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
  /** "object" = npm `{parent:{child}}`; "flat-pnpm" = pnpm `"parent>child"`. */
  form: "object" | "flat-pnpm";
}

function classify(args: ClassifyArgs): OverrideFinding | null {
  const { ctx, outerKey, innerKey, innerValue, entryPath, lookup, form } = args;

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
    ...(action === "remove"
      ? {
          fix: {
            type: "rfc6902" as const,
            patch: [{ op: "remove", path: jsonPointer(entryPath) }],
            runnableCommand: `cve-lite overrides --fix --rule OA005`,
          },
        }
      : {}),
    references: [
      "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA005.md",
    ],
  });

  // .a - nested form ineffective for this package manager: silently ignored.
  //   object form  -> npm-specific, ineffective in any non-npm project.
  //   flat-pnpm    -> pnpm-specific `parent>child`, ineffective in any non-pnpm
  //                   project (npm/yarn/bun do not honour `>` selective syntax).
  const ineffectiveForm =
    form === "object" ? ctx.packageManager !== "npm" : ctx.packageManager !== "pnpm";
  if (ineffectiveForm) {
    const formDesc =
      form === "object"
        ? `${ctx.packageManager} does not honour the npm-specific nested-object override form. The pin "${outerKey}.${innerKey}" = "${innerValue}" has no effect.`
        : `${ctx.packageManager} does not honour the pnpm-specific "parent>child" selective override form. The pin "${outerKey}>${innerKey}" = "${innerValue}" has no effect.`;
    return findingBase(
      "OA005.a",
      "critical",
      "Nested override ineffective for this package manager (silently ignored)",
      formDesc,
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

  // .e - npm object form only: valid and effective, flat form would be more durable.
  //
  // For pnpm flat-string selective overrides we deliberately emit NO finding here.
  // Scoping `parent>child` to one parent is the feature, not a smell, so "could be
  // flattened" is both noise and bad advice (flattening changes scoped to global).
  // We only speak when a selective override is PROVEN broken: .b (parent not in the
  // resolved tree) and .c (parent does not declare the child, requires node_modules).
  // When node_modules is absent we cannot run .c/.d, so an unbroken-looking selective
  // override is presumed fine - a hygiene auditor flags proven problems, not maybes.
  if (form === "flat-pnpm") return null;

  return findingBase(
    "OA005.e",
    "low",
    "Nested override could be flattened to top-level",
    `Nested override ${outerKey}.${innerKey} is valid and effective. A flat top-level "overrides": { "${innerKey}": "${innerValue}" } would apply across the whole tree.`,
    "suggest",
  );
}
