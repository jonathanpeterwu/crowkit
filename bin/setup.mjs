#!/usr/bin/env node

import {
  existsSync, mkdirSync, writeFileSync, readFileSync,
  symlinkSync, unlinkSync, copyFileSync
} from "fs";
import { join, dirname } from "path";
import { homedir, platform } from "os";
import { execSync, execFileSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

// ── Constants ──

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const TEMPLATES = join(__dirname, "..", "templates");
const PLATFORM = platform();
const IS_MAC = PLATFORM === "darwin";
const IS_WIN = PLATFORM === "win32";
const IS_LINUX = PLATFORM === "linux";
const SERVICE_NAME = "crowkit-mcp";
const SYNC_ICLOUD = "icloud";
const SYNC_LOCAL = "local";

const STORE_NAMES = {
  darwin: "macOS Keychain",
  linux: "GNOME Keyring",
  win32: "Credential Manager",
};

const IS_WSL = IS_LINUX && (() => {
  try {
    return readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft");
  } catch { return false; }
})();

const HAS_SECRET_TOOL = IS_LINUX && (() => {
  try { execFileSync("which", ["secret-tool"], { stdio: "pipe" }); return true; }
  catch { return false; }
})();

const ICLOUD_BASE = join(HOME, "Library", "Mobile Documents", "com~apple~CloudDocs");

const PKG = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

// ── Helpers ──

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question, fallback) {
  return new Promise((resolve) => {
    const prompt = fallback ? `${question} [${fallback}]: ` : `${question}: `;
    rl.question(prompt, (answer) => resolve(answer.trim() || fallback || ""));
  });
}

function isYes(answer) { return answer.toLowerCase() === "y"; }

function log(msg) { console.log(`\x1b[32m✓\x1b[0m ${msg}`); }
function warn(msg) { console.log(`\x1b[33m!\x1b[0m ${msg}`); }
function err(msg) { console.log(`\x1b[31m✗\x1b[0m ${msg}`); }
function heading(msg) { console.log(`\n\x1b[1m${msg}\x1b[0m`); }

function cmd(command) {
  try { return execSync(command, { encoding: "utf-8", stdio: "pipe" }).trim(); }
  catch { return null; }
}

function safeSymlink(target, linkPath) {
  if (existsSync(linkPath)) unlinkSync(linkPath);
  try { symlinkSync(target, linkPath); }
  catch {
    warn(`Symlink failed, copying instead: ${linkPath}`);
    copyFileSync(target, linkPath);
  }
}

function templateContent(name, replacements) {
  let content = readFileSync(join(TEMPLATES, name), "utf-8");
  for (const [key, val] of Object.entries(replacements)) {
    content = content.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), val);
  }
  return content;
}

function installSkill(skill, wikiPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const content = templateContent(join("skills", skill, "SKILL.md"), { "{{WIKI_PATH}}": wikiPath });
  writeFileSync(join(destDir, "SKILL.md"), content);
}

// ── Credential store (shell-injection-safe) ──

function secretSet(account, password) {
  try {
    if (IS_MAC) {
      execFileSync("security", [
        "add-generic-password", "-U",
        "-s", SERVICE_NAME, "-a", account, "-w", password
      ], { stdio: "pipe" });
      return "keychain";
    }
    if (HAS_SECRET_TOOL) {
      const result = spawnSync("secret-tool", [
        "store", `--label=${SERVICE_NAME}:${account}`,
        "service", SERVICE_NAME, "account", account
      ], { input: password, stdio: ["pipe", "pipe", "pipe"] });
      if (result.status === 0) return "gnome-keyring";
    }
    if (IS_WIN) {
      execFileSync("cmdkey", [
        `/generic:${SERVICE_NAME}:${account}`,
        `/user:${account}`,
        `/pass:${password}`
      ], { stdio: "pipe" });
      return "credential-manager";
    }
  } catch { /* fall through */ }
  return false;
}

function secretGet(account) {
  try {
    if (IS_MAC) {
      return execFileSync("security", [
        "find-generic-password", "-s", SERVICE_NAME, "-a", account, "-w"
      ], { encoding: "utf-8", stdio: "pipe" }).trim();
    }
    if (HAS_SECRET_TOOL) {
      return execFileSync("secret-tool", [
        "lookup", "service", SERVICE_NAME, "account", account
      ], { encoding: "utf-8", stdio: "pipe" }).trim();
    }
  } catch { /* not found */ }
  return null;
}

// ── Auth checks ──

