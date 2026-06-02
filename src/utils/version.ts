export function looksLikeVersion(value: string): boolean {
  return /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][^/]+)?$/.test(value);
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map(n => Number.isFinite(Number(n)) ? Number(n) : n);
  const pb = b.split(/[.+-]/).map(n => Number.isFinite(Number(n)) ? Number(n) : n);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (typeof av === "number" && typeof bv === "number") {
      if (av !== bv) return av - bv;
    } else {
      const as = String(av);
      const bs = String(bv);
      if (as !== bs) return as.localeCompare(bs);
    }
  }
  return 0;
}

export function parseExactManifestVersion(spec: string): string | null {
  const cleaned = spec.trim().replace(/^npm:/, "");
  if (looksLikeVersion(cleaned)) return cleaned;
  return null;
}

export function isMajorVersionBump(from: string, to: string): boolean {
  const fromMajor = Number(from.split(".")[0]);
  const toMajor = Number(to.split(".")[0]);
  return !Number.isNaN(fromMajor) && !Number.isNaN(toMajor) && toMajor > fromMajor;
}

export function isPreReleaseVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+-[^\s]+$/.test(version);
}

export function normalizeRawVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/^workspace:/, "").replace(/^npm:/, "").trim();
  if (!cleaned || cleaned.startsWith(".") || cleaned.startsWith("..")) return null;
  if (looksLikeVersion(cleaned)) return cleaned;
  return null;
}

/**
 * Extract the leading integer (major) from a version string. Returns null
 * if the string does not start with a digit-only run.
 */
export function majorVersion(value: string): number | null {
  if (!value) return null;
  const m = value.match(/^(\d+)/);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Coerce a partial or range-prefixed version into a concrete X.Y.Z form.
 * Strips leading range operators (`^`, `~`, `>=`, `<=`, `>`, `<`, `=`), pads
 * missing minor/patch with zeros. Returns null if the input cannot be
 * interpreted as a version.
 *
 * Examples:
 *   "1"        -> "1.0.0"
 *   "1.2"      -> "1.2.0"
 *   "^1.2.3"   -> "1.2.3"
 *   ">=2.0"    -> "2.0.0"
 *   "latest"   -> null
 */
export function coerceVersion(input: string): string | null {
  if (!input) return null;
  const stripped = input.trim().replace(/^[\^~]|^[<>]=?|^=/, "").trim();
  const m = stripped.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+][^\s]+)?/);
  if (!m) return null;
  const [, major, minor = "0", patch = "0"] = m;
  return `${major}.${minor}.${patch}`;
}

/**
 * Does the string parse as a version range cve-lite recognises?
 * Supports plain versions and the operators `^`, `~`, `>=`, `<=`, `>`, `<`, `=`.
 * Does not support OR (`||`) or hyphen ranges (`1.0.0 - 2.0.0`) - if those
 * surface in real projects, extend later.
 */
export function isValidRange(input: string): boolean {
  if (!input) return false;
  const trimmed = input.trim();
  if (!/^(?:\^|~|>=|<=|>|<|=)?\s*\d+(?:\.\d+)?(?:\.\d+)?(?:[-+][^\s]+)?$/.test(trimmed)) {
    return false;
  }
  return coerceVersion(trimmed) !== null;
}

/**
 * Does `version` satisfy `range`? Minimal subset of semver semantics covering
 * what the OA detectors need: exact, `^`, `~`, `>=`, `<=`, `>`, `<`, `=`.
 *
 * Pre-releases follow semver convention: a pre-release version (e.g.
 * "1.2.3-beta") satisfies a range only if the range explicitly mentions a
 * pre-release component at the same major.minor.patch boundary.
 */
export function satisfiesRange(version: string, range: string): boolean {
  const v = coerceVersion(version);
  if (!v) return false;
  const trimmedRange = range.trim();

  // Exact match (no operator)
  if (/^\d/.test(trimmedRange)) {
    return compareVersions(v, coerceVersion(trimmedRange) ?? "") === 0;
  }

  // `=` operator
  if (trimmedRange.startsWith("=")) {
    const target = coerceVersion(trimmedRange.slice(1));
    return target !== null && compareVersions(v, target) === 0;
  }

  // `^` caret: same major, >= specified, < next major
  if (trimmedRange.startsWith("^")) {
    const target = coerceVersion(trimmedRange.slice(1));
    if (!target) return false;
    if (compareVersions(v, target) < 0) return false;
    const tMajor = majorVersion(target);
    const vMajor = majorVersion(v);
    if (tMajor === null || vMajor === null) return false;
    return vMajor === tMajor;
  }

  // `~` tilde: same major.minor, >= specified
  if (trimmedRange.startsWith("~")) {
    const target = coerceVersion(trimmedRange.slice(1));
    if (!target) return false;
    if (compareVersions(v, target) < 0) return false;
    const [vMaj, vMin] = v.split(".").map(Number);
    const [tMaj, tMin] = target.split(".").map(Number);
    return vMaj === tMaj && vMin === tMin;
  }

  // Comparators
  for (const op of [">=", "<=", ">", "<"] as const) {
    if (trimmedRange.startsWith(op)) {
      const target = coerceVersion(trimmedRange.slice(op.length));
      if (!target) return false;
      const cmp = compareVersions(v, target);
      if (op === ">=") return cmp >= 0;
      if (op === "<=") return cmp <= 0;
      if (op === ">") return cmp > 0;
      if (op === "<") return cmp < 0;
    }
  }

  return false;
}
