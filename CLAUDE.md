# cc-statusline

Claude Code statusline command (single-file Node.js CLI).

## Architecture

- Entry point: `index.js` (~430 lines, zero dependencies)
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

# Test PR display (pr.* is provided by Claude Code; pass it manually here)
echo "{\"cwd\":\"$(pwd)\",\"model\":{\"display_name\":\"Opus 4.6\"},\"pr\":{\"number\":42,\"url\":\"https://github.com/x/y/pull/42\",\"review_state\":\"approved\"}}" | node index.js

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
| `pr.number` | number | No | Open PR number (Claude Code native; absent when no PR or PR merged/closed) |
| `pr.url` | string | No | Open PR URL (used for OSC8 clickable link) |
| `pr.review_state` | string | No | PR review state (`approved`/`pending`/`changes_requested`/`draft`); absent if no review |

## Key Implementation Details

- PR info (number, URL, review state) read directly from stdin `pr.*` — no `gh` call or cache file
- Context window bar converts used_percentage to "remaining until 85% (auto-compact threshold)"
- OSC8 hyperlinks use BEL (`\x07`) terminator
- All git commands have `timeout: 3000ms`
- Comment cache at `~/.claude/cache/statusline-comment-<hash>.json` where hash = MD5(toplevel + session_id)[:8] (TTL: 5 min, override with `STATUSLINE_COMMENT_TTL_MS`)
- Comment cache format: `{ comment: "text", history: ["prev1", "prev2", ...] }` — history keeps last N comments for dedup
- Comment prompt: instruction first (persona adherence), dynamic context (empty fields omitted), changedFiles max 5
- Comment prompt priority: changed files > branch > time > duration/cost; context window remaining only shown if <15%
- Comment dedup uses positive instruction ("say something different") instead of negative ("DO NOT repeat")
- Comment output sanitized: newlines collapsed, capped to 200 codepoints at generation (safety net, surrogate-pair safe)
- Comment display uses `truncStrVisual` (visual-cell width: CJK/emoji = 2 cells); separate from char-based `truncStr` for path/model/branch layout
- `--generate-comment` mode: spawned as detached background process, calls `claude -p --model <model> --no-session-persistence` to generate context-aware comments
- `--colleague-instruction` flag enables the optional 3rd line with LLM-generated colleague comments
- Requires `claude` CLI installed and authenticated; silently skips if unavailable
- Effort level: stdin `effort.level` preferred, `~/.claude/settings.json` `effortLevel` as fallback; shown next to model name with bolt icon
- Terminal width detection: `process.stderr.columns` → `COLUMNS` env → default 100; columns dynamically capped to fit
- Model display_name parenthetical suffix (e.g. "(1M context)") auto-stripped; time format is `HH:MM:SS`
- PR review status: stdin `pr.review_state` mapped to icons (approved→, changes_requested→, pending→, draft→)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STATUSLINE_COMMENT_MODEL` | `haiku` | Model alias for `claude -p --model` |
| `STATUSLINE_COMMENT_TTL_MS` | `300000` (5 min) | Colleague comment cache TTL |
| `STATUSLINE_COMMENT_HISTORY_SIZE` | `5` | Number of previous comments to track for dedup |
| `STATUSLINE_THEME` | `default` | Color theme: `default`, `light`, `minimal`, `dracula` |

## Code Style

- CommonJS (`require`), semicolons required
- Function declarations (`function`); arrow functions only for variable assignments
- ESLint config: `eslint.config.js` (flat config, `prefer-const`, `semi`)

## Gotchas

- PR info comes from Claude Code's stdin `pr.*`; absent when no open PR exists (no error)
- Invalid JSON on stdin causes silent exit (`process.exit(0)`, no output)
- Statusline re-runs only on Claude Code triggers (new message, `/compact`, permission/vim mode change), debounced 300ms
- The `HH:MM:SS` clock goes stale between triggers; users wanting a live clock set `statusLine.refreshInterval` (seconds) in settings.json
- `statusLine.hideVimModeIndicator` (settings.json) hides Claude Code's own vim indicator; unrelated to this command's output
- Icons require a [Nerd Font](https://www.nerdfonts.com/) in the terminal
- OSC8 hyperlinks don't work in some terminal emulators (Claude Code limitation: [anthropics/claude-code#26356](https://github.com/anthropics/claude-code/issues/26356)). Works in IDE integrated terminals (VS Code, Cursor), but may render as plain text in standalone emulators (Konsole, Windows Terminal)
- If `claude` CLI is not installed or not authenticated, colleague comments are silently skipped
- The `--generate-comment` background process must unset `CLAUDECODE` and related env vars to avoid recursion
- Tests use `process.execPath` (not `'node'`) for portability; `claude` CLI tests are skipped when not authenticated
- GitHub repo rules require PRs to merge into main (direct push rejected); merge commits disabled, use `gh pr merge --squash`
- Claude Code's statusline renderer truncates lines with too many ANSI escape sequences; keep transitions minimal (≤6 per line), avoid mid-bar color switching
- Effort bolt icon uses ⚡ (U+26A1, full-width) not Nerd Font \uF0E7; width calculations must add +1 for the extra column