function checkTool({ name, testCmd, loginCmd, loginNote }) {
  const result = cmd(testCmd);
  if (result) return { name, ok: true, detail: result.split("\n")[0] };
  return { name, ok: false, loginCmd, loginNote };
}

async function runAuthChecks() {
  heading("Auth Preflight");

  const checks = [
    checkTool({ name: "GitHub CLI", testCmd: "gh auth status 2>&1", loginCmd: "gh auth login", loginNote: "Required to push wiki repo" }),
    checkTool({ name: "npm", testCmd: "npm whoami 2>&1", loginCmd: "npm login", loginNote: "Required to publish packages" }),
    checkTool({ name: "Claude Code", testCmd: "claude --version 2>&1", loginCmd: "npm install -g @anthropic-ai/claude-code", loginNote: "Required to use the wiki" }),
    checkTool({ name: "git user", testCmd: "git config user.email 2>&1", loginCmd: 'git config --global user.email "you@example.com"', loginNote: "Required for commits" }),
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
  return allGood;
}

// ── MCP server setup ──

async function setupMcpKeys() {
  heading("MCP Server API Keys");
  console.log(`  API keys stored in: ${STORE_NAMES[PLATFORM] || "env vars"}\n`);

  const claudeJson = join(HOME, ".claude.json");
  if (existsSync(claudeJson)) {
    const config = JSON.parse(readFileSync(claudeJson, "utf-8"));
    const existing = Object.keys(config.mcpServers || {});
    if (existing.length > 0) log(`Found existing MCP servers: ${existing.join(", ")}`);
  }

  while (true) {
    const name = await ask("MCP server name (or 'done' to skip)", "done");
    if (name === "done") break;

    const url = await ask(`  ${name} URL`);
    const needsKey = isYes(await ask(`  Does ${name} need an API key? (y/n)`, "n"));

    let envFlag = [];
    if (needsKey) {
      const keyName = await ask(`  Env var name (e.g., RESEND_API_KEY)`);
      let keyValue = secretGet(keyName);

      if (keyValue) {
        log(`  Found existing key for ${keyName} in credential store`);
      } else {
        keyValue = await ask(`  API key value (stored securely, not in files)`);
        const stored = secretSet(keyName, keyValue);
        if (stored) {
          log(`  Stored ${keyName} in ${stored}`);
        } else {
          warn(`  No native credential store. Add to shell profile: export ${keyName}="***"`);
        }
      }
      envFlag = ["-e", `${keyName}=${keyValue}`];
    }

    try {
      execFileSync("claude", [
        "mcp", "add", "--transport", "http", name, url, "-s", "user", ...envFlag
      ], { stdio: "pipe" });
      log(`  Added ${name} MCP server`);
    } catch {
      warn(`  Could not add ${name} via CLI. Add manually: claude mcp add --transport http ${name} ${url} -s user`);
    }
  }
}

// ── Main ──

async function main() {
  console.log(`
╔══════════════════════════════════════════╗
║            crowkit v${PKG.version.padEnd(24)}║
║   LLM Wiki + Claude Code Harness        ║
╚══════════════════════════════════════════╝
`);

  const allGood = await runAuthChecks();
  if (!allGood) {
    if (!isYes(await ask("\nSome tools are not authenticated. Continue anyway? (y/n)", "y"))) {
      console.log("\nFix auth issues above, then re-run: npx crowkit");
      rl.close();
      return;
    }
  }

  heading("Step 1: Wiki Location");
  const wikiPath = await ask("Where should the wiki live?", join(HOME, "wiki"));

  heading("Step 2: Claude Config Sync");
  let syncMethod = SYNC_LOCAL;

  if (IS_MAC && existsSync(ICLOUD_BASE)) {
    if (isYes(await ask("iCloud Drive detected. Use it to sync Claude config across Macs? (y/n)", "y"))) {
      syncMethod = SYNC_ICLOUD;
    }
  } else if (IS_MAC) {
    warn("iCloud Drive not found. Config will be local-only.");
  } else if (IS_WSL || IS_LINUX || IS_WIN) {
    warn(`${IS_WSL ? "WSL" : IS_WIN ? "Windows" : "Linux"} detected. Config will be local-only. Use 'crowkit sync' (v1.0) for cross-machine sync.`);
  } else {
    warn("Config will be local-only.");
  }

  heading("Step 3: Creating Wiki");

  for (const dir of ["raw", "pages", "outputs"]) {
    const p = join(wikiPath, dir);
    if (!existsSync(p)) {
      mkdirSync(p, { recursive: true });
      writeFileSync(join(p, ".gitkeep"), "");
    }
  }

  if (!existsSync(join(wikiPath, "index.md"))) {
    writeFileSync(join(wikiPath, "index.md"), templateContent("index.md", {}));
    log("Created index.md");
  }
  if (!existsSync(join(wikiPath, "log.md"))) {
    writeFileSync(join(wikiPath, "log.md"), templateContent("log.md", { "{{DATE}}": new Date().toISOString().split("T")[0] }));
    log("Created log.md");
  }
  log(`Wiki created at ${wikiPath}`);

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

  heading("Step 5: Claude Code Config");

  const claudeMdContent = templateContent("CLAUDE.md", { "{{WIKI_PATH}}": wikiPath });
  const skills = ["crowkit-next", "crowkit-ingest", "crowkit-lint"];

  if (syncMethod === SYNC_ICLOUD) {
    const configDir = join(ICLOUD_BASE, "claude-config");
    const skillsDir = join(configDir, "skills");

    writeFileSync(join(configDir, "CLAUDE.md"), claudeMdContent);
    mkdirSync(configDir, { recursive: true });
    safeSymlink(join(configDir, "CLAUDE.md"), join(HOME, "CLAUDE.md"));

    for (const skill of skills) {
      const icloudDir = join(skillsDir, skill);
      const localDir = join(HOME, ".claude", "skills", skill);
      installSkill(skill, wikiPath, icloudDir);
      mkdirSync(dirname(localDir), { recursive: true });
      safeSymlink(icloudDir, localDir);
      log(`Installed skill: /${skill.replace("crowkit-", "")}`);
    }
    log("Config stored in iCloud, symlinked to local paths");
    warn("On other Macs, re-run this tool to create symlinks");
  } else {
    writeFileSync(join(HOME, "CLAUDE.md"), claudeMdContent);
    for (const skill of skills) {
      const localDir = join(HOME, ".claude", "skills", skill);
      installSkill(skill, wikiPath, localDir);
      log(`Installed skill: /${skill.replace("crowkit-", "")}`);
    }
    log("Config written locally");
  }

  if (!existsSync(join(wikiPath, "README.md"))) {
    writeFileSync(join(wikiPath, "README.md"), templateContent("README.md", {
      "{{WIKI_PATH}}": wikiPath, "{{SYNC_METHOD}}": syncMethod
    }));
    log("Created README.md");
  }

  if (isYes(await ask("Set up MCP servers and API keys? (y/n)", "y"))) {
    await setupMcpKeys();
  }

  heading("Step 8: Optional Tools");

  if (cmd("which gitbutler-cli") || cmd("which gitbutler")) {
    log("GitButler detected");
  } else if (isYes(await ask("Install GitButler for virtual branch management? (y/n)", "n"))) {
    if (IS_MAC) {
      try { execSync("brew install --cask gitbutler", { stdio: "inherit" }); log("GitButler installed"); }
      catch { warn("Could not install GitButler. Get it at https://gitbutler.com"); }
    } else {
      console.log("    Download: https://gitbutler.com");
    }
  }

  heading("Step 9: Git Commit");
  try {
    execSync("git add -A", { cwd: wikiPath, stdio: "pipe" });
    const status = execSync("git status --porcelain", { cwd: wikiPath, encoding: "utf-8" });
    if (status.trim()) {
      execSync('git commit -m "Initialize LLM wiki (Karpathy pattern)"', { cwd: wikiPath, stdio: "pipe" });
      log("Initial commit created");
    }
  } catch {
    warn("Skipped commit (may need git user config)");
  }

  const storeName = STORE_NAMES[PLATFORM] || "env vars";
  heading("Done!");
  console.log(`
  Wiki:       ${wikiPath}
  CLAUDE.md:  ${join(HOME, "CLAUDE.md")}${syncMethod === SYNC_ICLOUD ? " (→ iCloud)" : ""}
  Skills:     /next, /ingest, /lint${syncMethod === SYNC_ICLOUD ? " (→ iCloud)" : ""}
  API keys:   ${storeName} (service: ${SERVICE_NAME})

  Next steps:
  1. Add a git remote:  cd ${wikiPath} && git remote add origin <your-repo-url> && git push -u origin main
  2. Drop files into ${wikiPath}/raw/ and run /ingest
  3. Run /next to see what needs attention
  4. Run /lint to health-check the wiki

  Re-run on any machine: npx crowkit
`);

  rl.close();
}

main().catch((e) => {
  err(e.message);
  rl.close();
  process.exit(1);
});
