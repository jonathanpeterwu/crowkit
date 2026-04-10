#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { homedir, platform } from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const TEMPLATES = join(__dirname, "..", "templates");
const IS_MAC = platform() === "darwin";

const ICLOUD_BASE = join(
  HOME,
  "Library",
  "Mobile Documents",
  "com~apple~CloudDocs"
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question, fallback) {
  return new Promise((resolve) => {
    const prompt = fallback ? `${question} [${fallback}]: ` : `${question}: `;
    rl.question(prompt, (answer) => resolve(answer.trim() || fallback || ""));
  });
}

function log(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function warn(msg) {
  console.log(`\x1b[33m!\x1b[0m ${msg}`);
}

function err(msg) {
  console.log(`\x1b[31m✗\x1b[0m ${msg}`);
}

function heading(msg) {
  console.log(`\n\x1b[1m${msg}\x1b[0m`);
}

function safeSymlink(target, linkPath) {
  if (existsSync(linkPath)) {
    unlinkSync(linkPath);
  }
  symlinkSync(target, linkPath);
}

function template(name) {
  return readFileSync(join(TEMPLATES, name), "utf-8");
}

async function main() {
  console.log(`
╔══════════════════════════════════════════╗
║     LLM Wiki Setup (Karpathy Pattern)   ║
║     For Claude Code + iCloud Sync        ║
╚══════════════════════════════════════════╝
`);

  // ── Step 1: Choose wiki location ──
  heading("Step 1: Wiki Location");
  const wikiPath = await ask("Where should the wiki live?", join(HOME, "wiki"));

  // ── Step 2: Choose sync method for Claude config ──
  heading("Step 2: Claude Config Sync");
  let syncMethod = "local";

  if (IS_MAC && existsSync(ICLOUD_BASE)) {
    const useIcloud = await ask("iCloud Drive detected. Use it to sync Claude config across Macs? (y/n)", "y");
    if (useIcloud.toLowerCase() === "y") {
      syncMethod = "icloud";
    }
  } else if (IS_MAC) {
    warn("iCloud Drive not found. Config will be local-only.");
  } else {
    warn("Not macOS. Config will be local-only (copy manually to other machines).");
  }

  // ── Step 3: Create wiki directory structure ──
  heading("Step 3: Creating Wiki");

  const dirs = ["raw", "pages", "outputs"];
  if (!existsSync(wikiPath)) {
    mkdirSync(wikiPath, { recursive: true });
  }

  for (const dir of dirs) {
    const p = join(wikiPath, dir);
    if (!existsSync(p)) {
      mkdirSync(p, { recursive: true });
      writeFileSync(join(p, ".gitkeep"), "");
    }
  }

  // Write navigation files
  if (!existsSync(join(wikiPath, "index.md"))) {
    writeFileSync(join(wikiPath, "index.md"), template("index.md"));
    log("Created index.md");
  }

  if (!existsSync(join(wikiPath, "log.md"))) {
    const today = new Date().toISOString().split("T")[0];
    const logContent = template("log.md").replace("{{DATE}}", today);
    writeFileSync(join(wikiPath, "log.md"), logContent);
    log("Created log.md");
  }

  log(`Wiki created at ${wikiPath}`);

  // ── Step 4: Initialize git ──
  heading("Step 4: Git");

  if (!existsSync(join(wikiPath, ".git"))) {
    execSync("git init && git branch -m main", { cwd: wikiPath, stdio: "pipe" });
    log("Initialized git repo");
  } else {
    log("Git repo already exists");
  }

  if (!existsSync(join(wikiPath, ".gitignore"))) {
    writeFileSync(join(wikiPath, ".gitignore"), ".DS_Store\n*.swp\n");
  }

  // ── Step 5: Place CLAUDE.md and commands ──
  heading("Step 5: Claude Code Config");

  const claudeMdContent = template("CLAUDE.md").replace(/{{WIKI_PATH}}/g, wikiPath);
  const nextMdContent = template("next.md").replace(/{{WIKI_PATH}}/g, wikiPath);

  if (syncMethod === "icloud") {
    const configDir = join(ICLOUD_BASE, "claude-config");
    const commandsDir = join(configDir, "commands");
    mkdirSync(commandsDir, { recursive: true });

    writeFileSync(join(configDir, "CLAUDE.md"), claudeMdContent);
    writeFileSync(join(commandsDir, "next.md"), nextMdContent);

    // Symlink CLAUDE.md to home
    safeSymlink(join(configDir, "CLAUDE.md"), join(HOME, "CLAUDE.md"));

    // Symlink /next command
    mkdirSync(join(HOME, ".claude", "commands"), { recursive: true });
    safeSymlink(join(commandsDir, "next.md"), join(HOME, ".claude", "commands", "next.md"));

    log("Config stored in iCloud, symlinked to local paths");
    log("Other Macs with same Apple ID will sync automatically");
    warn("On other Macs, re-run this tool to create symlinks");
  } else {
    // Local-only: write directly
    writeFileSync(join(HOME, "CLAUDE.md"), claudeMdContent);
    mkdirSync(join(HOME, ".claude", "commands"), { recursive: true });
    writeFileSync(join(HOME, ".claude", "commands", "next.md"), nextMdContent);
    log("Config written locally");
  }

  // ── Step 6: Write README ──
  if (!existsSync(join(wikiPath, "README.md"))) {
    const readmeContent = template("README.md")
      .replace(/{{WIKI_PATH}}/g, wikiPath)
      .replace(/{{SYNC_METHOD}}/g, syncMethod);
    writeFileSync(join(wikiPath, "README.md"), readmeContent);
    log("Created README.md");
  }

  // ── Step 7: Initial commit ──
  try {
    execSync("git add -A", { cwd: wikiPath, stdio: "pipe" });
    const status = execSync("git status --porcelain", { cwd: wikiPath, encoding: "utf-8" });
    if (status.trim()) {
      execSync(
        'git commit -m "Initialize LLM wiki (Karpathy pattern)"',
        { cwd: wikiPath, stdio: "pipe" }
      );
      log("Initial commit created");
    }
  } catch {
    warn("Skipped commit (may need git user config)");
  }

  // ── Done ──
  heading("Done!");
  console.log(`
  Wiki:       ${wikiPath}
  CLAUDE.md:  ${join(HOME, "CLAUDE.md")}${syncMethod === "icloud" ? " (→ iCloud)" : ""}
  /next cmd:  ~/.claude/commands/next.md${syncMethod === "icloud" ? " (→ iCloud)" : ""}

  Next steps:
  1. Add a git remote:  cd ${wikiPath} && git remote add origin <your-repo-url> && git push -u origin main
  2. Drop files into ${wikiPath}/raw/ and ask Claude to "ingest"
  3. Run /next in Claude Code to see what needs attention
`);

  rl.close();
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});
