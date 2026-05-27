/**
 * Heuristic: does this package name look like a platform-specific native binary?
 *
 * Used by OA006 to distinguish the genuinely-coupled case (override fights an
 * exact-pinned parent that ships a native binary, like `@esbuild/linux-x64`)
 * from the range-bumps-exact case (override on `postcss` against `next`'s
 * exact pin — risky but commonly intentional and usually works).
 *
 * Hits:
 *   @esbuild/linux-x64
 *   @next/swc-linux-x64-gnu
 *   @rollup/rollup-linux-x64-musl
 *   @swc/core-linux-x64-gnu
 *   @biomejs/cli-linux-x64
 *   @img/sharp-linux-x64
 *   @parcel/watcher-linux-x64-glibc
 *   @oxc-project/runtime-linux-x64-musl
 *   lightningcss-linux-x64-musl
 *   sharp-linux-x64
 *   esbuild-linux-x64
 *
 * Misses (correctly — these aren't platform binaries):
 *   postcss, react, next, esbuild (the JS parent itself), @scope/anything-not-platform
 */
export function looksLikePlatformBinary(name: string): boolean {
  return PLATFORM_TOKEN_RE.test(name);
}

/**
 * Matches a platform/OS token that appears as its own segment in the name:
 *   - at the start                          (e.g. "linux-x64")
 *   - after a slash                         (e.g. "@esbuild/linux-x64")
 *   - after a hyphen                        (e.g. "sharp-linux-x64", "swc-linux-x64-gnu")
 *
 * Followed by another segment boundary (slash, hyphen, underscore, end-of-string).
 * Anchoring to segment boundaries avoids false positives like "android-base-utils".
 */
const PLATFORM_TOKEN_RE =
  /(?:^|[-/])(linux|darwin|win32|windows|wasi|freebsd|openbsd|netbsd|sunos|android|cygwin)(?:[-/_]|$)/i;
