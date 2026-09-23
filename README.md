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

- A terminal that advances [Nerd Font](https://www.nerdfonts.com/) icons **two cells**, and a font whose icon glyphs fit inside two, such as [Cica](https://github.com/miiton/Cica). That is what the width arithmetic assumes by default. The advance is the terminal's call, not the font's — the font only decides whether the glyph fits the space it is given. Measured on U+F07C, Cica draws 1.57 cells of ink and Bizin Gothic NF draws 2.10, so Bizin spills into the next cell at either advance, which hides the space after each icon and makes the columns look cramped. On a terminal that cannot be told to advance two, set `STATUSLINE_ICON_CELLS=1` and the layout reserves one instead.

  Check a terminal in one line. The escapes spell U+F07C, the folder icon, in
  octal so that any POSIX shell prints it. The `|` on the first line stands in
  the same column as the one on the third line when icons take two cells, and
  as the one on the second line when they take one:

  ```sh
  printf '\357\201\274|\nA|\nAA|\n'
  ```

  What to set, as of September 2026. Each terminal's own documentation is the
  current answer; the line above is how you confirm it on the machine in front
  of you.

  | Terminal | What to set |
  |---|---|
  | [WezTerm](https://wezterm.org/config/lua/config/cell_widths.html) | `cell_widths = { { first = 0xe000, last = 0xf8ff, width = 2 }, { first = 0xf0000, last = 0xffffd, width = 2 }, { first = 0x100000, last = 0x10fffd, width = 2 } }`. The option is marked "Since: Nightly Builds Only", so on a build without it the icons stay one cell — run the check above before believing the config took. Measured on `20260812-070121-fe3006ae`: reloading the config moves a font change into tabs that are already open but not a `cell_widths` change, so open a new tab |
  | Windows Terminal | Nothing to set, and **do not** set `"compatibility.ambiguousWidth": "wide"` ([schema](https://github.com/microsoft/terminal/blob/main/doc/cascadia/profiles.schema.json), under `Globals`). It widens every East Asian Ambiguous code point rather than the private use area alone, and the layout counts the other Ambiguous ones — the bar's `█`, the ahead/behind arrows, the truncation ellipsis — as one cell. A full bar then draws ten cells wider than the arithmetic reserved. Use `STATUSLINE_ICON_CELLS=1` instead |
  | [Ghostty](https://ghostty.org/docs/config/reference) | Nothing can be set: it has no option for the advance, and `adjust-icon-height` only changes how the glyph is drawn. Icons stay one cell, so set `STATUSLINE_ICON_CELLS=1` instead |
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

On a terminal too narrow to hold the columns and the whole tail, line 2 drops the rate limits first and then the cache icon, keeping the context bar. Line 1's tail (ahead/behind and diff stats) is not optional, so a long branch name with large diff stats can still run past the edge on a narrow terminal. The floor is everything line 1 spends outside its two columns — the three icons with their trailing spaces, the two column gaps, and the tail — plus the columns' own floor of 30. It moves with the digits in the tail: 13 + 18 + 30 = 61 columns for `↑12↓34` and `+1234/-5678`, and 65 for `↑123↓456` and `+12345/-67890`. `MIN_SUPPORTED_COLS` in the tests spells the arithmetic out, including the space the diff stats carry in front of them.

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
| `STATUSLINE_ICON_CELLS` | `2` | Set to `1` for a terminal that advances Nerd Font icons one cell (see Requirements). Any other value keeps two |

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
