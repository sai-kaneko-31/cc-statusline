# cc-statusline

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) statusline command with emoji icons, a context window bar, and rate limit usage.

```
📂 ~/git/my-project  🌿 feature/auth     🚀 ↑2 +15/-3   📝 add OAuth callback
🎼 Opus 5 (high)     💗 [████████░░]53%  📊 5h 32% 7d 68%
```

## Features

| Feature | Description |
|---------|-------------|
| Emoji icons | Model-specific icons (Opus 🎼, Sonnet 📜, Haiku 🍃); no special font or terminal setting |
| Context window bar | Context window remaining until auto-compact (85%), color-coded |
| Rate limit usage | 5-hour and 7-day window usage, from `rate_limits`; dropped on a narrow terminal |
| Git stats | Branch, ahead/behind, insertions/deletions |
| Worktree and session | Worktree name in place of the path, session name on line 1 |
| 3-column alignment | Path/model, branch/context window bar, stats/rate limits |
| Colleague comments | Optional LLM-generated contextual comments (3rd line) |

## Requirements

- A terminal and font that draw emoji. Every icon is an `Emoji_Presentation` code point other than a regional indicator, which Unicode makes East Asian Wide, so terminals give it two cells without any setting, and Claude Code's own renderer counts it two as well.
- Leave the East Asian Ambiguous class at one cell: do not set, for example, Windows Terminal's `"compatibility.ambiguousWidth": "wide"` ([schema](https://github.com/microsoft/terminal/blob/main/doc/cascadia/profiles.schema.json), under `Globals`). The layout counts the Ambiguous code points it draws — the bar's `█`, the ahead/behind arrows, the truncation ellipsis — as one cell, so a full bar would draw ten cells wider than the arithmetic reserved.
- Node.js >= 18

### Why not Nerd Font icons

The icons were Nerd Font glyphs until September 2026. They sit in the private use area, which Unicode calls Ambiguous, and Claude Code places Ambiguous code points in one cell: 2.1.280 measures text with `Bun.stringWidth` and its cell segmenter, both given `ambiguousIsNarrow: true`, with no setting to change it. Widening them to two in the terminal (WezTerm's `cell_widths`) put the terminal out of step with Claude Code's cell grid. Observed on WezTerm `20260812-070121-fe3006ae` with `"tui": "fullscreen"`: selecting the status line with the mouse shifted it sideways, and `Ctrl+L` redrew it. [anthropics/claude-code#67456](https://github.com/anthropics/claude-code/issues/67456) reports the same drift for plane 15 glyphs; it was closed as NOT_PLANNED after going inactive. Leaving them at one cell lets a glyph wider than a cell spill over the space after it — measured on U+F07C, Cica draws 1.57 cells of ink and Bizin Gothic NF 2.10. Emoji are two cells in both places, so neither happens. A `cell_widths` entry added for the old icons is no longer needed, and `STATUSLINE_ICON_CELLS` is no longer read.

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
Line 2: 🔲 <model> (<effort>)  ❤️ [<bar>]<remaining>%  📊 5h <n>% 7d <n>%
         ───col1───        ─────col2─────                ───col3───
```

### Column details

| Column | Line 1 | Line 2 |
|--------|--------|--------|
| col1 | Working directory (`~` substituted), or the worktree name | Model name with icon and effort level |
| col2 | Branch | Context window bar (remaining %) |
| col3 | Ahead/behind + diff stats, then the session name | Rate limit usage |

Every segment past the branch is optional and simply absent when Claude Code does not send the field. The session name is also dropped when line 1 would otherwise run past the terminal edge.

### Rate limit usage

`rate_limits.five_hour` and `rate_limits.seven_day` render as `5h <n>% 7d <n>%`. Claude Code sends them to claude.ai Pro and Max subscribers after the first API response, and drops each window once its `resets_at` passes, so either half can be missing.

On a terminal too narrow to hold the columns and the whole tail, line 2 drops the rate limits, keeping the context bar. Line 1's tail (ahead/behind and diff stats) is not optional, so a long branch name with large diff stats can still run past the edge on a narrow terminal. The width at which it stops overflowing is everything line 1 spends outside its two columns — the three icons with their trailing spaces, the two column gaps, and the tail — plus the 30 cells the two columns may shrink to together. A short cwd and branch never reach that floor and fit below these widths. It moves with the digits in the tail: 13 + 18 + 30 = 61 columns for `↑12↓34` and `+1234/-5678`, and 65 for `↑123↓456` and `+12345/-67890`. `MIN_SUPPORTED_COLS` in the tests spells the arithmetic out, including the space the diff stats carry in front of them.

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
🔲 Opus 5 (high)     ❤️ [████████░░]53%
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
