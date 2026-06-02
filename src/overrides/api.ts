import type { OverrideContext } from "./context.js";
import type { OverrideFinding } from "./types.js";
import { ALL_DETECTORS, VERIFY_DETECTORS } from "./detectors/index.js";
import { applyComposite } from "./composite.js";
import { fetchDistTagsBatch, type RegistryClientOptions } from "./parsing/registry.js";

export interface AuditOptions {
  /** When true, fetch registry dist-tags so OA007 can run. */
  checkNetwork: boolean;
  /** Registry client options. Only used when checkNetwork=true. */
  registry?: RegistryClientOptions;
}

export interface AuditResult {
  findings: OverrideFinding[];
}

export interface VerifyTarget {
  name: string;
  version?: string;
}

export interface VerifyResult {
  ok: boolean;
  findings: OverrideFinding[];
}

/**
 * Full audit: run all 8 detectors over the project, apply composite passes,
 * emit oa.detected per finding.
 */
export async function audit(ctx: OverrideContext, opts: AuditOptions): Promise<AuditResult> {
  // OA007 network fetch - only when opted in.
  if (opts.checkNetwork) {
    const stringOverrideNames = ctx.overrideEntries
      .filter((e) => typeof e.value === "string")
      .map((e) => e.packageName);
    if (stringOverrideNames.length > 0) {
      try {
        const fetched = await fetchDistTagsBatch(stringOverrideNames, opts.registry ?? {});
        for (const [name, tags] of fetched) {
          ctx.registryDistTags.set(name, tags);
        }
      } catch (err) {
        ctx.skippedDetectors.push({
          ruleId: "OA007",
          reason: `registry calls failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  const raw: OverrideFinding[] = [];
  for (const { detect } of ALL_DETECTORS) {
    raw.push(...detect(ctx));
  }
  const findings = applyComposite(raw);

  for (const f of findings) {
    ctx.auditLog.emit({
      ts: new Date().toISOString(),
      type: "oa.detected",
      schemaVersion: 1,
      ruleId: f.ruleId,
      severity: f.severity,
      package: f.package.name,
      message: f.message,
      location: { file: f.location.file, jsonPath: f.location.jsonPath },
    });
  }

  return { findings };
}

/**
 * Post-fix verification: run OA001 and OA008 only, scoped to the just-touched
 * packages. Cheaper than audit() because it skips the other detectors.
 */
export async function verify(
  targets: ReadonlyArray<VerifyTarget>,
  ctx: OverrideContext
): Promise<VerifyResult> {
  const targetNames = new Set(targets.map((t) => t.name));

  const raw: OverrideFinding[] = [];
  for (const { detect } of VERIFY_DETECTORS) {
    raw.push(...detect(ctx));
  }
  const scoped = raw.filter((f) => targetNames.has(f.package.name));

  if (scoped.length === 0) {
    ctx.auditLog.emit({
      ts: new Date().toISOString(),
      type: "verify.passed",
      schemaVersion: 1,
      targets: targets.map((t) => ({ name: t.name, version: t.version })),
    });
    return { ok: true, findings: [] };
  }

  ctx.auditLog.emit({
    ts: new Date().toISOString(),
    type: "verify.failed",
    schemaVersion: 1,
    failures: scoped.map((f) => ({
      ruleId: f.ruleId,
      package: f.package.name,
      reason: f.message,
    })),
  });
  return { ok: false, findings: scoped };
}
