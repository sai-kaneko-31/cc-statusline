#!/usr/bin/env node
'use strict';

const { execSync, execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ── --generate-comment mode (background LLM comment generation) ──
const generateCommentIdx = process.argv.indexOf('--generate-comment');
if (generateCommentIdx !== -1) {
  try {
    const contextJson = process.argv[generateCommentIdx + 1] || '{}';
    const ctx = JSON.parse(contextJson);
    const { branch, changedFiles, time, hpRemaining, instruction, costUsd, durationMs, linesAdded, linesRemoved, previousComments } = ctx;
    const commentModel = process.env.STATUSLINE_COMMENT_MODEL || 'haiku';

    const files = (changedFiles || []).slice(0, 5);
    const filesStr = files.length > 0 ? files.join(', ') : '';
    const durationMin = durationMs ? Math.floor(durationMs / 60000) : null;
    const prevStr = (previousComments || []).length > 0
      ? `\nPrevious comments (say something different): ${previousComments.map((c) => `"${c}"`).join(', ')}`
      : '';

    // Build context fields, omitting empty/unknown values
    const ctxParts = [];
    if (filesStr) ctxParts.push(`files=[${filesStr}]`);
    if (branch) ctxParts.push(`branch="${branch}"`);
    if (time) ctxParts.push(`time="${time}"`);
    if (durationMin != null) ctxParts.push(`duration=${durationMin}min`);
    if (costUsd != null) ctxParts.push(`cost=$${costUsd.toFixed(2)}`);
    if (linesAdded || linesRemoved) ctxParts.push(`lines +${linesAdded || 0}/-${linesRemoved || 0}`);
    if (hpRemaining != null && hpRemaining <= 15) ctxParts.push(`context_window_remaining=${hpRemaining}% (low!)`);

    const prompt = [
      instruction || 'Be friendly and supportive.',
      `You are a colleague sitting next to a developer. React to their work with a short remark.`,
      ctxParts.length > 0 ? `Context: ${ctxParts.join(', ')}.${prevStr}` : '',
      'Priority: changed files > branch > time > duration/cost.',
      'Give ONE comment (2-3 short sentences). Output ONLY the comment text.',
    ].filter(Boolean).join('\n');

    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS;

    const raw = execFileSync('claude', ['-p', prompt, '--model', commentModel, '--no-session-persistence'], {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    }).trim();

    // Sanitize: collapse to single line, truncate to 120 chars
    const result = raw.replace(/[\r\n]+/g, ' ').slice(0, 80);

    if (result) {
      const homeDir = os.homedir();
      const cacheDir = path.join(homeDir, '.claude', 'cache');
      const cacheKey = ctx.cacheKey || 'default';
      const cacheFile = path.join(cacheDir, `statusline-comment-${cacheKey}.json`);
      const maxHistory = parseInt(process.env.STATUSLINE_COMMENT_HISTORY_SIZE) || 5;
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch {}
      // Append to history, keep last N
      const history = [...(previousComments || []), result].slice(-maxHistory);
      fs.writeFileSync(cacheFile, JSON.stringify({ comment: result, history }));
    }
  } catch {}
  process.exit(0);
}

// Read JSON from stdin
let data;
try {
  const input = fs.readFileSync(0, 'utf8');
  data = JSON.parse(input);

} catch {
  process.exit(0);
}

const cwd = data.cwd || (data.workspace && data.workspace.current_dir) || '';
const modelRaw = (data.model && data.model.display_name) || '';
const model = modelRaw.replace(/\s*\(.*?\)\s*$/, '');

// Effort level: prefer stdin `effort.level` (reflects mid-session /effort
// changes; values: low/medium/high/xhigh/max). Fall back to
// ~/.claude/settings.json `effortLevel` for older Claude Code versions
// that don't send the field.
let effortLevel = (data.effort && data.effort.level) || '';
if (!effortLevel) {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    effortLevel = settings.effortLevel || '';
  } catch {}
}
const usedPct = data.context_window && data.context_window.used_percentage;
const costUsd = data.cost && data.cost.total_cost_usd;
const durationMs = data.cost && data.cost.total_duration_ms;
const linesAdded = data.cost && data.cost.total_lines_added;
const linesRemoved = data.cost && data.cost.total_lines_removed;
const sessionId = data.session_id || '';

let colleagueInstruction = null;
const colleagueIdx = process.argv.indexOf('--colleague-instruction');
if (colleagueIdx !== -1) {
  colleagueInstruction = process.argv[colleagueIdx + 1] || '';
}

