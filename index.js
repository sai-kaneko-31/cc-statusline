#!/usr/bin/env node
'use strict';

const { execSync, execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ── --invalidate-cache mode (PostToolUse hook) ──
if (process.argv.includes('--invalidate-cache')) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const cmd = (input.tool_input && input.tool_input.command) || '';
    if (!/gh\s+pr\s+(create|merge|close)/.test(cmd)) process.exit(0);

    const homeDir = os.homedir();
    const cacheDir = path.join(homeDir, '.claude', 'cache');
    if (!fs.existsSync(cacheDir)) process.exit(0);

    const branch = execSync('git symbolic-ref --short HEAD', {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const toplevel = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const repoId = crypto.createHash('md5').update(toplevel).digest('hex').slice(0, 8);
    const cacheFile = path.join(cacheDir, `pr-${repoId}-${branch.replace(/\//g, '_')}.json`);
    fs.rmSync(cacheFile, { force: true });
  } catch {}
  process.exit(0);
}

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
    if (hpRemaining != null && hpRemaining <= 15) ctxParts.push(`HP=${hpRemaining}% (low!)`);

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

    const raw = execFileSync('claude', ['-p', prompt, '--model', commentModel], {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    }).trim();

    // Sanitize: collapse to single line, truncate to 120 chars
    const result = raw.replace(/[\r\n]+/g, ' ').slice(0, 120);

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
const model = (data.model && data.model.display_name) || '';
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
const BOLD_CYAN = '\x1b[1;36m';
const BOLD_PURPLE = '\x1b[1;35m';
const BOLD_YELLOW = '\x1b[1;33m';
const BOLD_GREEN = '\x1b[1;32m';
const BOLD_RED = '\x1b[1;31m';
const DIM_WHITE = '\x1b[2;37m';
const BOLD_BLUE = '\x1b[1;34m';

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
let prNum = '';
let prUrl = '';

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

  // PR info with file-based cache
  if (gitBranch) {
    const cacheDir = path.join(homeDir, '.claude', 'cache');
    const ttl = parseInt(process.env.STATUSLINE_PR_CACHE_TTL_MS) || 300000;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
    } catch {}

    const toplevel = exec(`git -C "${cwd}" rev-parse --show-toplevel`);
    const repoId = crypto
      .createHash('md5')
      .update(toplevel)
      .digest('hex')
      .slice(0, 8);
    const safeBranch = gitBranch.replace(/\//g, '_');
    const cacheFile = path.join(cacheDir, `pr-${repoId}-${safeBranch}.json`);

    let cached = null;
    try {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < ttl) {
        cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      }
    } catch {}

    if (cached === null) {
      const remoteUrl = exec(`git -C "${cwd}" remote get-url origin`);
      const prJson = exec(
        `timeout 2 gh pr view "${gitBranch}" --repo "${remoteUrl}" --json number,url,state`
      );
      if (prJson) {
        try {
          const pr = JSON.parse(prJson);
          cached =
            pr.state === 'OPEN'
              ? { number: pr.number, url: pr.url }
              : { none: true };
        } catch {
          cached = { none: true };
        }
      } else {
        cached = { none: true };
      }
      try {
        fs.writeFileSync(cacheFile, JSON.stringify(cached));
      } catch {}
    }

    if (cached && !cached.none) {
      prNum = String(cached.number);
      prUrl = cached.url;
    }
  }
}

// ── Time ──
const now = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const currentTime = `${now.getFullYear()}/${p2(now.getMonth() + 1)}/${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;

// ── Column widths ──
const col1Len = Math.max(displayDir.length, model.length);
const prText = prNum ? ` #${prNum}` : '';
const branchVisible = gitBranch + prText;
const ctxVisibleLen = 15; // [██████████]XX%
const col2Len = Math.max(branchVisible.length, ctxVisibleLen);

// ── Line 1: path + branch+PR + git stats ──
let line1 = `${BOLD_CYAN}${ICON_FOLDER} ${padEnd(displayDir, col1Len)}${RESET}`;

if (gitBranch) {
  const branchPad = col2Len - branchVisible.length;
  const padding = branchPad > 0 ? ' '.repeat(branchPad) : '';
  if (prNum) {
    // Branch name + OSC8 clickable PR link
    line1 += `${COL_SEP}${BOLD_PURPLE}${ICON_BRANCH} ${gitBranch}${RESET} ${DIM_WHITE}${osc8(`#${prNum}`, prUrl)}${RESET}${padding}`;
  } else {
    line1 += `${COL_SEP}${BOLD_PURPLE}${ICON_BRANCH} ${padEnd(gitBranch, col2Len)}${RESET}`;
  }
}

if (gitAheadBehind) {
  line1 += `${COL_SEP}${BOLD_YELLOW}${ICON_ROCKET} ${gitAheadBehind}${RESET}`;
} else {
  line1 += `${COL_SEP}${DIM_WHITE}${ICON_ROCKET} -${RESET}`;
}

const addedStr = gitAdded || '0';
const deletedStr = gitDeleted || '0';
if (parseInt(addedStr) > 0 || parseInt(deletedStr) > 0) {
  line1 += ` ${BOLD_GREEN}+${addedStr}${RESET}/${BOLD_RED}-${deletedStr}${RESET}`;
} else {
  line1 += ` ${DIM_WHITE}-/-${RESET}`;
}

// ── Line 2: model + HP bar + time ──
let modelIcon;
if (model.includes('Opus')) modelIcon = ICON_OPUS;
else if (model.includes('Sonnet')) modelIcon = ICON_SONNET;
else if (model.includes('Haiku')) modelIcon = ICON_HAIKU;
else modelIcon = ICON_SONNET;

let line2 = `${BOLD_BLUE}${modelIcon} ${padEnd(model, col1Len)}${RESET}`;

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
  if (remaining <= 15) barColor = BOLD_RED;
  else if (remaining <= 40) barColor = BOLD_YELLOW;
  else barColor = BOLD_GREEN;

  const ctxTextLen = 10 + 2 + String(remaining).length + 1; // bars + [] + digits + %
  const ctxPad = col2Len - ctxTextLen;
  const ctxPadding = ctxPad > 0 ? ' '.repeat(ctxPad) : '';

  line2 += `${COL_SEP}${barColor}${ICON_HEART} [${barFilled}${DIM_WHITE}${barEmpty}${barColor}]${remaining}%${ctxPadding}${RESET}`;
} else {
  line2 += `${COL_SEP}${DIM_WHITE}${ICON_HEART} ${' '.repeat(col2Len)}${RESET}`;
}

line2 += `${COL_SEP}\x1b[37m${ICON_CLOCK} ${currentTime}${RESET}`;

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
  output += `\n${DIM_WHITE}${ICON_COMMENT} ${cachedComment}${RESET}`;
}
process.stdout.write(output);
