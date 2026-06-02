import type { OverrideContext } from "../context.js";
import type { OverrideFinding, OverrideRuleId } from "../types.js";

import { detect as detectOA001 } from "./oa001-orphaned-target.js";
import { detect as detectOA002 } from "./oa002-floating-tag.js";
import { detect as detectOA003 } from "./oa003-wrong-section.js";
import { detect as detectOA004 } from "./oa004-surpassed-pin.js";
import { detect as detectOA005 } from "./oa005-nested-ineffective.js";
import { detect as detectOA006 } from "./oa006-coupled-platform-binary.js";
import { detect as detectOA007 } from "./oa007-frozen-latest.js";
import { detect as detectOA008 } from "./oa008-materialized.js";

export type DetectorFn = (ctx: OverrideContext) => OverrideFinding[];

export const ALL_DETECTORS: ReadonlyArray<{
  ruleId: OverrideRuleId;
  detect: DetectorFn;
}> = [
  { ruleId: "OA001", detect: detectOA001 },
  { ruleId: "OA002", detect: detectOA002 },
  { ruleId: "OA003", detect: detectOA003 },
  { ruleId: "OA004", detect: detectOA004 },
  { ruleId: "OA005", detect: detectOA005 },
  { ruleId: "OA006", detect: detectOA006 },
  { ruleId: "OA007", detect: detectOA007 },
  { ruleId: "OA008", detect: detectOA008 },
];

/** Verify subset - just OA001 and OA008 - for the post-fix verify path. */
export const VERIFY_DETECTORS: ReadonlyArray<{
  ruleId: OverrideRuleId;
  detect: DetectorFn;
}> = [
  { ruleId: "OA001", detect: detectOA001 },
  { ruleId: "OA008", detect: detectOA008 },
];
