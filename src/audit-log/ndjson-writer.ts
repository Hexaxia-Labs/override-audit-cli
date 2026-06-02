import { appendFileSync, closeSync, openSync } from "node:fs";
import type { AuditEvent } from "./events.js";
import type { AuditLogHandle } from "./handle.js";

/**
 * Append-only NDJSON writer. Opens the file once, appends one JSON object
 * per line per emit, closes on demand.
 */
export class NdjsonAuditLog implements AuditLogHandle {
  readonly isNoOp = false;
  private fd: number | null;

  constructor(path: string) {
    this.fd = openSync(path, "a");
  }

  emit(event: AuditEvent): void {
    if (this.fd === null) {
      throw new Error("NdjsonAuditLog: emit called on a closed handle");
    }
    appendFileSync(this.fd, JSON.stringify(event) + "\n");
  }

  close(): void {
    if (this.fd === null) return;
    try {
      closeSync(this.fd);
    } finally {
      this.fd = null;
    }
  }
}
