#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { homedir, platform } from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import readline from "readline";

import { copyFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const TEMPLATES = join(__dirname, "..", "templates");
const PLATFORM = platform();
const IS_MAC = PLATFORM === "darwin";
const IS_WIN = PLATFORM === "win32";
const IS_LINUX = PLATFORM === "linux";
const IS_WSL = IS_LINUX && (() => {
  try { return readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft"); } catch { return false; }
})();

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
  try {
    symlinkSync(target, linkPath);
  } catch {
    // Windows without developer mode, or permission issues — fall back to copy
    warn(`Symlink failed, copying instead: ${linkPath}`);
    copyFileSync(target, linkPath);
  }
}

function template(name) {
  return readFileSync(join(TEMPLATES, name), "utf-8");
}

function cmd(command, opts = {}) {
  try {
    return execSync(command, { encoding: "utf-8", stdio: "pipe", ...opts }).trim();
  } catch {
    return null;
  }
}

function checkTool(name, testCmd, loginCmd, loginNote) {
  const result = cmd(testCmd);
  if (result) {
    return { name, ok: true, detail: result.split("\n")[0] };
  }
  return { name, ok: false, loginCmd, loginNote };
}

// Store a secret in platform-native credential store
function secretSet(service, account, password) {
  try {
    if (IS_MAC) {
      execSync(
        `security add-generic-password -U -s "${service}" -a "${account}" -w "${password}"`,
        { stdio: "pipe" }
      );
      return "keychain";
    }
    if (IS_LINUX && cmd("which secret-tool")) {
      execSync(
        `echo -n "${password}" | secret-tool store --label="${service}:${account}" service "${service}" account "${account}"`,
        { stdio: "pipe" }
      );
      return "gnome-keyring";
    }
    if (IS_WIN) {
      execSync(
        `cmdkey /generic:${service}:${account} /user:${account} /pass:${password}`,
        { stdio: "pipe" }
      );
      return "credential-manager";
    }
  } catch { /* fall through */ }
  return false;
}

function secretGet(service, account) {
  try {
    if (IS_MAC) {
      return execSync(
        `security find-generic-password -s "${service}" -a "${account}" -w`,
        { encoding: "utf-8", stdio: "pipe" }
      ).trim();
    }
    if (IS_LINUX && cmd("which secret-tool")) {
      return execSync(
        `secret-tool lookup service "${service}" account "${account}"`,
        { encoding: "utf-8", stdio: "pipe" }
      ).trim();
    }
    // Windows credential manager doesn't have a simple CLI read — skip
  } catch { /* not found */ }
  return null;
}

async function runAuthChecks() {
  heading("Auth Preflight");

  const checks = [
    checkTool(
      "GitHub CLI",
      "gh auth status 2>&1 | head -3",
      "gh auth login",
      "Required to push wiki repo"
    ),
    checkTool(
      "npm",
      "npm whoami 2>&1",
      "npm login",
      "Required to publish packages"
    ),
    checkTool(
      "Claude Code",
      "claude --version 2>&1",
      "npm install -g @anthropic-ai/claude-code",
      "Required to use the wiki"
    ),
    checkTool(
      "git user",
      'git config user.email 2>&1',
      'git config --global user.email "you@example.com" && git config --global user.name "Your Name"',
      "Required for commits"
    ),
  ];

  let allGood = true;
  for (const c of checks) {
    if (c.ok) {
      log(`${c.name}: ${c.detail}`);
    } else {
      err(`${c.name}: not authenticated`);
      console.log(`    Fix: ${c.loginCmd}`);
      if (c.loginNote) console.log(`    (${c.loginNote})`);
      allGood = false;
    }
  }

  return { allGood, checks };
}

async function setupMcpKeys() {
  heading("MCP Server API Keys");
  const storeNames = { darwin: "macOS Keychain", linux: "GNOME Keyring (secret-tool)", win32: "Windows Credential Manager" };
  console.log(`  API keys stored in: ${storeNames[PLATFORM] || "env vars"}\n`);

  const servers = [];
  let addMore = true;

  // Check for existing MCP servers in .claude.json
  const claudeJson = join(HOME, ".claude.json");
  if (existsSync(claudeJson)) {
    const config = JSON.parse(readFileSync(claudeJson, "utf-8"));
    const mcpServers = config.mcpServers || {};
    const existing = Object.keys(mcpServers);
    if (existing.length > 0) {
      log(`Found existing MCP servers: ${existing.join(", ")}`);
    }
  }

  while (addMore) {
    const name = await ask("MCP server name (or 'done' to skip)", "done");
    if (name === "done") break;

    const url = await ask(`  ${name} URL`);
    const needsKey = await ask(`  Does ${name} need an API key? (y/n)`, "n");

    let envVar = null;
    if (needsKey.toLowerCase() === "y") {
      const keyName = await ask(`  Env var name (e.g., RESEND_API_KEY)`);
      const existingKey = secretGet("crowkit-mcp", keyName);

      if (existingKey) {
        log(`  Found existing key for ${keyName} in Keychain`);
        envVar = { name: keyName, value: existingKey };
      } else {
        const keyValue = await ask(`  API key value (stored in Keychain, not in files)`);
        const stored = secretSet("crowkit-mcp", keyName, keyValue);
        if (stored) {
          log(`  Stored ${keyName} in ${typeof stored === "string" ? stored : "credential store"}`);
        } else {
          warn(`  No native credential store found. Add to your shell profile: export ${keyName}="***"`);
        }
        envVar = { name: keyName, value: keyValue };
      }
    }

    servers.push({ name, url, envVar });

    // Add to Claude Code
    try {
      const envFlag = envVar ? ` -e ${envVar.name}=${envVar.value}` : "";
      execSync(
        `claude mcp add --transport http ${name} ${url} -s user${envFlag}`,
        { stdio: "pipe" }
      );
      log(`  Added ${name} MCP server`);
    } catch (e) {
      warn(`  Could not add ${name} via CLI. Add manually: claude mcp add --transport http ${name} ${url} -s user`);
    }
  }

  return servers;
}

async function main() {
  console.log(`
╔══════════════════════════════════════════╗
║            crowkit v0.1.0                ║
║   LLM Wiki + Claude Code Harness        ║
╚══════════════════════════════════════════╝
`);

  // ── Step 0: Auth preflight ──
  const { allGood } = await runAuthChecks();
  if (!allGood) {
    const proceed = await ask("\nSome tools are not authenticated. Continue anyway? (y/n)", "y");
    if (proceed.toLowerCase() !== "y") {
      console.log("\nFix auth issues above, then re-run: npx crowkit");
      rl.close();
      return;
    }
  }

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
  } else if (IS_WSL) {
    warn("WSL detected. Config will be local-only. Use 'crowkit sync' (v1.0) for cross-machine sync.");
  } else if (IS_LINUX) {
    warn("Linux detected. Config will be local-only. Use 'crowkit sync' (v1.0) for cross-machine sync.");
  } else if (IS_WIN) {
    warn("Windows detected. Config will be local-only. Use 'crowkit sync' (v1.0) for cross-machine sync.");
  } else {
    warn("Config will be local-only.");
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

  // ── Step 5: Place CLAUDE.md and skills ──
  heading("Step 5: Claude Code Config");

  const claudeMdContent = template("CLAUDE.md").replace(/{{WIKI_PATH}}/g, wikiPath);

  // Skills to install
  const skills = ["crowkit-next", "crowkit-ingest", "crowkit-lint"];

  if (syncMethod === "icloud") {
    const configDir = join(ICLOUD_BASE, "claude-config");
    const skillsDir = join(configDir, "skills");
    mkdirSync(skillsDir, { recursive: true });

    // CLAUDE.md
    writeFileSync(join(configDir, "CLAUDE.md"), claudeMdContent);
    safeSymlink(join(configDir, "CLAUDE.md"), join(HOME, "CLAUDE.md"));

    // Skills
    for (const skill of skills) {
      const srcDir = join(TEMPLATES, "skills", skill);
      const icloudSkillDir = join(skillsDir, skill);
      const localSkillDir = join(HOME, ".claude", "skills", skill);

      mkdirSync(icloudSkillDir, { recursive: true });
      mkdirSync(dirname(localSkillDir), { recursive: true });

      const content = readFileSync(join(srcDir, "SKILL.md"), "utf-8")
        .replace(/{{WIKI_PATH}}/g, wikiPath);
      writeFileSync(join(icloudSkillDir, "SKILL.md"), content);
      safeSymlink(icloudSkillDir, localSkillDir);
      log(`Installed skill: /${skill.replace("crowkit-", "")}`);
    }

    log("Config stored in iCloud, symlinked to local paths");
    log("Other Macs with same Apple ID will sync automatically");
    warn("On other Macs, re-run this tool to create symlinks");
  } else {
    // Local-only: write directly
    writeFileSync(join(HOME, "CLAUDE.md"), claudeMdContent);

    for (const skill of skills) {
      const srcDir = join(TEMPLATES, "skills", skill);
      const localSkillDir = join(HOME, ".claude", "skills", skill);
      mkdirSync(localSkillDir, { recursive: true });

      const content = readFileSync(join(srcDir, "SKILL.md"), "utf-8")
        .replace(/{{WIKI_PATH}}/g, wikiPath);
      writeFileSync(join(localSkillDir, "SKILL.md"), content);
      log(`Installed skill: /${skill.replace("crowkit-", "")}`);
    }
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

  // ── Step 7: MCP servers + API keys ──
  const setupMcp = await ask("Set up MCP servers and API keys? (y/n)", "y");
  if (setupMcp.toLowerCase() === "y") {
    await setupMcpKeys();
  }

  // ── Step 8: Optional tools ──
  heading("Step 8: Optional Tools");

  // GitButler
  if (cmd("which gitbutler-cli") || cmd("which gitbutler")) {
    log("GitButler detected — virtual branches work well for separating wiki changes from code");
  } else {
    const installGb = await ask("Install GitButler for virtual branch management? (y/n)", "n");
    if (installGb.toLowerCase() === "y") {
      if (IS_MAC) {
        try {
          execSync("brew install --cask gitbutler", { stdio: "inherit" });
          log("GitButler installed");
        } catch {
          warn("Could not install GitButler. Get it at https://gitbutler.com");
        }
      } else {
        console.log("    Download: https://gitbutler.com");
      }
    }
  }

  // ── Step 9: Initial commit ──
  heading("Step 9: Git Commit");
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
  Skills:     /next, /ingest, /lint${syncMethod === "icloud" ? " (→ iCloud)" : ""}
  API keys:   ${IS_MAC ? "macOS Keychain" : IS_LINUX ? "GNOME Keyring" : IS_WIN ? "Credential Manager" : "env vars"} (service: crowkit-mcp)

  Next steps:
  1. Add a git remote:  cd ${wikiPath} && git remote add origin <your-repo-url> && git push -u origin main
  2. Drop files into ${wikiPath}/raw/ and run /ingest
  3. Run /next to see what needs attention
  4. Run /lint to health-check the wiki

  To restore on a new Mac:
    Keys sync via iCloud Keychain automatically (if enabled).
    Re-run: npx crowkit
`);

  rl.close();
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});
