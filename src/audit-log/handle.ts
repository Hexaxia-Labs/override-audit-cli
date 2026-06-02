import type { AuditEvent } from "./events.js";

export interface AuditLogHandle {
  emit(event: AuditEvent): void;
  close(): void;
  readonly isNoOp: boolean;
}

/**
 * Zero-cost no-op handle. The default when audit logging is disabled.
 * Single allocation, single function call per emit, no I/O, no allocation per call.
 */
export class NullAuditLog implements AuditLogHandle {
  readonly isNoOp = true;
  emit(_event: AuditEvent): void { /* noop */ }
  close(): void { /* noop */ }
}

export const NULL_AUDIT_LOG: AuditLogHandle = new NullAuditLog();

/**
 * In-memory audit log used by tests to assert event sequences. Captures every
 * emit; close is a no-op.
 */
export class MemoryAuditLog implements AuditLogHandle {
  readonly isNoOp = false;
  readonly events: AuditEvent[] = [];
  emit(event: AuditEvent): void { this.events.push(event); }
  close(): void { /* noop */ }
}
