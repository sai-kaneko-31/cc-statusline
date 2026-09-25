# cc-statusline

Claude Code statusline command (Node.js CLI, zero dependencies).

## Architecture

- Entry point: `index.js`; `lib/widths.js` holds the icons, the two-cell ranges and `visualWidth`. Copying `index.js` on its own leaves it unable to resolve that require
- Reads JSON from stdin, outputs ANSI-colored 2-line status to stdout
- Two modes: statusline (default) and `--generate-comment` (background LLM comment generation)
- Modules: child_process, fs, path, os, crypto (all Node.js built-in)

## Commands

```bash
npm install           # Install dev dependencies (first time only)
npm test              # Run tests (node:test)
npm run lint          # ESLint check
npm run lint:fix      # ESLint auto-fix

# Manual test
echo '{"cwd":"/tmp","model":{"display_name":"Opus 4.6"},"context_window":{"used_percentage":30}}' | node index.js

# Test inside a git repo (shows branch info)
echo "{\"cwd\":\"$(pwd)\",\"model\":{\"display_name\":\"Opus 4.6\"},\"context_window\":{\"used_percentage\":70}}" | node index.js

# Test rate limits and session name (all optional in stdin). prompt_cache is
# read but not drawn, so it changes nothing here.
echo "{\"cwd\":\"$(pwd)\",\"model\":{\"display_name\":\"Opus 5\"},\"effort\":{\"level\":\"high\"},\"session_name\":\"my task\",\"rate_limits\":{\"five_hour\":{\"used_percentage\":32,\"resets_at\":$(( $(date +%s) + 7200 ))},\"seven_day\":{\"used_percentage\":68,\"resets_at\":$(( $(date +%s) + 259200 ))}},\"prompt_cache\":{\"warm\":true}}" | node index.js

# Test with colleague comment (requires cached comment)
echo "{\"cwd\":\"$(pwd)\",\"model\":{\"display_name\":\"Opus 4.6\"},\"context_window\":{\"used_percentage\":70}}" | node index.js --colleague-instruction 'Be friendly'

# Manual test of claude -p (must unset env vars to avoid recursion inside Claude Code)
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_DISABLE_BACKGROUND_TASKS claude -p 'test prompt' --model haiku
```

## Testing

- Framework: `node:test` (Node.js built-in)
- Test file: `test/statusline.test.js`
- CI: GitHub Actions with Node.js 18/20/22 matrix + `tests` summary job (required status check)
- `node --test` output may not display in Claude Code Bash tool; redirect to file (`1>/tmp/test.txt 2>&1`) then Read

## stdin JSON Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Working directory (used for git info) |
| `model.display_name` | string | No | Model name (parenthetical suffix like "(1M context)" stripped; icon changes for "Opus"/"Sonnet"/"Haiku") |
| `context_window.used_percentage` | number | No | Context usage percentage (used for context window bar) |
| `cost.total_cost_usd` | number | No | Session total cost in USD (used in colleague comments) |
| `cost.total_duration_ms` | number | No | Session total duration in ms (used in colleague comments) |
| `cost.total_lines_added` | number | No | Total lines added in session (used in colleague comments) |
| `cost.total_lines_removed` | number | No | Total lines removed in session (used in colleague comments) |
| `session_id` | string | No | Session ID (used in comment cache key for per-session uniqueness) |
| `effort.level` | string | No | Reasoning effort level (`low`/`medium`/`high`/`xhigh`/`max`); absent if model doesn't support it. Reflects mid-session `/effort` changes |
| `workspace.current_dir` | string | No | Fallback source for `cwd` when `cwd` is absent |
| `session_name` | string | No | Custom (`--name` / `/rename`) or AI-generated session title; shown at the end of line 1. Absent when the session has neither |
| `worktree.name` | string | No | Worktree name; replaces the path in col1. Present only in a Claude Code worktree session, not for `git worktree add` |
| `rate_limits.five_hour.used_percentage` | number | No | 5-hour window usage (0-100). claude.ai Pro/Max only, after the first API response; dropped once `resets_at` passes |
| `rate_limits.seven_day.used_percentage` | number | No | 7-day window usage (0-100); same availability as `five_hour`, and independently absent |
| `rate_limits.five_hour.resets_at`, `rate_limits.seven_day.resets_at` | number | No | Unix epoch seconds when the window resets; shown as local time next to the usage |
| `prompt_cache.warm` | boolean | No | Whether the prompt cache is within its TTL. Not drawn; it only reaches the colleague comment's prompt as a pressure signal. Absent until the first API response |

`pr.*` is still sent by Claude Code but deliberately unused (see Key Implementation Details).

## Key Implementation Details

