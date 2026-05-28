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
