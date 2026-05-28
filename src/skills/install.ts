import fs from "node:fs";
import path from "node:path";
import { chalk } from "../utils/chalk.js";
import { SKILL_CONTENT } from "./content.js";

function writeClaudeCodeSkill(projectRoot: string): void {
  const dir = path.join(projectRoot, ".claude", "commands");
  fs.mkdirSync(dir, { recursive: true });
  const content = `<!-- Run this skill with /cve-lite in any Claude Code session -->\n\n${SKILL_CONTENT}\n`;
  fs.writeFileSync(path.join(dir, "cve-lite.md"), content, "utf-8");
}

function writeCursorSkill(projectRoot: string): void {
  const dir = path.join(projectRoot, ".cursor", "rules");
  fs.mkdirSync(dir, { recursive: true });
  const frontMatter =
    "---\ndescription: CVE Lite CLI vulnerability analysis\nglobs: []\nalwaysApply: false\n---\n\n";
  fs.writeFileSync(
    path.join(dir, "cve-lite.mdc"),
    frontMatter + SKILL_CONTENT + "\n",
    "utf-8"
  );
}

function writeAppendSkill(projectRoot: string, relPath: string): void {
  const section = `## CVE Lite CLI\n\n${SKILL_CONTENT}\n`;
  const filePath = path.join(projectRoot, relPath);

  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, section, "utf-8");
    return;
  }

  const existing = fs.readFileSync(filePath, "utf-8");
  const marker = "## CVE Lite CLI";
  const idx = existing.indexOf(marker);

  if (idx === -1) {
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    fs.writeFileSync(filePath, existing + sep + section, "utf-8");
    return;
  }

  // Replace from marker to next ## heading (or end of file)
  const afterMarker = existing.indexOf("\n## ", idx + marker.length);
  const before = existing.slice(0, idx);
  const after = afterMarker === -1 ? "" : existing.slice(afterMarker);
  fs.writeFileSync(filePath, before + section + after, "utf-8");
}

export function installSkill(projectRoot: string): void {
  writeClaudeCodeSkill(projectRoot);
  writeAppendSkill(projectRoot, "AGENTS.md");
  writeAppendSkill(projectRoot, "GEMINI.md");
  writeCursorSkill(projectRoot);
  writeAppendSkill(projectRoot, ".github/copilot-instructions.md");

  console.log("\nCVE Lite CLI skills installed:\n");
  console.log(
    `  ${chalk.green("✓")} Claude Code      .claude/commands/cve-lite.md`
  );
  console.log(
    `  ${chalk.green("✓")} Codex CLI        AGENTS.md  (section written)`
  );
  console.log(
    `  ${chalk.green("✓")} Gemini CLI       GEMINI.md  (section written)`
  );
  console.log(
    `  ${chalk.green("✓")} Cursor           .cursor/rules/cve-lite.mdc`
  );
  console.log(
    `  ${chalk.green("✓")} GitHub Copilot   .github/copilot-instructions.md  (section written)`
  );
  console.log(
    "\nCommit these files to your repo to share them with your team."
  );
}
