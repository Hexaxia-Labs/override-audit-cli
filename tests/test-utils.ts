import fs from "node:fs";

export function removeDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