// ANSI color codes
const RESET = '\x1b[0m';
const THEMES = {
  default: {
    folder: '\x1b[1;36m',
    branch: '\x1b[1;35m',
    aheadBehind: '\x1b[1;33m',
    added: '\x1b[1;32m',
    deleted: '\x1b[1;31m',
    model: '\x1b[1;34m',
    barSafe: '\x1b[1;32m',
    barWarning: '\x1b[1;33m',
    barDanger: '\x1b[1;31m',
    dim: '\x1b[2;37m',
    clock: '\x1b[37m',
  },
  light: {
    folder: '\x1b[36m',
    branch: '\x1b[35m',
    aheadBehind: '\x1b[33m',
    added: '\x1b[32m',
    deleted: '\x1b[31m',
    model: '\x1b[34m',
    barSafe: '\x1b[32m',
    barWarning: '\x1b[33m',
    barDanger: '\x1b[31m',
    dim: '\x1b[90m',
    clock: '\x1b[37m',
  },
  minimal: {
    folder: '\x1b[37m',
    branch: '\x1b[37m',
    aheadBehind: '\x1b[37m',
    added: '\x1b[37m',
    deleted: '\x1b[37m',
    model: '\x1b[37m',
    barSafe: '\x1b[37m',
    barWarning: '\x1b[37m',
    barDanger: '\x1b[1;31m',
    dim: '\x1b[90m',
    clock: '\x1b[37m',
  },
  dracula: {
    folder: '\x1b[1;36m',
    branch: '\x1b[1;35m',
    aheadBehind: '\x1b[1;33m',
    added: '\x1b[1;32m',
    deleted: '\x1b[1;31m',
    model: '\x1b[38;5;141m',
    barSafe: '\x1b[1;32m',
    barWarning: '\x1b[38;5;215m',
    barDanger: '\x1b[1;31m',
    dim: '\x1b[38;5;61m',
    clock: '\x1b[37m',
  },
};
const themeName = (process.env.STATUSLINE_THEME || 'default').toLowerCase();
const T = THEMES[themeName] || THEMES.default;

// Nerd Font icons
const ICON_FOLDER = '\uF07C';   //  folder-open
const ICON_BRANCH = '\uF126';   //  code-fork
const ICON_ROCKET = '\uF135';   //  rocket
const ICON_OPUS = '\uF2DB';     //  microchip
const ICON_SONNET = '\uF005';   //  star
const ICON_HAIKU = '\uF0F4';    //  coffee
const ICON_HEART = '\uF004';    //  heart
const ICON_CLOCK = '\uF017';    //  clock
const ICON_COMMENT = '\uF075';  //  comment
const ICON_REVIEW_APPROVED = '\uF00C';   //  check
const ICON_REVIEW_CHANGES = '\uF00D';    //  close
const ICON_REVIEW_PENDING = '\uF10C';    //  circle-o
const ICON_REVIEW_DRAFT = '\uF040';      //  pencil
const ICON_BOLT = '\u26A1';              // ⚡ bolt (effort level, full-width)

const COL_SEP = '  ';

// Helper: execute shell command, return trimmed stdout or empty string
function exec(cmd) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

