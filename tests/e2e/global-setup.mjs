// Jest globalSetup: guarantee dist/index.js is built and fresh before any test
// spawns the real CLI. Staleness-aware so it is a no-op when dist is current
// (a stat comparison), and rebuilds only when missing or older than src/.
//
// This closes the dist-staleness footgun that bit CI before (the binary spawned
// by e2e tests must match current source).

import { execFileSync } from "node:child_process";
import { statSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full));
    } else if (entry.name.endsWith(".ts")) {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

export default function build() {
  const distEntry = join(repoRoot, "dist", "index.js");
  const fresh =
    existsSync(distEntry) &&
    statSync(distEntry).mtimeMs >= newestMtime(join(repoRoot, "src"));
  if (fresh) return;
  // Build once. Inherit stdio so a failure surfaces clearly.
  execFileSync("npm", ["run", "build"], { cwd: repoRoot, stdio: "inherit" });
}
