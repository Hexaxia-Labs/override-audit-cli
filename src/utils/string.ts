export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * Shell-quote a string for safe interpolation into a shell command.
 * Returns the input unchanged when it contains only "safe" identifier
 * characters; otherwise wraps it in single quotes with embedded
 * single quotes escaped as `'\\''`.
 */
export function shellQuote(s: string): string {
  return /[^A-Za-z0-9_@./:-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
}
