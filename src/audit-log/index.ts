export type { AuditEvent, AuditEventType } from "./events.js";
export { AUDIT_LOG_SCHEMA_VERSION } from "./events.js";
export type { AuditLogHandle } from "./handle.js";
export { NullAuditLog, NULL_AUDIT_LOG, MemoryAuditLog } from "./handle.js";
export { NdjsonAuditLog } from "./ndjson-writer.js";

import type { AuditLogHandle } from "./handle.js";
import { NULL_AUDIT_LOG } from "./handle.js";
import { NdjsonAuditLog } from "./ndjson-writer.js";

/**
 * Build an audit-log handle from CLI options.
 *
 * `path` from `--audit-log <path>` or `CVE_LITE_AUDIT_LOG=<path>`. When undefined,
 * returns the shared no-op handle.
 */
export function createAuditLog(path: string | undefined): AuditLogHandle {
  if (!path) return NULL_AUDIT_LOG;
  return new NdjsonAuditLog(path);
}
