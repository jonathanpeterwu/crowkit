# crowkit

Portable second brain + Claude Code harness. One command sets up a [Karpathy-style LLM wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) with cross-platform sync, native secret storage, and MCP server config that travels across machines.

> Crows cache food in hundreds of locations and remember every spot. Crowkit does the same with your knowledge.

## Quick Start

```
npx crowkit
```

## What It Does

1. **Auth preflight** — checks GitHub CLI, npm, Claude Code, git config and tells you what's missing
2. Creates a three-layer wiki directory (`raw/`, `pages/`, `outputs/`)
3. Generates a `CLAUDE.md` schema that turns Claude Code into a wiki operator
4. Installs `/next`, `/ingest`, `/lint` skills for wiki operations
5. Optionally syncs config via iCloud Drive across Macs
6. **MCP server setup** — adds MCP servers and stores API keys in macOS Keychain
7. Initializes a git repo for the wiki content

## The Karpathy Pattern

Three layers:

| Layer | Owner | Purpose |
|-------|-------|---------|
| `raw/` | You | Drop articles, notes, screenshots, PDFs. Immutable. |
| `pages/` | LLM | Wiki pages the LLM creates, updates, cross-links. |
| `outputs/` | LLM | Reports, answers, analysis generated from queries. |

The `CLAUDE.md` schema tells Claude Code how to ingest sources, write pages, cross-link aggressively, and maintain the wiki over time.

## Skills

Crowkit installs three skills into `~/.claude/skills/`:

| Skill | What it does |
|-------|-------------|
| `/next` | Punch list: unprocessed sources, lint issues, uncommitted git work |
| `/ingest` | Process new raw sources into wiki pages with cross-linking |
| `/lint` | Health-check: orphans, dead links, stale pages, missing frontmatter |

### Skill Scopes

Skills can live at three levels. Crowkit installs at the user level so they're available everywhere.

| Scope | Path | Reaches |
|-------|------|---------|
| **Project** | `.claude/skills/` (in repo) | This repo only |
| **User** | `~/.claude/skills/` | All repos, this machine |
| **Cloud** (v1.0) | `crowkit sync` | All repos, all machines |

Project skills override user skills with the same name. Add a `.claude/skills/crowkit-next/SKILL.md` to any repo to customize `/next` for that project.

## Sync Strategy

| What | Synced via | Why |
|------|-----------|-----|
| Wiki content (`~/wiki/`) | **Git** | Version history, diffs, collaboration |
| Claude config + skills | **iCloud** | Auto-syncs across Macs, no commits needed |

On non-Mac systems, config files are written locally. Copy them manually or use a dotfiles repo.

## API Key Security

API keys for MCP servers (Resend, WorkLayer, etc.) are **never stored in plain text files**.

| Platform | Storage | Syncs across machines? |
|----------|---------|----------------------|
| macOS | **Keychain** (`security` CLI) | Yes, via iCloud Keychain |
| Linux | Env vars in shell profile | Manual |

On macOS, keys are stored under the service name `crowkit-mcp` in Keychain. If you have iCloud Keychain enabled, they sync automatically to your other Macs.

```bash
# View stored keys
security find-generic-password -s "crowkit-mcp" -a "RESEND_API_KEY" -w

# Delete a key
security delete-generic-password -s "crowkit-mcp" -a "RESEND_API_KEY"
```

The setup tool prompts for keys interactively and stores them — they never touch git or config files.

## Auto-Capture Hook

The wiki repo includes a `SessionEnd` hook that automatically commits and pushes wiki changes when a Claude Code session ends. This travels with the wiki via git — no extra config on new machines.

```
~/wiki/.claude/
├── settings.json          # Hook config (project-level, portable via git)
└── hooks/
    └── capture.sh         # Auto-commit pages/, outputs/, index.md, log.md
```

**How it works:**
1. Claude Code session ends
2. Hook checks for uncommitted wiki changes
3. If changes exist: stages, commits with timestamp, pushes to remote
4. If offline: commits locally, pushes on next session

The hook never touches `raw/` — only LLM-owned files get auto-committed.

## GitButler (Optional)

