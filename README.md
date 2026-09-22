# cc-statusline

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) statusline command with Nerd Font icons, a context window bar, and rate limit usage.

```
📂 ~/git/my-project  🔀 feature/auth     🚀 ↑2 +15/-3   📄 add OAuth callback
🔲 Opus 5 (high)     ❤️ [████████░░]53% 🔥  📊 5h 32% 7d 68%
```

## Features

| Feature | Description |
|---------|-------------|
| Nerd Font icons | Model-specific icons (Opus ``, Sonnet ``, Haiku ``) |
| Context window bar | Context window remaining until auto-compact (85%), color-coded |
| Rate limit usage | 5-hour and 7-day window usage, from `rate_limits`; dropped first on a narrow terminal |
| Prompt cache warmth | Fire / snowflake next to the bar, from `prompt_cache.warm` |
| Git stats | Branch, ahead/behind, insertions/deletions |
| Worktree and session | Worktree name in place of the path, session name on line 1 |
| 3-column alignment | Path/model, branch/context window bar, stats/rate limits |
| Colleague comments | Optional LLM-generated contextual comments (3rd line) |

## Requirements

- A [Nerd Font](https://www.nerdfonts.com/) whose icons advance **two cells**, such as [Cica](https://github.com/miiton/Cica). Width arithmetic assumes that; a font that advances one cell and lets the glyph spill over the next one renders the columns too tight
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

### Refreshing between events

The statusline re-runs only when Claude Code emits an event (new message, `/compact`, mode change). Nothing here is time-based, so no timer is needed. Add `refreshInterval` (seconds) if you want git state to keep up while background subagents work and the main session sits idle:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y sai-kaneko-31/cc-statusline",
    "refreshInterval": 10
  }
}
```

## Layout

```
Line 1: 📂 <path>         🔀 <branch>              🚀 <ahead/behind> <+added/-deleted>   📄 <session>
Line 2: 🔲 <model> (<effort>)  ❤️ [<bar>]<remaining>% <cache>  📊 5h <n>% 7d <n>%
         ───col1───        ─────col2─────                ───col3───
```

### Column details

| Column | Line 1 | Line 2 |
|--------|--------|--------|
| col1 | Working directory (`~` substituted), or the worktree name | Model name with icon and effort level |
| col2 | Branch | Context window bar (remaining %) + cache warmth |
| col3 | Ahead/behind + diff stats, then the session name | Rate limit usage |

Every segment past the branch is optional and simply absent when Claude Code does not send the field. The session name is also dropped when line 1 would otherwise run past the terminal edge.

### Rate limit usage

`rate_limits.five_hour` and `rate_limits.seven_day` render as `5h <n>% 7d <n>%`. Claude Code sends them to claude.ai Pro and Max subscribers after the first API response, and drops each window once its `resets_at` passes, so either half can be missing.

On a terminal too narrow to hold the columns and the whole tail, line 2 drops the rate limits first and then the cache icon, keeping the context bar. Line 1's tail (ahead/behind and diff stats) is not optional, so a long branch name with large diff stats can still run past the edge below 61 columns.

### Prompt cache warmth

`prompt_cache.warm` renders next to the context bar: `` (fire) while the cache is warm, `` (snowflake) once it goes cold and the next request has to re-send the conversation.

### Context window bar color

| Remaining | Color | Meaning |
|-----------|-------|---------|
| > 40% | Green | Plenty of context |
| 16-40% | Yellow | Getting low |
| 0-15% | Red | Auto-compact imminent |

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
📂 ~/git/my-project  🔀 main             🚀 +121/-43
🔲 Opus 5 (high)     ❤️ [████████░░]53% 🔥
💬 あら、README の表を全部組み直していますわね～！
```

Comments are cached at `~/.claude/cache/statusline-comment-<repo-hash>.json` (5 min TTL) and generated in the background via `claude -p`. The prompt sees the session name, recent commit subjects, uncommitted files, branch, worktree, diff size, session duration, and — only once they matter — a low context window, a cold cache, and rate limit usage past 70%. It asks for one sentence about one of those details.

| Variable | Default | Description |
|----------|---------|-------------|
| `STATUSLINE_COMMENT_MODEL` | `sonnet` | Model for comment generation |
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
