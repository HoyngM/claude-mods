# claude-mods

Mods for Claude Code, one folder per mod.

## Install

Type this at the prompt of a terminal Claude Code session, answer `y` to add the marketplace, then pick a scope:

```
/plugin install git-graph --marketplace HoyngM/claude-mods
/plugin install job-search-panel --marketplace HoyngM/claude-mods
/plugin install thesis-progress-tracker --marketplace HoyngM/claude-mods
```

## Mods

| Mod | What it does |
| --- | --- |
| [git-graph](git-graph) | Side pane with the repo name, current branch with ahead/behind arrows, where main is, and the four latest updates. Refreshes after every git command Claude runs. |
| [job-search-panel](job-search-panel) | Small status pane with live progress while `/scrape`, `/rank` and `/refresh` run; it closes when the dashboard artifact opens. `/jobs` opens a pane with the top high and medium matches and Scrape, Rank, Dashboard and Reload list buttons. `/refresh` updates the job dashboard artifact. Needs the ai-job-search repo. |
| [thesis-progress-tracker](thesis-progress-tracker) | In sessions whose folder path contains "thesis", Claude files short dated notes (scope, limitations, future work, method choices, results) under the matching section of a markdown copy of the JADS thesis structure, then commits and pushes it. A pane lists what was added or removed and closes after 10 seconds. Needs a clone of the author's private `HoyngM/Thesis` repo at `~/Developer/Thesis`; change `REPO` and the clone URL in `hooks/register.tsx` to use your own. |