// OSC8 terminal hyperlink (BEL terminator)
function osc8(text, url) {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

// Pad string to length with trailing spaces
function padEnd(str, len) {
  return str.length < len ? str + ' '.repeat(len - str.length) : str;
}

// Truncate string with ellipsis if too long
function truncStr(str, maxLen) {
  if (str.length <= maxLen) return str;
  if (maxLen < 2) return str.slice(0, 1);
  return str.slice(0, maxLen - 1) + '\u2026';
}

// Directory: replace $HOME with ~
const homeDir = os.homedir();
const displayDir = cwd.startsWith(homeDir)
  ? '~' + cwd.slice(homeDir.length)
  : cwd;

// ── Git info ──
let gitBranch = '';
let gitAheadBehind = '';
let gitAdded = '';
let gitDeleted = '';
// PR info from stdin: Claude Code provides pr.{number,url,review_state}
// natively (absent when not in a git repo, no PR, or PR merged/closed).
const prNum = data.pr && data.pr.number != null ? String(data.pr.number) : '';
const prUrl = (data.pr && data.pr.url) || '';
const prReviewDecision = (data.pr && data.pr.review_state) || '';

if (exec(`git -C "${cwd}" rev-parse --git-dir`)) {
  gitBranch =
    exec(`git -C "${cwd}" symbolic-ref --short HEAD`) ||
    exec(`git -C "${cwd}" rev-parse --short HEAD`);

  // Ahead / behind
  const upstream = exec(
    `git -C "${cwd}" rev-parse --abbrev-ref --symbolic-full-name "@{u}"`
  );
  if (upstream) {
    const ahead =
      parseInt(exec(`git -C "${cwd}" rev-list --count "${upstream}"..HEAD`)) ||
      0;
    const behind =
      parseInt(exec(`git -C "${cwd}" rev-list --count "HEAD..${upstream}"`)) ||
      0;
    if (ahead > 0 && behind > 0) gitAheadBehind = `↑${ahead}↓${behind}`;
    else if (ahead > 0) gitAheadBehind = `↑${ahead}`;
    else if (behind > 0) gitAheadBehind = `↓${behind}`;
  }

  // Diff stats (staged + unstaged vs HEAD)
  const diffStat = exec(`git -C "${cwd}" diff --shortstat HEAD`);
  if (diffStat) {
    const addMatch = diffStat.match(/(\d+) insertion/);
    const delMatch = diffStat.match(/(\d+) deletion/);
    if (addMatch) gitAdded = addMatch[1];
    if (delMatch) gitDeleted = delMatch[1];
  }
}

// ── Time ──
const now = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const currentTime = `${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;

// ── Column widths ──
// Keyed by stdin pr.review_state (approved/pending/changes_requested/draft)
const REVIEW_MAP = {
  approved: { icon: ICON_REVIEW_APPROVED, color: T.added },
  changes_requested: { icon: ICON_REVIEW_CHANGES, color: T.deleted },
  pending: { icon: ICON_REVIEW_PENDING, color: T.aheadBehind },
  draft: { icon: ICON_REVIEW_DRAFT, color: T.dim },
};
const reviewInfo = REVIEW_MAP[prReviewDecision] || null;
const prText = prNum ? ` #${prNum}` : '';
const reviewText = reviewInfo ? ` ${reviewInfo.icon}` : '';
const ctxVisibleLen = 15; // [██████████]XX%

// Terminal width detection (stdout piped to Claude Code, try stderr)
const termCols = process.stderr.columns || parseInt(process.env.COLUMNS) || 100;

// Line 2 (wider): icon(2) + col1 + COL_SEP(2) + icon(2) + col2 + COL_SEP(2) + icon(2) + time(19) = col1 + col2 + 29
const LINE_OVERHEAD = 29;
const maxContentCols = Math.max(30, termCols - LINE_OVERHEAD);

const effortSuffix = effortLevel ? ` ${ICON_BOLT}${effortLevel}` : '';
const effortVisualWidth = effortSuffix ? effortSuffix.length + 1 : 0; // ⚡ is 2 cols, .length counts as 1
const rawCol1 = Math.max(displayDir.length, model.length + effortVisualWidth);
const rawBranchLen = (gitBranch + prText + reviewText).length;
const rawCol2 = Math.max(rawBranchLen, ctxVisibleLen);

let col1Len, col2Len;
if (rawCol1 + rawCol2 <= maxContentCols) {
  col1Len = rawCol1;
  col2Len = rawCol2;
} else {
  col2Len = Math.max(ctxVisibleLen, Math.min(rawCol2, maxContentCols - 10));
  col1Len = Math.max(10, Math.min(rawCol1, maxContentCols - col2Len));
}

const displayDirTrunc = truncStr(displayDir, col1Len);
const modelMaxLen = effortSuffix ? Math.max(5, col1Len - effortVisualWidth) : col1Len;
const modelTrunc = truncStr(model, modelMaxLen);
const branchMaxLen = Math.max(5, col2Len - prText.length - reviewText.length);
const gitBranchTrunc = truncStr(gitBranch, branchMaxLen);
const branchVisible = gitBranchTrunc + prText + reviewText;

// ── Line 1: path + branch+PR + git stats ──
let line1 = `${T.folder}${ICON_FOLDER} ${padEnd(displayDirTrunc, col1Len)}${RESET}`;

if (gitBranch) {
  const branchPad = col2Len - branchVisible.length;
  const padding = branchPad > 0 ? ' '.repeat(branchPad) : '';
  if (prNum) {
    // Branch name + OSC8 clickable PR link + review status
    const reviewStr = reviewInfo ? ` ${reviewInfo.color}${reviewInfo.icon}${RESET}` : '';
    // Wrap the PR number in an OSC8 link only when pr.url is present.
    // pr.number can arrive from stdin without pr.url, and osc8 with an
    // empty url emits a broken hyperlink (and 2 wasted ANSI transitions).
    const prLabel = prUrl ? osc8(`#${prNum}`, prUrl) : `#${prNum}`;
    line1 += `${COL_SEP}${T.branch}${ICON_BRANCH} ${gitBranchTrunc}${RESET} ${T.dim}${prLabel}${RESET}${reviewStr}${padding}`;
  } else {
    line1 += `${COL_SEP}${T.branch}${ICON_BRANCH} ${padEnd(gitBranchTrunc, col2Len)}${RESET}`;
  }
}

if (gitAheadBehind) {
  line1 += `${COL_SEP}${T.aheadBehind}${ICON_ROCKET} ${gitAheadBehind}${RESET}`;
} else {
  line1 += `${COL_SEP}${T.dim}${ICON_ROCKET} -${RESET}`;
}

const addedStr = gitAdded || '0';
const deletedStr = gitDeleted || '0';
if (parseInt(addedStr) > 0 || parseInt(deletedStr) > 0) {
  line1 += ` ${T.added}+${addedStr}${RESET}/${T.deleted}-${deletedStr}${RESET}`;
} else {
  line1 += ` ${T.dim}-/-${RESET}`;
}

// ── Line 2: model + HP bar + time ──
let modelIcon;
if (model.includes('Opus')) modelIcon = ICON_OPUS;
else if (model.includes('Sonnet')) modelIcon = ICON_SONNET;
else if (model.includes('Haiku')) modelIcon = ICON_HAIKU;
else modelIcon = ICON_SONNET;

const modelDisplay = modelTrunc + effortSuffix;
const modelPadTarget = effortSuffix ? col1Len - 1 : col1Len; // ⚡ is 2 cols but .length counts 1
let line2 = `${T.model}${modelIcon} ${padEnd(modelDisplay, modelPadTarget)}${RESET}`;

let remaining = null;
if (usedPct != null && usedPct !== '') {
  const usedInt = Math.floor(parseFloat(usedPct));
  const compactThreshold = 85;
  remaining = Math.max(0, compactThreshold - usedInt);
  const filled = Math.min(10, Math.floor((remaining * 10) / compactThreshold));
  const empty = 10 - filled;

  const barFilled = filled > 0 ? '█'.repeat(filled) : '';
  const barEmpty = empty > 0 ? '░'.repeat(empty) : '';

  let barColor;
  if (remaining <= 15) barColor = T.barDanger;
  else if (remaining <= 40) barColor = T.barWarning;
  else barColor = T.barSafe;

  const ctxTextLen = 10 + 2 + String(remaining).length + 1; // bars + [] + digits + %
  const ctxPad = col2Len - ctxTextLen;
  const ctxPadding = ctxPad > 0 ? ' '.repeat(ctxPad) : '';

  line2 += `${COL_SEP}${barColor}${ICON_HEART} [${barFilled}${barEmpty}]${remaining}%${ctxPadding}${RESET}`;
} else {
  line2 += `${COL_SEP}${T.dim}${ICON_HEART} ${' '.repeat(col2Len)}${RESET}`;
}

line2 += `${COL_SEP}${T.clock}${ICON_CLOCK} ${currentTime}${RESET}`;

// ── Colleague comment (optional 3rd line) ──
let cachedComment = null;
if (colleagueInstruction !== null) {
  const commentToplevel = exec(`git -C "${cwd}" rev-parse --show-toplevel`);
  const commentCacheKey = commentToplevel
    ? crypto.createHash('md5').update(commentToplevel + sessionId).digest('hex').slice(0, 8)
    : 'default';
  const commentCacheFile = path.join(homeDir, '.claude', 'cache', `statusline-comment-${commentCacheKey}.json`);
  const commentTtl = parseInt(process.env.STATUSLINE_COMMENT_TTL_MS) || 300000;

  // Try to read cached comment
  let commentHistory = [];
  try {
    const stat = fs.statSync(commentCacheFile);
    const commentData = JSON.parse(fs.readFileSync(commentCacheFile, 'utf8'));
    commentHistory = commentData.history || [];
    if (Date.now() - stat.mtimeMs < commentTtl && commentData.comment) {
      cachedComment = commentData.comment;
    }
  } catch {}

  // If no fresh cache, spawn background generation
  if (!cachedComment) {
    const changedFiles = exec(`git -C "${cwd}" diff --name-only HEAD`);
    const contextObj = {
      branch: gitBranch,
      changedFiles: changedFiles ? changedFiles.split('\n').slice(0, 5) : [],
      time: currentTime,
      hpRemaining: remaining,
      costUsd,
      durationMs,
      linesAdded,
      linesRemoved,
      instruction: colleagueInstruction,
      cacheKey: commentCacheKey,
      previousComments: commentHistory,
    };
    const child = spawn('node', [process.argv[1], '--generate-comment', JSON.stringify(contextObj)], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }
}

let output = `${line1}\n${line2}`;
if (cachedComment) {
  const commentMaxLen = Math.max(20, termCols - 4);
  output += `\n${T.dim}${ICON_COMMENT} ${truncStr(cachedComment, commentMaxLen)}${RESET}`;
}
process.stdout.write(output);
