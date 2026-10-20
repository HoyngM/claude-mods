# claude-mods

Mods for Claude Code, one folder per mod.

## Install

Type this at the prompt of a terminal Claude Code session, answer `y` to add the marketplace, then pick a scope:

```
/plugin install git-graph --marketplace HoyngM/claude-mods
/plugin install job-search-panel --marketplace HoyngM/claude-mods
```

## Mods

| Mod | What it does |
| --- | --- |
| [git-graph](git-graph) | Side pane with the repo name, current branch with ahead/behind arrows, where main is, and the four latest updates. Refreshes after every git command Claude runs. |
| [job-search-panel](job-search-panel) | Side pane with Scrape, Rank and Refresh buttons and the top high and medium matches from `job_scraper/seen_jobs.json`. Needs the ai-job-search repo (`/scrape`, `/rank`); open it with `/jobs`. |
