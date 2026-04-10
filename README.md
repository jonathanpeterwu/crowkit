# llm-wiki-setup

One-command setup for a [Karpathy-style LLM wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) with Claude Code integration and iCloud sync.

## What It Does

```
npx llm-wiki-setup
```

1. Creates a three-layer wiki directory (`raw/`, `pages/`, `outputs/`)
2. Generates a `CLAUDE.md` schema that turns Claude Code into a wiki operator
3. Installs a `/next` slash command for reviewing what needs attention
4. Optionally syncs config via iCloud Drive across Macs
5. Initializes a git repo for the wiki content

## The Karpathy Pattern

Three layers:

| Layer | Owner | Purpose |
|-------|-------|---------|
| `raw/` | You | Drop articles, notes, screenshots, PDFs. Immutable. |
| `pages/` | LLM | Wiki pages the LLM creates, updates, cross-links. |
| `outputs/` | LLM | Reports, answers, analysis generated from queries. |

The `CLAUDE.md` schema tells Claude Code how to ingest sources, write pages, cross-link aggressively, and maintain the wiki over time.

## Sync Strategy

| What | Synced via | Why |
|------|-----------|-----|
| Wiki content (`~/wiki/`) | **Git** | Version history, diffs, collaboration |
| Claude config (`CLAUDE.md`, commands) | **iCloud** | Auto-syncs across Macs, no commits needed |

On non-Mac systems, config files are written locally. Copy them manually or use a dotfiles repo.

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
# Clone your wiki
git clone git@github.com:you/your-wiki.git ~/wiki

# Re-run setup (detects existing wiki, creates symlinks)
npx llm-wiki-setup
```

iCloud syncs the Claude config automatically between Macs. The setup tool detects existing files and only creates symlinks.

## Requirements

- Node.js 18+
- Claude Code
- macOS (for iCloud sync — works without it, config is local-only)

## License

MIT
