import fs from "node:fs";
import path from "node:path";

export type DebugLogger = (message: string, details?: unknown) => void;

export type DebugSession = {
  log: DebugLogger;
  announcePath: () => void;
};

export function createDebugLogger(enabled: boolean): DebugSession {
  if (!enabled) {
    return {
      log: () => {},
      announcePath: () => {},
    };
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `cve-lite-debug-${ts}.log`;
  const outputPath = path.join(process.cwd(), filename);
  let announced = false;

  const log: DebugLogger = (message: string, details?: unknown) => {
    const time = new Date().toISOString();
    const payload = details === undefined
      ? ""
      : ` ${formatJson(details)}`;
    fs.appendFileSync(outputPath, `${time} [debug] ${message}${payload}\n`, "utf8");
  };

  const announcePath = () => {
    if (announced) return;
    announced = true;
    console.error(`[debug] Writing debug log to ./${filename}`);
  };

  return { log, announcePath };
}

function formatJson(details: unknown): string {
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}