- `pr.*` is not displayed: the OSC8 link it justified never worked in a real terminal ([anthropics/claude-code#26356](https://github.com/anthropics/claude-code/issues/26356), closed NOT_PLANNED), and the number and review state were not worth the width. A test asserts the segment stays gone
- Context window bar converts used_percentage to "remaining until 85% (auto-compact threshold)"
- Rate limit usage replaces the clock in col3 of line 2; each window is independently optional, so `windowPct` returns null for anything non-numeric
- Each window's reset renders as local wall-clock time, `5h 25% (17:00) 7d 86% (9/28 10:00)`, not a countdown: the status line redraws only on Claude Code's triggers, so a countdown would go stale between them, and a window reaching `resets_at` is itself a trigger
- Prompt cache warmth is not drawn. There is nothing to do about a cold cache, and an unlabelled icon beside the bar could not be read for what it meant. `prompt_cache.warm` is still parsed because the colleague comment names a cold cache among the pressure signals it may mention. Two tests pin that: one drives `--generate-comment` directly, the other runs the status line from stdin and waits for the background generation, so neither half of the path can be deleted without a failure
- Worktree name replaces the path (with a different icon) because a Claude Code worktree session has an uninformative cwd under `.claude/worktrees/`
- Session name closes line 1 and is dropped when it would push the line past the terminal edge; line 1 has the slack because column widths are sized for the wider line 2
- All git commands have `timeout: 3000ms`
- Comment cache at `~/.claude/cache/statusline-comment-<hash>.json` where hash = MD5(toplevel + session_id)[:8] (TTL: 5 min, override with `STATUSLINE_COMMENT_TTL_MS`)
- Comment cache format: `{ comment: "text", history: ["prev1", "prev2", ...] }` — history keeps last N comments for dedup
- Comment prompt: instruction first (persona adherence), dynamic context (empty fields omitted), changedFiles max 5, recentCommits max 3
- Comment prompt context order leads with what the session is about (session name, recent commit subjects, uncommitted files) because the model reacts to the first concrete thing it sees; numbers follow
- Comment prompt shows pressure signals only once they matter: context window <15%, cold cache, rate limit windows at 70%+
- Comment prompt asks for ONE sentence within 30 Japanese / 60 English characters — the display truncates to one line, so asking for more just throws away the tail
- Comment dedup lists what was already said and rules out repeating its angle, not just its wording
- Comment output sanitized: newlines collapsed, capped to 200 codepoints at generation (safety net, surrogate-pair safe)
- `lib/widths.js` holds the icons, `WIDE_RANGES` and `visualWidth`; `index.js` and both test files require it rather than keeping copies. The tests used to read `index.js` as text to enumerate the icons, and the regex let a differently spelled declaration through three times running, so the set is an object the tests iterate instead
- `WIDE_RANGES` takes its East Asian Wide / Fullwidth ranges from a generator over unicodedata; the emoji blocks are added on top by hand, so regenerating from unicodedata alone drops them. The private use areas are not in it, so they measure one cell, as Claude Code measures them. `visualWidth` stops at the first range above the code point, so the list stays sorted by its low end and a test checks that
- Every icon is an `Emoji_Presentation` code point other than a regional indicator. Unicode makes those East Asian Wide, so the terminal and Claude Code's renderer both give them two cells with no setting. The 26 regional indicators (U+1F1E6–1F1FF) are the exception: `Emoji_Presentation` but Neutral, because they pair into flags. A test checks each icon against that property rather than trusting `visualWidth`, because the emoji blocks in `WIDE_RANGES` also hold Neutral code points such as U+1F3F7 that measure two there and are drawn one. The icons were Nerd Font glyphs until September 2026; README's "Why not Nerd Font icons" carries what was observed. Keep third-party behaviour there and dated, not spread through the code, because nothing in this repository re-verifies it
- The Ambiguous code points the layout draws itself are left at one cell: the bar's filled cell `█` (U+2588), the ahead/behind arrows (U+2191/2193) and the truncation ellipsis (U+2026). The empty cell `░` (U+2591) is Neutral, not Ambiguous, so it is unaffected. A terminal setting that widens the whole Ambiguous class draws the other three two, and the lines run longer than the arithmetic reserved — measured at ten cells over on a full bar, which is the ten `█`. That rules out widening the whole class, such as Windows Terminal's `compatibility.ambiguousWidth`; `test/width-ranges.test.js` pins those five code points at one cell
- `WIDE_RANGES` is not limited to Wide. The emoji block `[0x2600, 0x27BF]` spans 46 Wide, 80 Ambiguous and 322 Neutral code points (Unicode 15.0), so repository text holding one of the latter two — `✓` U+2713 is Neutral — is reserved two cells and drawn one. The column pads a cell short and the two lines misalign, which is the opposite direction from running past the edge
- `--generate-comment` mode: spawned as detached background process, calls `claude -p --model <model> --no-session-persistence` to generate context-aware comments
- `--colleague-instruction` flag enables the optional 3rd line with LLM-generated colleague comments
- Requires `claude` CLI installed and authenticated; silently skips if unavailable
- Effort level: stdin `effort.level` preferred, `~/.claude/settings.json` `effortLevel` as fallback; rendered inside the model segment as `Opus 5 (high)`
- Terminal width detection: `process.stderr.columns` → `COLUMNS` env → default 100
- Width arithmetic is in terminal cells throughout (`visualWidth`): column widths, truncation (`truncStrVisual`) and padding (`padEnd`). Mixing in `.length` puts a wide-char segment past its column and the line past the terminal edge
- Column widths are sized against whichever line spends more outside them. Both tails vary (ahead/behind + diff stats on line 1, rate limits on line 2), so a constant cannot stand in for that
- The columns are sized against the rate limits without their reset times, which then go in only if line 2 still has room, so they never cut the path, branch or effort. On a terminal too narrow for the columns' floor plus the percentages, line 2 drops the rate limits. Line 1's tail is not optional, so a long branch with large diff stats still overflows on a narrow terminal. `COLS_FLOOR` is how far the two columns may shrink together, so `line1Outside + COLS_FLOOR` is the width at which a line whose columns are already at that floor stops overflowing: 31 + 30 = 61 for `↑12↓34 +1234/-5678`, where the diff stats count the space in front of them, and 65 for `↑123↓456 +12345/-67890` (`MIN_SUPPORTED_COLS` in the tests carries the breakdown). A short cwd and branch do not reach the floor and fit well below those widths
- Free text from the repository (commit subjects, file names, branch and worktree names) is flattened, stripped of quotes and backslashes, and capped before it enters the `claude -p` prompt; the prompt also states that the context is data
- Model display_name parenthetical suffix (e.g. "(1M context)") auto-stripped

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STATUSLINE_COMMENT_MODEL` | `sonnet` | Model alias for `claude -p --model` |
| `STATUSLINE_COMMENT_TTL_MS` | `300000` (5 min) | Colleague comment cache TTL |
| `STATUSLINE_COMMENT_HISTORY_SIZE` | `5` | Number of previous comments to track for dedup |
| `STATUSLINE_THEME` | `default` | Color theme: `default`, `light`, `minimal`, `dracula` |

## Code Style

- CommonJS (`require`), semicolons required
- Function declarations (`function`); arrow functions only for variable assignments
- ESLint config: `eslint.config.mjs` (flat config). It is ESM because `@stylistic/eslint-plugin` ships only as ESM and the test job runs on Node 18, which cannot `require()` an ES module
- Formatting is `@stylistic/eslint-plugin`'s `configs.customize` preset at its defaults, except `semi: true`: `else`/`catch` on their own line (stroustrup), a continued line starts with its operator, and a single-parameter arrow function takes parentheses only with a block body. `npm run lint:fix` applies it
- A Claude Code session started in this repository runs `.claude/hooks/eslint-fix.js` after each Edit or Write of a `.js` file (PostToolUse, `.claude/settings.json`). It runs `eslint --fix` on that file and tells Claude when the file changed on disk, which means rereading it before the next edit, and which problems remain

## Gotchas

- Invalid JSON on stdin causes silent exit (`process.exit(0)`, no output)
- Statusline re-runs only on Claude Code triggers (new message, `/compact`, permission/vim mode change, a rate limit window reaching `resets_at`), debounced 300ms
- Nothing in the output counts down (the rate limit resets are wall-clock times), so `statusLine.refreshInterval` is optional; it is only worth setting to keep git state current while background subagents work
- `statusLine.hideVimModeIndicator` (settings.json) hides Claude Code's own vim indicator; unrelated to this command's output
- Icons are emoji and need no Nerd Font or terminal width setting
- If `claude` CLI is not installed or not authenticated, colleague comments are silently skipped
- The `--generate-comment` background process must unset `CLAUDECODE` and related env vars to avoid recursion
- Tests use `process.execPath` (not `'node'`) for portability; `claude` CLI tests are skipped when not authenticated
- GitHub repo rules require PRs to merge into main (direct push rejected); merge commits disabled, use `gh pr merge --squash`
- Claude Code's statusline renderer truncates lines with too many ANSI escape sequences; keep transitions minimal (≤6 per line), avoid mid-bar color switching
- Effort renders as `(high)` rather than an emoji, so the model segment needs no width correction of its own
