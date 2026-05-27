import type { RegistryDistTags } from '../types.js';

export interface RegistryClientOptions {
  /** Base URL — defaults to https://registry.npmjs.org. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Inject a fetch implementation for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch the `dist-tags` map for `pkgName` from the npm registry.
 *
 * Returns null on any failure (network error, non-200, parse error, timeout).
 * The caller surfaces a `skippedDetectors` note when this returns null for a
 * rule that depends on registry data.
 *
 * Per scan, callers should batch-fetch all needed packages in parallel and
 * cache the result on `Context.registryDistTags`. This function is single-shot;
 * caching/batching is the scanner's responsibility.
 */
export async function fetchDistTags(
  pkgName: string,
  opts: RegistryClientOptions = {},
): Promise<RegistryDistTags | null> {
  const baseUrl = opts.baseUrl ?? 'https://registry.npmjs.org';
  const timeoutMs = opts.timeoutMs ?? 5000;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const url = `${baseUrl}/${encodeRegistryPath(pkgName)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.npm.install-v1+json',
        'User-Agent': 'override-audit-cli',
      },
    });
    if (!res.ok) return null;
    const body = await res.json() as { 'dist-tags'?: Record<string, string> };
    return body['dist-tags'] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch dist-tags for many packages concurrently. Failures collapse to null
 * (per-package), so a single 404 doesn't tank the whole batch.
 */
export async function fetchDistTagsBatch(
  pkgNames: Iterable<string>,
  opts: RegistryClientOptions = {},
): Promise<Map<string, RegistryDistTags>> {
  const out = new Map<string, RegistryDistTags>();
  const unique = Array.from(new Set(pkgNames));
  await Promise.all(unique.map(async (name) => {
    const tags = await fetchDistTags(name, opts);
    if (tags) out.set(name, tags);
  }));
  return out;
}

/**
 * Encode a package name for the registry URL.
 * Scoped names like `@scope/pkg` need the slash kept literal — the registry
 * doesn't accept `%2F` for the scope separator.
 */
function encodeRegistryPath(pkgName: string): string {
  if (pkgName.startsWith('@')) {
    const slash = pkgName.indexOf('/');
    if (slash === -1) return encodeURIComponent(pkgName);
    return encodeURIComponent(pkgName.slice(0, slash)) + '/' + encodeURIComponent(pkgName.slice(slash + 1));
  }
  return encodeURIComponent(pkgName);
}
