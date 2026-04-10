# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this workspace.

## LLM Wiki (Karpathy Pattern)

You are the sole author of this wiki. The human curates raw sources and refines this schema. You write, update, and maintain all pages. Never ask permission to create or update a wiki page — just do it.

### Three Layers

| Layer | Path | Owner | Rule |
|-------|------|-------|------|
| Raw Sources | `{{WIKI_PATH}}/raw/` | Human | Immutable. You read, never modify. |
| Wiki Pages | `{{WIKI_PATH}}/pages/` | LLM | You own this entirely. Create, update, merge, split, delete freely. |
| Outputs | `{{WIKI_PATH}}/outputs/` | LLM | Generated reports and analysis. Named by date + topic. |

### Navigation Files
- `{{WIKI_PATH}}/index.md` — category-organized catalog of all pages. Keep in sync.
- `{{WIKI_PATH}}/log.md` — append-only. Every ingest, query, lint, and page change gets a timestamped entry.

### Page Format

Every page in `pages/` must use this structure:

```markdown
---
title: Page Title
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2]
sources: [raw/filename.md]
---

One-paragraph summary.

## Content sections...

## See Also
- [Related Page](related-page.md)
```

### Page Types

- **Entity pages** — a person, company, tool, service, API
- **Concept pages** — a pattern, technique, idea
- **Comparison pages** — side-by-side evaluation (use `vs` in name)
- **Decision pages** — a choice made and why (prefix `decision-`)
- **Summary pages** — condensed source (prefix `summary-`)

### Operations

**Ingest** (when raw sources are added or the human says "ingest"):
1. Read every new/unprocessed file in `raw/`
2. Extract entities, concepts, facts, decisions
3. Create new pages or merge into existing — don't duplicate. If a page exists, update it.
4. Aggressively cross-link. When creating a new page, add backlinks to existing related pages.
5. Update `index.md` and append to `log.md`

**Query** (when the human asks a question):
1. Search `pages/` for relevant content
2. Synthesize — cite page names inline
3. If the question reveals a wiki gap, create the missing page
4. For non-trivial answers, save to `outputs/` and note in `log.md`

**Lint** (periodically or when asked):
1. Orphan check: pages not in `index.md` or linked from any other page
2. Stale check: pages whose sources have been updated since the page's `updated` date
3. Contradiction check: conflicting claims across pages
4. Dead link check: links to non-existent pages
5. Fix what you can, flag what needs human input, append to `log.md`

### Writing Rules

- **Density over length.** Every sentence carries information. No filler.
- **Prefer tables and bullets** over prose for structured data.
- **Be specific.** Concrete facts, not vague descriptions.
- **Attribute claims.** Link to the raw source.
- **Timestamps matter.** Note when time-sensitive info was accurate.
- **Merge, don't duplicate.** Grep `pages/` before creating. 60%+ overlap = merge.
- **One concept per page.** Split pages beyond ~300 lines.

### Cross-Linking Strategy

- Every entity mentioned that has its own page gets linked (first mention per section)
- Decision pages link to affected entity/concept pages
- Comparison pages link to both sides
- "See Also" at bottom of every page with 2-5 related pages
- On new page creation, reverse-scan and update pages that should link back

### Naming Conventions

- Files: `kebab-case.md` — topic-first (e.g., `postgres-connection-pooling.md`)
- Decisions: `decision-*.md`
- Summaries: `summary-*.md`
- Comparisons: `*-vs-*.md`

## Conventions

- When working inside a project repo, respect that project's own CLAUDE.md if it exists.
- The wiki at `{{WIKI_PATH}}/` is a shared knowledge layer across all projects.
- When you learn something non-obvious while working in a project, create or update a wiki page.
- If the human shares content not already in `raw/`, save it there first, then ingest.