The setup wizard offers to install [GitButler](https://gitbutler.com) for virtual branch management. Useful for:
- Keeping wiki changes on a separate virtual branch from code work
- Reviewing wiki diffs independently before pushing
- Managing parallel wiki + code changes without branch switching

## After Setup

```bash
# Push wiki to GitHub
cd ~/wiki
git remote add origin git@github.com:you/your-wiki.git
git push -u origin main

# Start using it
# Drop files into ~/wiki/raw/
# Open Claude Code and ask it to "ingest new sources"
# Run /next to see what needs attention
```

## On a New Machine

```bash
# 1. Clone your wiki
git clone git@github.com:you/your-wiki.git ~/wiki

# 2. Re-run crowkit (detects existing wiki, creates symlinks, restores auth)
npx crowkit
```

What auto-syncs vs. what you re-run:

| Thing | First Mac | Second Mac |
|-------|-----------|------------|
| Wiki content | `git push` | `git clone` |
| CLAUDE.md + commands | auto (iCloud) | re-run `npx crowkit` to create symlinks |
| API keys | auto (iCloud Keychain) | auto if iCloud Keychain enabled, else re-enter |
| MCP server config | crowkit adds them | re-run `npx crowkit` |
| GitHub / npm auth | `gh auth login` / `npm login` | `gh auth login` / `npm login` |

## Platform Support

| Feature | macOS | Linux | WSL | Windows |
|---------|-------|-------|-----|---------|
| Wiki (git) | Yes | Yes | Yes | Yes |
| Skills | Yes | Yes | Yes | Yes |
| CLAUDE.md | Yes | Yes | Yes | Yes |
| Config sync | iCloud | local (v1.0: S3) | local (v1.0: S3) | local (v1.0: S3) |
| Secret storage | Keychain | GNOME Keyring (`secret-tool`) | GNOME Keyring | Credential Manager (`cmdkey`) |
| GitButler | `brew install --cask gitbutler` | AppImage | AppImage | [gitbutler.com](https://gitbutler.com) |
| Auto-capture hook | `.sh` | `.sh` | `.sh` | `.sh` (Git Bash) |

### Requirements

- Node.js 18+
- Claude Code
- git

## Publishing

```bash
npm login
npm publish

# Updates
npm version patch && npm publish && git push --follow-tags
```

## Roadmap

### v0.2 — Skills (done)
- [x] Migrate from legacy `~/.claude/commands/` to `~/.claude/skills/` format with YAML frontmatter
- [x] Ship `/ingest`, `/lint` skills alongside `/next`
- [x] iCloud sync for skills directory
- [x] Auto-capture SessionEnd hook
- [x] GitButler optional onboarding

### v0.3 — Cross-platform (done)
- [x] Linux support with GNOME Keyring (`secret-tool`) for secrets
- [x] Windows support with Credential Manager (`cmdkey`)
- [x] WSL detection
- [x] Symlink fallback to copy on Windows
- [ ] Linux config sync via dotfiles repo fallback

### v1.0 — Crowkit Cloud (paid)
Zero-knowledge encrypted sync that works on any OS — not just Mac.

- [ ] Client-side AES-256-GCM encryption (key derived from user password via PBKDF2, never transmitted)
- [ ] S3 storage for encrypted config, skills, and API keys
- [ ] Thin API layer (Lambda/Workers) for presigned URLs — server never touches plaintext
- [ ] Auth via GitHub OAuth or email magic link
- [ ] Stripe billing
- [ ] `crowkit sync push` / `crowkit sync pull` CLI commands
- [ ] `crowkit sync status` to diff local vs remote

| | Free | Pro |
|---|---|---|
| Wiki sync | Git | Git |
| Config + skills sync | iCloud (Mac only) | Encrypted S3 (any OS) |
| API key sync | iCloud Keychain (Mac only) | Encrypted S3 (any OS) |
| Platforms | macOS | macOS + Linux + WSL |

## Contributing

1. Fork the repo
2. Create a branch (`git checkout -b my-feature`)
3. Commit changes (`git commit -m "Add feature"`)
4. Push (`git push origin my-feature`)
5. Open a PR

## License

MIT + [Commons Clause](https://commonsclause.com/). Free to use, modify, and distribute. You may not sell crowkit or offer it as a paid service.
