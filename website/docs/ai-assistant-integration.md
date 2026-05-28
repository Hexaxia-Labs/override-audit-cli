---
sidebar_label: AI Assistant Integration
---

# AI Assistant Integration

CVE Lite CLI ships with a built-in command that installs skill files for five AI coding assistants. Once installed, your AI assistant knows how to run a scan, read the results, and produce a prioritized remediation plan — without any extra prompting on your part.

## Installing skills

Run this once in your project root:

```bash
cve-lite install-skill
```

Output:

```
CVE Lite CLI skills installed:

  ✓ Claude Code      .claude/commands/cve-lite.md
  ✓ Codex CLI        AGENTS.md  (section written)
  ✓ Gemini CLI       GEMINI.md  (section written)
  ✓ Cursor           .cursor/rules/cve-lite.mdc
  ✓ GitHub Copilot   .github/copilot-instructions.md  (section written)

Commit these files to your repo to share them with your team.
```

Running it twice is safe — existing sections are replaced in place, surrounding content is preserved.

### What gets installed

| Tool | File | Behavior |
|------|------|----------|
| Claude Code | `.claude/commands/cve-lite.md` | Created or overwritten |
| Codex CLI | `AGENTS.md` | `## CVE Lite CLI` section written |
| Gemini CLI | `GEMINI.md` | `## CVE Lite CLI` section written |
| Cursor | `.cursor/rules/cve-lite.mdc` | Created or overwritten with front-matter |
| GitHub Copilot | `.github/copilot-instructions.md` | `## CVE Lite CLI` section written |

Commit these files to your repository. Every developer who clones the repo gets the skills automatically.

---

## The AI-assisted security workflow

Once the skill is installed, the workflow is:

**1. Scan and save results**

```bash
cve-lite . --json
```

The scan results are saved to a timestamped file (`cve-lite-scan-<timestamp>.json`) in the current directory.

**2. Ask your AI assistant to analyze findings**

In Claude Code, invoke the skill with `/cve-lite`. In other tools the skill is picked up automatically when you ask about vulnerabilities.

The assistant will:
- Read the JSON output
- Prioritize findings by severity and relationship (direct before transitive)
- Check whether vulnerable packages are actually imported in your source code
- Identify patterns — for example, one parent dependency causing multiple transitive findings
- Produce a concrete remediation plan with the exact commands to run

**3. Apply fixes**

The `runnableFixCommand` field in each finding contains the exact install command for your package manager. The assistant will surface these alongside its analysis.

---

## What the skill teaches the assistant

The skill file covers four things:

### Getting scan data

How to invoke `cve-lite . --json` and which fields matter in the output:

- `package`, `version` — the vulnerable package
- `severity` — `critical | high | medium | low | unknown`
- `relationship` — `direct | transitive`
- `firstFixedVersion` — minimum safe version, if known
- `runnableFixCommand` — exact install command to run, if available
- `recommendedAction` — human-readable fix guidance
- `cves` — CVE IDs
- `dependencyPaths` — chains showing how the package is pulled in
- `usage.imported` — whether the package is actually imported in source files
- `suggestedFixCommands` — grouped, copy-ready fix commands at the top level

### Prioritization rules

1. Critical before high before medium before low
2. Direct dependencies before transitive
3. If `usage.imported === false`, flag as lower practical risk but do not dismiss
4. If `runnableFixCommand` is present, that is the exact command to run

### Codebase analysis

- Cross-reference vulnerable packages against source file imports to confirm reachability
- Check `package.json` version constraints for direct dependency findings
- Use `dependencyPaths` to trace transitive chains and identify which parent package to upgrade
- Look for patterns: a single parent responsible for multiple transitive findings

### Output

The assistant produces a prioritized remediation list with severity, relationship, import status, and copy-ready fix commands for each finding — plus a summary of what remains after applying the suggested commands.

---

## Why commit the skill files?

Skill files are plain text committed to your repository. Any developer who clones the repo and opens it in a supported AI assistant gets the context automatically — no manual setup, no per-developer configuration.

For files that support multiple sections (AGENTS.md, GEMINI.md, `.github/copilot-instructions.md`), the CVE Lite CLI section is added alongside any existing content. Your own guidance is preserved.
