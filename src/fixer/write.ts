import { writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';

/**
 * Detect the indentation unit used in a JSON document. Looks at the first
 * line that's clearly indented inside the root object. Returns the indent
 * string (e.g. "  " or "\t"); defaults to two spaces when unparseable.
 */
export function detectIndent(raw: string): string {
  const lines = raw.split('\n');
  for (const line of lines) {
    // Skip empty lines and the bare "{" opening.
    if (!line || line === '{' || line.trim() === '{') continue;
    const m = line.match(/^([\t ]+)\S/);
    if (m && m[1]) return m[1];
  }
  return '  ';
}

/** Does the original raw text end with a newline? */
export function hasTrailingNewline(raw: string): boolean {
  return raw.endsWith('\n');
}

/**
 * Atomically write a modified package.json back to disk, preserving the
 * detected indent and trailing-newline style.
 *
 * Atomic = write to a sibling tmp file, then rename. Guarantees readers
 * never see a half-written file (which matters for CI pipelines that may
 * read package.json from another process concurrently).
 */
export function writePackageJson(
  projectPath: string,
  doc: unknown,
  originalRaw: string,
): void {
  const indent = detectIndent(originalRaw);
  let json = JSON.stringify(doc, null, indent);
  if (hasTrailingNewline(originalRaw)) json += '\n';

  const target = join(projectPath, 'package.json');
  const tmp = join(dirname(target), `.package.json.tmp-${randomBytes(6).toString('hex')}`);
  writeFileSync(tmp, json, 'utf-8');
  try {
    renameSync(tmp, target);
  } catch (err) {
    // Try to clean up the tmp file if rename fails.
    if (existsSync(tmp)) {
      try { renameSync(tmp, tmp + '.failed'); } catch { /* swallow */ }
    }
    throw err;
  }
}
