/**
 * Plan 6 sanity check: lock in the doc migration and the frozen snapshot.
 *
 * Plan 6 moved the OA rule docs to docs/rules/, wrote docs/audit-log.md, and
 * trimmed _preserved-override-audit/ to a frozen src/ snapshot kept only as the
 * port-equivalence baseline. The failure modes this guards:
 *
 *   1. A detector's references: URL points to a docs/rules/ file that does not
 *      exist (the URL is the contract; a broken link ships a dead reference).
 *   2. The audit-log reference doc goes missing or loses an event type.
 *   3. The frozen snapshot loses a file the equivalence tests import.
 *
 * Run with: npm test -- tests/sanity/plan-6-docs-and-snapshot.test.ts
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Jest runs from the repo root, so cwd is the project root.
const repoRoot = process.cwd();

describe("Plan 6: detector reference URLs resolve to real rule docs", () => {
  const detectorsDir = join(repoRoot, "src", "overrides", "detectors");
  const detectorFiles = readdirSync(detectorsDir).filter(
    (f) => /^oa\d/.test(f) && f.endsWith(".ts")
  );

  it("every oa* detector exists (8 rules)", () => {
    const ruleFiles = detectorFiles.filter((f) => /^oa00\d/.test(f));
    expect(ruleFiles.length).toBe(8);
  });

  it("each detector's docs/rules/ reference URL points to a file that exists", () => {
    const urlRe = /blob\/main\/(docs\/rules\/OA\d{3}\.md)/g;
    let checked = 0;
    for (const file of detectorFiles) {
      const src = readFileSync(join(detectorsDir, file), "utf8");
      let m: RegExpExecArray | null;
      while ((m = urlRe.exec(src)) !== null) {
        const localPath = join(repoRoot, m[1]);
        expect(existsSync(localPath)).toBe(true);
        checked++;
      }
    }
    // At least the 8 rule docs are referenced.
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("all eight rule docs OA001..OA008 exist in docs/rules/", () => {
    for (let n = 1; n <= 8; n++) {
      const id = `OA00${n}`;
      expect(existsSync(join(repoRoot, "docs", "rules", `${id}.md`))).toBe(true);
    }
  });
});

describe("Plan 6: audit-log reference doc", () => {
  it("docs/audit-log.md exists and documents all nine event types", () => {
    const docPath = join(repoRoot, "docs", "audit-log.md");
    expect(existsSync(docPath)).toBe(true);
    const doc = readFileSync(docPath, "utf8");
    const events = [
      "scan.started",
      "scan.finished",
      "cve.detected",
      "cve.fix.applied",
      "oa.detected",
      "oa.fix.applied",
      "verify.passed",
      "verify.failed",
      "error",
    ];
    for (const ev of events) {
      expect(doc).toContain(ev);
    }
  });
});

describe("Plan 6: frozen snapshot integrity", () => {
  it("the preserved frozen snapshot keeps the files the equivalence tests import", () => {
    const base = join(repoRoot, "_preserved-override-audit", "src");
    expect(existsSync(join(base, "scanner.ts"))).toBe(true);
    expect(existsSync(join(base, "types.ts"))).toBe(true);
    for (const d of [
      "orphan",
      "floating-tag",
      "wrong-section",
      "installed-newer",
      "coupled-platform-binary",
      "frozen-latest",
      "vulnerable-twin",
    ]) {
      expect(existsSync(join(base, "detectors", `${d}.ts`))).toBe(true);
    }
  });

  it("the frozen snapshot has a README marking it do-not-ship", () => {
    const readme = join(repoRoot, "_preserved-override-audit", "README.md");
    expect(existsSync(readme)).toBe(true);
    expect(readFileSync(readme, "utf8")).toMatch(/frozen/i);
  });
});
