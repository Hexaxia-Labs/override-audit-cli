import semver from 'semver';
import type { Context, Finding, SubRuleId } from '../types.js';
import { jsonPointer } from '../fixer/json-pointer.js';
import { readInstalledManifest, type InstalledManifest } from '../parsers/node-modules.js';

const RULE_ID = 'OA005-NESTED-OVERRIDE' as const;

interface NestedCtxExtension {
  _testManifestLookup?: (name: string) => InstalledManifest | null;
}

/**
 * OA005-NESTED-OVERRIDE — nested-object override entries `{ parent: { inner: ver } }`.
 * Single detector, five sub-codes routed in priority order:
 *   .a-NON-NPM           (critical) — nested form in pnpm project (silently ignored)
 *   .b-ORPHANED-OUTER    (high)     — outer parent not in resolved tree
 *   .c-ORPHANED-INNER    (high)     — outer in tree, but inner not declared in parent's deps
 *   .d-LEAKY             (medium)   — inner installed elsewhere at version not satisfying pin
 *   .e-SUSPECT           (info)     — valid + effective, stylistic suggestion to flatten
 */
export function detect(ctx: Context): Finding[] {
  const lookup =
    (ctx as Context & NestedCtxExtension)._testManifestLookup
    ?? ((name: string) => readInstalledManifest(ctx.projectPath, name));

  const findings: Finding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== 'string') {
      // Each nested-object entry yields one finding per inner key.
      for (const [innerKey, innerValue] of Object.entries(entry.value as Record<string, unknown>)) {
        if (typeof innerValue !== 'string') continue;
        const finding = classify({
          ctx, outerKey: entry.key, innerKey, innerValue, entryPath: entry.path, lookup,
        });
        if (finding) findings.push(finding);
      }
    }
  }
  return findings;
}

interface ClassifyArgs {
  ctx: Context;
  outerKey: string;
  innerKey: string;
  innerValue: string;
  entryPath: string[];
  lookup: (name: string) => InstalledManifest | null;
}

function classify(args: ClassifyArgs): Finding | null {
  const { ctx, outerKey, innerKey, innerValue, entryPath, lookup } = args;

  const findingBase = (sub: SubRuleId, severity: Finding['severity'], title: string, detail: string, action: Finding['remediation']['action']): Finding => ({
    ruleId: RULE_ID,
    subRuleId: sub,
    severity,
    title,
    detail,
    package: outerKey,
    overridePath: entryPath,
    pinValue: { [innerKey]: innerValue },
    packageManager: ctx.packageManager,
    remediation: {
      action,
      patch: action === 'remove'
        ? { op: 'remove', path: jsonPointer(entryPath) }
        : null,
      runnableFixCommand: `override-audit --fix --rule OA005 --target ${outerKey}`,
      explanation: detail,
    },
    references: ['https://github.com/Hexaxia-Labs/override-audit-cli/blob/main/docs/rules/OA005.md'],
  });

  // .a — npm-only nested form in non-npm project: silently ignored entirely.
  if (ctx.packageManager !== 'npm') {
    return findingBase(
      'OA005.a-NON-NPM',
      'critical',
      'Nested override in non-npm project (silently ignored)',
      `${ctx.packageManager} does not honour the npm-specific nested-object override form. The pin "${outerKey}.${innerKey}" = "${innerValue}" has no effect.`,
      'remove',
    );
  }

  // .b — outer parent not in resolved tree.
  if (!ctx.lockfilePackageNames.has(outerKey)) {
    return findingBase(
      'OA005.b-ORPHANED-OUTER',
      'high',
      'Nested override outer parent not in resolved tree',
      `Outer parent ${outerKey} is not in the dependency tree. The nested override "${innerKey}" has no parent to apply to.`,
      'remove',
    );
  }

  // .c — outer in tree but inner is not declared in parent's manifest deps.
  const parentManifest = lookup(outerKey);
  const declaredAsDep =
    !!parentManifest && (
      (parentManifest.dependencies && innerKey in parentManifest.dependencies) ||
      (parentManifest.optionalDependencies && innerKey in parentManifest.optionalDependencies) ||
      (parentManifest.peerDependencies && innerKey in parentManifest.peerDependencies)
    );
  if (parentManifest && !declaredAsDep) {
    return findingBase(
      'OA005.c-ORPHANED-INNER',
      'high',
      'Nested override inner dep not declared by parent',
      `${outerKey} does not declare ${innerKey} as a dependency. The override has no install path to apply to.`,
      'remove',
    );
  }

  // .d — leaky: same inner installed elsewhere at non-satisfying version.
  const installedInner = ctx.installedVersions.get(innerKey);
  if (installedInner && semver.validRange(innerValue) !== null) {
    if (!semver.satisfies(installedInner, innerValue)) {
      return findingBase(
        'OA005.d-LEAKY',
        'medium',
        'Nested override leaks: same dep installed elsewhere at non-conforming version',
        `Override forces ${innerKey} to ${innerValue} only when installed via ${outerKey}. Another tree path installed ${installedInner}, which does not satisfy the pin.`,
        'suggest',
      );
    }
  }

  // .e — suspect: valid and effective, but flat form would be more durable.
  return findingBase(
    'OA005.e-SUSPECT',
    'info',
    'Nested override could be flattened to top-level',
    `Nested override ${outerKey}.${innerKey} is valid and effective. A flat top-level "overrides": { "${innerKey}": "${innerValue}" } would apply across the whole tree.`,
    'suggest',
  );
}
