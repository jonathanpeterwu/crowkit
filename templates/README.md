# Personal LLM Wiki

A Karpathy-style three-layer knowledge base operated by Claude Code.

## Setup on a New Machine

### Step 1: Clone the Wiki

```bash
git clone <your-repo-url> {{WIKI_PATH}}
```

### Step 2: Run Setup

```bash
npx llm-wiki-setup
```

This creates symlinks for CLAUDE.md and the /next command, using iCloud sync on Mac if available.

### Step 3: Verify

```bash
ls {{WIKI_PATH}}/pages/ {{WIKI_PATH}}/raw/
cat ~/CLAUDE.md | head -5
# In Claude Code: /next
```

## Structure

```
wiki/
├── raw/          # Source materials (human-owned, immutable)
├── pages/        # LLM-generated wiki pages
├── outputs/      # Generated reports and analysis
├── index.md      # Page catalog
└── log.md        # Activity log
```

## Usage

- **Add knowledge**: Drop files into `raw/`, ask Claude to "ingest"
- **Query**: Ask Claude a question — it searches `pages/`
- **Review**: Run `/next` for a prioritized punch list
- **Maintain**: Ask Claude to "lint the wiki"
