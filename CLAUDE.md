# cc-statusline

Claude Code statusline command (single-file Node.js CLI).

## Architecture

- Entry point: `index.js` (271 lines, zero dependencies)
- Reads JSON from stdin, outputs ANSI-colored 2-line status to stdout
- Two modes: statusline (default) and `--invalidate-cache` (PostToolUse hook)
- Modules: child_process, fs, path, os, crypto (all Node.js built-in)

## Commands

```bash
npm test              # Run tests (node:test)
npm run lint          # ESLint check
npm run lint:fix      # ESLint auto-fix

# Manual test
echo '{"cwd":"/tmp","model":{"display_name":"Opus 4.6"},"context_window":{"used_percentage":30}}' | node index.js

# Test inside a git repo (shows branch & PR info)
echo "{\"cwd\":\"$(pwd)\",\"model\":{\"display_name\":\"Opus 4.6\"},\"context_window\":{\"used_percentage\":70}}" | node index.js
```

## Testing

- Framework: `node:test` (Node.js built-in)
- Test file: `test/statusline.test.js`
- CI: GitHub Actions with Node.js 18/20/22 matrix

## stdin JSON Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Working directory (used for git info) |
| `model.display_name` | string | No | Model name (icon changes for "Opus"/"Sonnet"/"Haiku") |
| `context_window.used_percentage` | number | No | Context usage percentage (used for HP bar) |

## Key Implementation Details

- PR info cached at `~/.claude/cache/pr-<repoHash>-<branch>.json` (TTL: 5 min, override with `STATUSLINE_PR_CACHE_TTL_MS`)
- repoHash is first 8 chars of MD5 of `git rev-parse --show-toplevel`
- HP bar converts used_percentage to "remaining until 85% (auto-compact threshold)"
- OSC8 hyperlinks use BEL (`\x07`) terminator
- All git commands have `timeout: 3000ms`; `gh` commands use `timeout 2`
- `--invalidate-cache` mode: deletes cache file when `gh pr create/merge/close` is detected in PostToolUse hook input

## Code Style

- CommonJS (`require`), semicolons required
- Function declarations (`function`); arrow functions only for variable assignments
- ESLint config: `eslint.config.js` (flat config, `prefer-const`, `semi`)

## Gotchas

- If `gh` CLI is not installed, PR info is silently skipped (no error)
- Invalid JSON on stdin causes silent exit (`process.exit(0)`, no output)
- Icons require a [Nerd Font](https://www.nerdfonts.com/) in the terminal
- OSC8 hyperlinks don't work in some terminal emulators (Claude Code limitation: [anthropics/claude-code#26356](https://github.com/anthropics/claude-code/issues/26356)). Works in IDE integrated terminals (VS Code, Cursor), but may render as plain text in standalone emulators (Konsole, Windows Terminal)
