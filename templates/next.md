Review what to do next across the wiki and active projects. Follow this checklist:

1. **Wiki health** — Check `{{WIKI_PATH}}/raw/` for unprocessed files that haven't been ingested into `pages/`. List any new raw sources found.

2. **Wiki lint** — Quick scan of `{{WIKI_PATH}}/pages/`:
   - Orphan pages (not in `index.md`)
   - Pages with no "See Also" links
   - Pages not updated in 30+ days that reference fast-moving topics
   - Missing pages (links pointing to non-existent files)

3. **Recent log** — Read the last 10 entries of `{{WIKI_PATH}}/log.md` to show recent activity.

4. **Git activity** — For each project in `~/Dev/`, check `git status` and `git log --oneline -3` to surface uncommitted work or recent changes.

5. **Produce a punch list** — Summarize as a prioritized TODO:
   - Raw sources to ingest (high)
   - Wiki pages to create or update (medium)
   - Lint issues to fix (low)
   - Active project branches with uncommitted work (flag)

Keep the output concise — a scannable list, not paragraphs.
