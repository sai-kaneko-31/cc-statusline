# cc-statusline

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) statusline command with Nerd Font icons, clickable PR links, and a context window HP bar.

```
 ~/git/my-project   feature/auth #42   ↑2 +15/-3
 Opus 4.6            [████████░░]53%    2026/02/23 14:30:00
```

## Features

| Feature | Description |
|---------|-------------|
| Nerd Font icons | Model-specific icons (Opus , Sonnet , Haiku ) |
| OSC8 PR links | Ctrl+Click to open PR in browser (BEL terminator) |
| HP bar | Context window remaining until auto-compact (85%), color-coded |
| Git stats | Branch, ahead/behind, insertions/deletions |
| 3-column alignment | Path/model, branch+PR/HP bar, stats/time |

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
Line 1:  <path>          <branch> <#PR>   <rocket> <ahead/behind> <+added/-deleted>
Line 2:  <model>         <heart> [<bar>]<remaining>%              <clock> <time>
         ───col1───       ─────col2─────                           ───col3───
```

### Column details

| Column | Line 1 | Line 2 |
|--------|--------|--------|
| col1 | Working directory (`~` substituted) | Model name with icon |
| col2 | Branch + clickable PR number | HP bar (remaining context %) |
| col3 | Ahead/behind + diff stats | Current time |

### HP bar color

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

Add a PostToolUse hook to auto-invalidate the cache when `gh pr create/merge/close` is executed:

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

## Acknowledgments

Inspired by [him0/claude-code-statusline](https://github.com/him0/claude-code-statusline) and [this article](https://zenn.dev/him0/articles/f1215cea2c715e).

## License

MIT
