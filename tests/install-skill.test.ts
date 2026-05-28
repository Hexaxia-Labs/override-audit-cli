import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let SKILL_CONTENT: string;
let installSkill: (projectRoot: string) => void;

beforeAll(async () => {
  const contentMod = await import("../src/skills/content.js");
  SKILL_CONTENT = contentMod.SKILL_CONTENT;
  const installMod = await import("../src/skills/install.js");
  installSkill = installMod.installSkill;
});

describe("SKILL_CONTENT", () => {
  it("exports a non-empty string", () => {
    expect(typeof SKILL_CONTENT).toBe("string");
    expect(SKILL_CONTENT.length).toBeGreaterThan(0);
  });

  it("contains all required field names", () => {
    expect(SKILL_CONTENT).toContain("cve-lite . --json");
    expect(SKILL_CONTENT).toContain("runnableFixCommand");
    expect(SKILL_CONTENT).toContain("dependencyPaths");
    expect(SKILL_CONTENT).toContain("usage.imported");
    expect(SKILL_CONTENT).toContain("suggestedFixCommands");
    expect(SKILL_CONTENT).toContain("firstFixedVersion");
  });

  it("uses ### not ## headings (## would break section-replace logic in install.ts)", () => {
    const doubleHashLines = SKILL_CONTENT.split("\n").filter(l => /^## /.test(l));
    expect(doubleHashLines).toHaveLength(0);
  });
});

describe("installSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-skill-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("fresh project — all five files created", () => {
    it("creates .claude/commands/cve-lite.md with invocation hint", () => {
      installSkill(tmpDir);
      const content = fs.readFileSync(
        path.join(tmpDir, ".claude", "commands", "cve-lite.md"),
        "utf-8"
      );
      expect(content).toContain("Run this skill with /cve-lite");
      expect(content).toContain(SKILL_CONTENT);
    });

    it("creates .cursor/rules/cve-lite.mdc with YAML front-matter", () => {
      installSkill(tmpDir);
      const content = fs.readFileSync(
        path.join(tmpDir, ".cursor", "rules", "cve-lite.mdc"),
        "utf-8"
      );
      expect(content).toContain("description: CVE Lite CLI vulnerability analysis");
      expect(content).toContain("alwaysApply: false");
      expect(content).toContain(SKILL_CONTENT);
    });

    it("creates AGENTS.md with ## CVE Lite CLI section", () => {
      installSkill(tmpDir);
      const content = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");
      expect(content).toContain("## CVE Lite CLI");
      expect(content).toContain(SKILL_CONTENT);
    });

    it("creates GEMINI.md with ## CVE Lite CLI section", () => {
      installSkill(tmpDir);
      const content = fs.readFileSync(path.join(tmpDir, "GEMINI.md"), "utf-8");
      expect(content).toContain("## CVE Lite CLI");
      expect(content).toContain(SKILL_CONTENT);
    });

    it("creates .github/copilot-instructions.md with ## CVE Lite CLI section", () => {
      installSkill(tmpDir);
      const content = fs.readFileSync(
        path.join(tmpDir, ".github", "copilot-instructions.md"),
        "utf-8"
      );
      expect(content).toContain("## CVE Lite CLI");
      expect(content).toContain(SKILL_CONTENT);
    });
  });

  describe("re-run idempotency — no duplication", () => {
    it("does not duplicate Claude Code skill on re-run", () => {
      installSkill(tmpDir);
      installSkill(tmpDir);
      const content = fs.readFileSync(
        path.join(tmpDir, ".claude", "commands", "cve-lite.md"),
        "utf-8"
      );
      expect(content.match(/Run this skill with \/cve-lite/g)).toHaveLength(1);
    });

    it("does not duplicate Cursor skill on re-run", () => {
      installSkill(tmpDir);
      installSkill(tmpDir);
      const content = fs.readFileSync(
        path.join(tmpDir, ".cursor", "rules", "cve-lite.mdc"),
        "utf-8"
      );
      expect(content.match(/description: CVE Lite CLI/g)).toHaveLength(1);
    });

    it("does not duplicate AGENTS.md section on re-run", () => {
      installSkill(tmpDir);
      installSkill(tmpDir);
      const content = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");
      expect(content.match(/## CVE Lite CLI/g)).toHaveLength(1);
    });

    it("does not duplicate GEMINI.md section on re-run", () => {
      installSkill(tmpDir);
      installSkill(tmpDir);
      const content = fs.readFileSync(path.join(tmpDir, "GEMINI.md"), "utf-8");
      expect(content.match(/## CVE Lite CLI/g)).toHaveLength(1);
    });

    it("does not duplicate copilot-instructions.md section on re-run", () => {
      installSkill(tmpDir);
      installSkill(tmpDir);
      const content = fs.readFileSync(
        path.join(tmpDir, ".github", "copilot-instructions.md"),
        "utf-8"
      );
      expect(content.match(/## CVE Lite CLI/g)).toHaveLength(1);
    });
  });

  describe("append to existing file without CVE Lite section", () => {
    it("preserves existing content and appends CVE Lite section to AGENTS.md", () => {
      const existing = "# My Project\n\nSome existing guidance.\n";
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), existing, "utf-8");

      installSkill(tmpDir);

      const content = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");
      expect(content).toContain("# My Project");
      expect(content).toContain("Some existing guidance.");
      expect(content).toContain("## CVE Lite CLI");
      expect(content).toContain(SKILL_CONTENT);
      expect(content.indexOf("Some existing guidance.")).toBeLessThan(
        content.indexOf("## CVE Lite CLI")
      );
    });

    it("handles existing file without trailing newline when appending", () => {
      const existing = "# My Project\n\nSome guidance"; // no trailing newline
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), existing, "utf-8");

      installSkill(tmpDir);

      const content = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");
      expect(content).toContain("Some guidance");
      expect(content).toContain("## CVE Lite CLI");
      expect(content).toContain("Some guidance\n\n## CVE Lite CLI");
    });
  });

  describe("replace existing CVE Lite section", () => {
    it("replaces section content while preserving surrounding content", () => {
      const fileContent =
        "# My Project\n\nSome guidance.\n\n" +
        "## CVE Lite CLI\n\nold skill content here\n" +
        "\n## Another Section\n\nMore content.\n";
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), fileContent, "utf-8");

      installSkill(tmpDir);

      const content = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");
      expect(content).toContain("# My Project");
      expect(content).toContain("Some guidance.");
      expect(content).toContain("## CVE Lite CLI");
      expect(content).toContain(SKILL_CONTENT);
      expect(content).not.toContain("old skill content here");
      expect(content).toContain("## Another Section");
      expect(content).toContain("More content.");
    });

    it("replaces section at end of file without leaving stale content", () => {
      const fileContent =
        "# My Project\n\n## CVE Lite CLI\n\nold skill content\n";
      fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), fileContent, "utf-8");

      installSkill(tmpDir);

      const content = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");
      expect(content).toContain("# My Project");
      expect(content).not.toContain("old skill content");
      expect(content).toContain(SKILL_CONTENT);
    });
  });
});
