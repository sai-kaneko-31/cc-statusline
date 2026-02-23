# cc-statusline

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) statusline command with Nerd Font icons, clickable PR links, and a context window bar.

```
📂 ~/git/my-project  🔀 feature/auth #42 ✅  🚀 ↑2 +15/-3
🔲 Opus 4.6          ❤️ [████████░░]53%     🕐 2026/02/23 14:30:00
```

## Features

| Feature | Description |
|---------|-------------|
| Nerd Font icons | Model-specific icons (Opus ``, Sonnet ``, Haiku ``) |
| OSC8 PR links | Ctrl+Click to open PR in browser (BEL terminator) |
| Context window bar | Context window remaining until auto-compact (85%), color-coded |
| Git stats | Branch, ahead/behind, insertions/deletions |
| 3-column alignment | Path/model, branch+PR/context window bar, stats/time |
| Colleague comments | Optional LLM-generated contextual comments (3rd line) |

## Requirements

- [Nerd Font](https://www.nerdfonts.com/) (terminal font)
- [GitHub CLI](https://cli.github.com/) (`gh`) for PR links
- Node.js >= 18

## Setup

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y sai-kaneko-31/cc-statusline"
  }
}
```

## Layout

```
Line 1: 📂 <path>         🔀 <branch> <#PR> <review>  🚀 <ahead/behind> <+added/-deleted>
Line 2: 🔲 <model>        ❤️ [<bar>]<remaining>%       🕐 <time>
         ───col1───        ─────col2─────                ───col3───
```

### Column details

| Column | Line 1 | Line 2 |
|--------|--------|--------|
| col1 | Working directory (`~` substituted) | Model name with icon |
| col2 | Branch + clickable PR number + review status | Context window bar (remaining %) |
| col3 | Ahead/behind + diff stats | Current time |

### PR review status icons

| reviewDecision | Icon | Color | Meaning |
|----------------|------|-------|---------|
| `APPROVED` | `` (check) | Green | PR approved |
| `CHANGES_REQUESTED` | `` (close) | Red | Changes requested |
| `REVIEW_REQUIRED` | `` (circle-o) | Yellow | Review pending |
| (empty) | — | — | No icon shown |

### Context window bar color

| Remaining | Color | Meaning |
|-----------|-------|---------|
| > 40% | Green | Plenty of context |
| 16-40% | Yellow | Getting low |
| 0-15% | Red | Auto-compact imminent |

## PR link caching

PR data is cached at `~/.claude/cache/pr-<repo-hash>-<branch>.json` with a 5-minute TTL.

Override TTL with environment variable:

```json
{
  "env": {
    "STATUSLINE_PR_CACHE_TTL_MS": "60000"
  }
}
```

### Auto-invalidation hook

Add a PostToolUse hook to auto-invalidate the cache when `gh pr create/merge/close/review` is executed:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "npx -y sai-kaneko-31/cc-statusline --invalidate-cache"
          }
        ]
      }
    ]
  }
}
```

## Colleague comments (optional)

LLM-generated contextual comments displayed as an optional 3rd line. Requires [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude`) installed and authenticated.

Enable by adding `--colleague-instruction` to the command:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y sai-kaneko-31/cc-statusline --colleague-instruction 'Your persona instruction here'"
  }
}
```

Example — an enthusiastic お嬢様 colleague:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y sai-kaneko-31/cc-statusline --colleague-instruction 'テンションが高いお嬢様。'"
  }
}
```

```
📂 ~/git/my-project  🔀 main  🚀 +121/-43
🔲 Opus 4.6          ❤️ [████████░░]53%     🕐 2026/02/23 14:30:00
💬 あら、README.mdをお仕上げですか～！本当にお見事な整理力ですわね～！
```

Comments are cached at `~/.claude/cache/statusline-comment-<repo-hash>.json` (5 min TTL) and generated in the background via `claude -p`.

| Variable | Default | Description |
|----------|---------|-------------|
| `STATUSLINE_COMMENT_MODEL` | `haiku` | Model for comment generation |
| `STATUSLINE_COMMENT_TTL_MS` | `300000` (5 min) | Comment cache TTL |
| `STATUSLINE_COMMENT_HISTORY_SIZE` | `5` | Previous comments tracked for dedup |
| `STATUSLINE_THEME` | `default` | Color theme: `default`, `light`, `minimal`, `dracula` |

## Themes

Switch color schemes via `STATUSLINE_THEME` environment variable:

| Theme | Description |
|-------|-------------|
| `default` | Bold ANSI colors (original) |
| `light` | Non-bold colors + bright black dim — optimized for light backgrounds |
| `minimal` | White/gray with red danger bar only |
| `dracula` | 256-color palette (purple model, orange warning, muted dim) |

```json
{
  "env": {
    "STATUSLINE_THEME": "dracula"
  }
}
```

Unknown theme names fall back to `default`.

## Acknowledgments

Inspired by [him0/claude-code-statusline](https://github.com/him0/claude-code-statusline) and [this article](https://zenn.dev/him0/articles/f1215cea2c715e).

## License

MIT
