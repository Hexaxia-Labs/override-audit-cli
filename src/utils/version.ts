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
