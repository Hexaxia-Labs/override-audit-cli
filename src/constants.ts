import type { SeverityLabel } from "./types.js";

export const severityOrder: Record<SeverityLabel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  unknown: 1
};

export const DEFAULT_BATCH_SIZE = 100;
export const DEFAULT_SEARCH_DEPTH = 4;

export const NPM_PUBLIC_REGISTRY = "https://registry.npmjs.org/";

export const MAL_PRIVATE_REGISTRY_MESSAGE =
  "This package has a MAL- advisory but resolved from a private registry - unverifiable whether this advisory applies to your artifact. Inspect the source manually.";

export const MAL_PRIVATE_REGISTRY_COMPACT_MESSAGE =
  "MAL- advisory could not be confirmed for this artifact.";

export const MAL_PRIVATE_REGISTRY_LEGEND_MESSAGE =
  "verify artifact source manually";

export const MAL_GIT_SOURCE_PINNED_MESSAGE =
  "Advisory targets registry packages. This package resolves from a git source pinned to a commit SHA — verify the repository and org are trusted.";

export const MAL_GIT_SOURCE_FLOATING_MESSAGE =
  "Advisory targets registry packages. This package resolves from a git source with a floating reference — verify the repository, org, and ref are safe.";

export const MAL_GIT_SOURCE_COMPACT_MESSAGE =
  "Git source — verify repository and org are trusted.";

export const MAL_GIT_SOURCE_LEGEND_MESSAGE =
  "verify repository and org are trusted";

export const MAL_GIT_SOURCE_PINNED_DISPLAY = "⚠ Git source (SHA-pinned)";
export const MAL_GIT_SOURCE_FLOATING_DISPLAY = "⚠ Git source (floating ref)";

export const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".angular",
  ".nx"
]);
