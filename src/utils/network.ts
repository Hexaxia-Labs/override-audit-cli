export function extractErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as NodeJS.ErrnoException & { cause?: unknown }).cause;
  if (cause instanceof Error) return `${error.message}: ${extractErrorMessage(cause)}`;
  return error.message;
}

export function sslCertificateErrorHint(): string[] {
  return [
    "Hint: SSL certificate error — your network may be using a corporate proxy that intercepts HTTPS traffic.",
    "Fix (recommended): save your corporate CA certificate path once:",
    "  cve-lite config set ca-cert /path/to/corporate-ca.crt",
    "Or pass it per-invocation:",
    "  cve-lite . --ca-cert /path/to/corporate-ca.crt",
  ];
}

export function blockedAdvisoryRequestHint(): string[] {
  return [
    "Hint: Outbound access to the OSV API may be blocked or restricted in this environment.",
    "If that is expected, build the advisory DB on a machine with OSV access, then scan here with `--offline` or `--offline-db /path/to/advisories.db`.",
    "Command to build the DB on a network-allowed machine: `cve-lite advisories sync --output /path/to/advisories.db`",
    "If your network uses SSL inspection, try: cve-lite config set ca-cert /path/to/corporate-ca.crt",
  ];
}

export function fetchErrorCaCertHint(): string[] {
  return [
    "Hint: If your network uses a corporate SSL proxy, a CA certificate may be required.",
    "Run: cve-lite config set ca-cert /path/to/corporate-ca.crt",
  ];
}

const OFFLINE_FALLBACK_LINES = [
  "  cve-lite . --offline",
  "  (requires a local advisory DB - run `cve-lite advisories sync` to build one)",
];

export function rateLimitAdvisoryRequestHint(): string[] {
  return [
    "Hint: OSV API rate limit reached. Wait a moment and retry, or scan offline:",
    ...OFFLINE_FALLBACK_LINES,
  ];
}

export function serverAdvisoryRequestHint(): string[] {
  return [
    "Hint: OSV API may be temporarily unavailable. Wait a moment and retry, or scan offline:",
    ...OFFLINE_FALLBACK_LINES,
  ];
}

const SSL_ERROR_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_UNTRUSTED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

const SSL_ERROR_MESSAGE_FRAGMENTS = [
  "self signed certificate",
  "self-signed certificate",
  "certificate chain",
  "certificate has expired",
  "unable to verify the first certificate",
];

function finalErrorCause(message: string): string {
  const normalized = message.toLowerCase();
  return normalized.split(":").pop()?.trim() ?? normalized;
}

function isOsvError(message: string): boolean {
  return message.toLowerCase().includes("osv");
}

function isRateLimitCause(finalCause: string): boolean {
  return /^429\b/.test(finalCause);
}

function isServerCause(finalCause: string): boolean {
  return /^5\d\d\b/.test(finalCause);
}

export function isSslCertificateError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code && SSL_ERROR_CODES.has(code)) return true;
  const cause = (error as { cause?: unknown }).cause;
  if (cause) return isSslCertificateError(cause);
  const normalized = error.message.toLowerCase();
  return SSL_ERROR_MESSAGE_FRAGMENTS.some(f => normalized.includes(f));
}

export function isRateLimitError(message: string): boolean {
  if (!isOsvError(message)) {
    return false;
  }

  return isRateLimitCause(finalErrorCause(message));
}

export function isServerError(message: string): boolean {
  if (!isOsvError(message)) {
    return false;
  }

  return isServerCause(finalErrorCause(message));
}

export function isLikelyBlockedAdvisoryRequestError(message: string): boolean {
  if (!isOsvError(message)) {
    return false;
  }

  const finalCause = finalErrorCause(message);
  if (isRateLimitCause(finalCause) || isServerCause(finalCause)) {
    return false;
  }

  const blockedIndicators = [
    "access denied",
    "blocked",
    "body timeout",
    "connection refused",
    "eai_again",
    "econnrefused",
    "econnreset",
    "enotfound",
    "etimedout",
    "fetch failed",
    "forbidden",
    "gateway timeout",
    "host unreachable",
    "network unavailable",
    "proxy",
    "socket hang up",
    "timed out",
    "timeout",
    "tunneling socket",
    "unable to verify the first certificate",
  ];

  if (blockedIndicators.some(indicator => finalCause.includes(indicator))) {
    return true;
  }

  return /^(401|403|407|408|451)\b/.test(finalCause);
}
