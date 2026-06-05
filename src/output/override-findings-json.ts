import type { OverrideFinding } from "../overrides/types.js";

export interface OverrideFindingsJson {
  overrideFindings: OverrideFinding[];
}

export function overrideFindingsToJson(
  findings: ReadonlyArray<OverrideFinding>
): OverrideFindingsJson {
  return { overrideFindings: [...findings] };
}
