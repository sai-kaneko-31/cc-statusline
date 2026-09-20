const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.js');
const CACHE_DIR = path.join(os.homedir(), '.claude', 'cache');
// /tmp is not a git repo, so cacheKey falls back to 'default'
const COMMENT_CACHE = path.join(CACHE_DIR, 'statusline-comment-default.json');
const REPO_CWD = path.join(__dirname, '..');

const hasClaudeAuth = (() => {
  try {
    const out = execFileSync('claude', ['auth', 'status'], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
    const status = JSON.parse(out);
    return status.loggedIn === true;
  } catch {
    return false;
  }
})();

function run(input) {
  try {
    const stdout = execFileSync(process.execPath, [INDEX], {
      input: typeof input === 'string' ? input : JSON.stringify(input),
      encoding: 'utf8',
      timeout: 10000,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', exitCode: err.status };
  }
}

function runWithArgs(input, args = [], options = {}) {
  try {
    const stdout = execFileSync(process.execPath, [INDEX, ...args], {
      input: typeof input === 'string' ? input : JSON.stringify(input),
      encoding: 'utf8',
      timeout: 10000,
      ...options,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', exitCode: err.status };
  }
}

function cleanCommentCache() {
  try { fs.rmSync(COMMENT_CACHE, { force: true }); } catch {}
}

// Strip ANSI escape codes and OSC8 hyperlink sequences
function stripAnsi(str) {
  return str
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\]8;;[^\x07]*\x07/g, '');
}

describe('statusline', () => {
  it('normal JSON outputs 2 lines with cwd and model', () => {
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6' },
      context_window: { used_percentage: 30 },
    });
    assert.equal(result.exitCode, 0);
    const lines = result.stdout.split('\n');
    assert.equal(lines.length, 2);
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes('/tmp'), 'should include cwd');
    assert.ok(plain.includes('Opus 4.6'), 'should include model name');
  });

  it('Opus model shows microchip icon', () => {
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6' },
    });
    assert.ok(result.stdout.includes('\uF2DB'), 'should include microchip icon');
  });

  it('Sonnet model shows star icon', () => {
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Sonnet 4.6' },
    });
    assert.ok(result.stdout.includes('\uF005'), 'should include star icon');
  });

  it('Haiku model shows coffee icon', () => {
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Haiku 4.5' },
    });
    assert.ok(result.stdout.includes('\uF0F4'), 'should include coffee icon');
  });

  it('shows HP bar with correct remaining percentage', () => {
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6' },
      context_window: { used_percentage: 30 },
    });
    const plain = stripAnsi(result.stdout);
    // remaining = 85 - 30 = 55
    assert.ok(plain.includes(']55%'), 'remaining should be 55%');
  });

  it('HP bar at 0% used shows 85% remaining', () => {
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6' },
      context_window: { used_percentage: 0 },
    });
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes(']85%'), 'remaining should be 85%');
  });

  it('HP bar at 85% used shows 0% remaining', () => {
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6' },
      context_window: { used_percentage: 85 },
    });
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes(']0%'), 'remaining should be 0%');
  });

  it('minimal JSON (cwd only) works', () => {
    const result = run({ cwd: '/tmp' });
    assert.equal(result.exitCode, 0);
    const lines = result.stdout.split('\n');
    assert.equal(lines.length, 2);
  });

  it('non-ASCII cwd column truncation stays in char units, not visual cells', () => {
    // Regression guard for truncStr semantics. With COLUMNS=50, col1Len is
    // forced down to ~15 chars, so a 29-char wide-char path DOES trigger
    // truncation. Under char-based truncStr (correct), 'プロジェクト' fits
    // in the first 14 chars + ellipsis. Under visual-cell truncStr (the
    // regression), the kana run would be cut at 'プロジェ…' because each
    // wide char counts as 2 cells against the same 15 budget.
    const longCwd = '/tmp/プロジェクト/サブディレクトリ/さらに深いところ';
    const result = runWithArgs(
      { cwd: longCwd, model: { display_name: 'Opus 4.6' } },
      [],
      { env: { ...process.env, COLUMNS: '50' } }
    );
    assert.equal(result.exitCode, 0);
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes('プロジェクト'), `char-based truncStr must keep 'プロジェクト' intact: ${JSON.stringify(plain)}`);
    assert.ok(!plain.includes('プロジェ…'), `must not cut at visual-cell boundary 'プロジェ…': ${JSON.stringify(plain)}`);
  });

  it('invalid JSON exits with 0 and no output', () => {
    const result = run('not json');
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  });

  it('empty input exits with 0 and no output', () => {
    const result = run('');
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  });

  it('strips parenthetical suffix from model display_name', () => {
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6 (1M context)' },
      context_window: { used_percentage: 30 },
    });
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes('Opus 4.6'), 'should include base model name');
    assert.ok(!plain.includes('(1M context)'), 'should not include parenthetical suffix');
  });

  it('shows effort level from stdin effort.level inside the model segment', () => {
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6' },
      context_window: { used_percentage: 30 },
      effort: { level: 'high' },
    });
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes('Opus 4.6 (high)'), 'should render as "<model> (<effort>)"');
    assert.ok(!result.stdout.includes('⚡'), 'should not include the bolt icon');
  });

  it('stdin effort.level takes precedence over settings.json effortLevel', () => {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      settings = {};
    }
    if (!settings.effortLevel) {
      return; // skip if no effort level in settings to compare against
    }
    // Pick a stdin value guaranteed to differ from the settings value
    const stdinLevel = settings.effortLevel === 'low' ? 'max' : 'low';
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6' },
      context_window: { used_percentage: 30 },
      effort: { level: stdinLevel },
    });
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes(stdinLevel), `should show stdin effort level "${stdinLevel}"`);
    assert.ok(!plain.includes(settings.effortLevel), `should not show settings effortLevel "${settings.effortLevel}" when stdin provides one`);
  });

  it('shows effort level from settings inside the model segment', () => {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      settings = {};
    }
    if (!settings.effortLevel) {
      return; // skip if no effort level configured
    }
    const result = run({
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6' },
      context_window: { used_percentage: 30 },
    });
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes(`(${settings.effortLevel})`), `should include effort level "(${settings.effortLevel})"`);
    assert.ok(!result.stdout.includes('\u26A1'), 'should not include the bolt icon');
  });

  it('git repo cwd shows branch icon', () => {
    const result = run({
      cwd: path.join(__dirname, '..'),
      model: { display_name: 'Opus 4.6' },
    });
    assert.ok(result.stdout.includes('\uF126'), 'should include branch icon');
  });
});

describe('colleague comments', () => {
  const stdinData = {
    cwd: '/tmp',
    model: { display_name: 'Opus 4.6' },
    context_window: { used_percentage: 30 },
  };

  it('--generate-comment calls claude CLI and exits cleanly', { skip: !hasClaudeAuth && 'claude CLI not installed or not authenticated', timeout: 30000 }, () => {
    const ctx = JSON.stringify({ branch: 'main', changedFiles: [], time: '2026/01/01 00:00:00', hpRemaining: 55, instruction: 'test', cacheKey: 'test' });
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS;
    const result = runWithArgs('', ['--generate-comment', ctx], { timeout: 30000, env });
    assert.equal(result.exitCode, 0);
  });

  it('--colleague-instruction without cached comment outputs 2 lines', () => {
    cleanCommentCache();
    const result = runWithArgs(stdinData, ['--colleague-instruction', 'test persona']);
    assert.equal(result.exitCode, 0);
    const lines = result.stdout.split('\n');
    assert.equal(lines.length, 2, 'should output 2 lines when no cache exists');
  });

  it('--colleague-instruction with pre-created cache outputs 3 lines with comment', () => {
    cleanCommentCache();
    try {
      const cacheDir = path.dirname(COMMENT_CACHE);
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(COMMENT_CACHE, JSON.stringify({ comment: 'テストコメント' }));

      const result = runWithArgs(stdinData, ['--colleague-instruction', 'test persona']);
      assert.equal(result.exitCode, 0);
      const lines = result.stdout.split('\n');
      assert.equal(lines.length, 3, 'should output 3 lines with cached comment');
      const plain = stripAnsi(result.stdout);
      assert.ok(plain.includes('テストコメント'), 'should include cached comment text');
      assert.ok(result.stdout.includes('\uF075'), 'should include comment icon');
    } finally {
      cleanCommentCache();
    }
  });

  it('without --colleague-instruction always outputs 2 lines even if cache exists', () => {
    cleanCommentCache();
    try {
      const cacheDir = path.dirname(COMMENT_CACHE);
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(COMMENT_CACHE, JSON.stringify({ comment: 'テストコメント' }));

      const result = run(stdinData);
      assert.equal(result.exitCode, 0);
      const lines = result.stdout.split('\n');
      assert.equal(lines.length, 2, 'should output 2 lines without --colleague-instruction');
    } finally {
      cleanCommentCache();
    }
  });

  it('stale cache does not show comment', () => {
    cleanCommentCache();
    try {
      const cacheDir = path.dirname(COMMENT_CACHE);
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(COMMENT_CACHE, JSON.stringify({ comment: '古いコメント' }));
      // Set mtime to 10 minutes ago
      const past = new Date(Date.now() - 600000);
      fs.utimesSync(COMMENT_CACHE, past, past);

      const result = runWithArgs(stdinData, ['--colleague-instruction', 'test']);
      assert.equal(result.exitCode, 0);
      const lines = result.stdout.split('\n');
      assert.equal(lines.length, 2, 'should output 2 lines when cache is stale');
    } finally {
      cleanCommentCache();
    }
  });

  // Visual-cell width helper mirroring index.js#visualWidth so tests can assert
  // the post-truncation body stays within terminal columns regardless of the
  // mix of ASCII / kana / kanji / emoji / dingbats in the input.
  function vw(s) {
    let w = 0;
    for (const ch of s) {
      const c = ch.codePointAt(0);
      const wide =
        (c >= 0x1100 && c <= 0x115F) ||
        (c >= 0x2600 && c <= 0x27BF) ||
        (c >= 0x2E80 && c <= 0x303F) ||
        (c >= 0x3041 && c <= 0x33FF) ||
        (c >= 0x3400 && c <= 0x4DBF) ||
        (c >= 0x4E00 && c <= 0x9FFF) ||
        (c >= 0xA000 && c <= 0xA4CF) ||
        (c >= 0xAC00 && c <= 0xD7A3) ||
        (c >= 0xF900 && c <= 0xFAFF) ||
        (c >= 0xFE30 && c <= 0xFE4F) ||
        (c >= 0xFF00 && c <= 0xFF60) ||
        (c >= 0xFFE0 && c <= 0xFFE6) ||
        (c >= 0x1F300 && c <= 0x1F9FF) ||
        (c >= 0x1FA70 && c <= 0x1FAFF);
      w += wide ? 2 : 1;
    }
    return w;
  }

  // Render a cached comment under COLUMNS=40 and return the comment-line body
  // (after the icon + space prefix) along with the full stripped line.
  function renderCachedComment(comment, columns = '40') {
    fs.mkdirSync(path.dirname(COMMENT_CACHE), { recursive: true });
    fs.writeFileSync(COMMENT_CACHE, JSON.stringify({ comment }));
    const result = runWithArgs(stdinData, ['--colleague-instruction', 'test'], {
      env: { ...process.env, COLUMNS: columns },
    });
    assert.equal(result.exitCode, 0);
    const lines = result.stdout.split('\n');
    assert.equal(lines.length, 3, 'should still emit a comment line');
    const commentLine = stripAnsi(lines[2]);
    // Strip leading icon (private-use Nerd Font glyph, 1 cell) and the space.
    const body = commentLine.replace(/^[^\s]\s/, '');
    return { commentLine, body };
  }

  it('long Japanese comment is truncated at visual-cell budget with ellipsis', () => {
    cleanCommentCache();
    try {
      // 60 hiragana chars = ~120 visual cells; with COLUMNS=40 (budget=36),
      // the comment must be cut and end with …
      const longComment = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんあいうえおかきくけこ';
      const { body } = renderCachedComment(longComment);
      assert.ok(body.endsWith('…'), `should end with ellipsis: ${JSON.stringify(body)}`);
      assert.ok(vw(body) <= 36, `truncated body visual width ${vw(body)} should fit COLUMNS-4=36`);
    } finally {
      cleanCommentCache();
    }
  });

  it('long ASCII comment is truncated with ellipsis (legacy code-unit semantics preserved)', () => {
    cleanCommentCache();
    try {
      // 80 ASCII chars = 80 visual cells; with COLUMNS=40 (budget=36),
      // the legacy behavior was: result length === budget (35 chars + …).
      // visualWidth(ASCII)==length, so the new semantics must produce the
      // identical output for ASCII-only input.
      const longComment = 'a'.repeat(80);
      const { body } = renderCachedComment(longComment);
      assert.ok(body.endsWith('…'), `should end with ellipsis: ${JSON.stringify(body)}`);
      // ASCII => visual width === string length; truncated to exactly budget.
      assert.equal(body.length, 36, `ASCII truncation length should equal budget: got ${body.length}`);
      assert.equal(vw(body), 36, `ASCII visual width should equal budget`);
      // The kept prefix must be the original characters (no width-rounding loss).
      assert.equal(body.slice(0, 35), 'a'.repeat(35));
    } finally {
      cleanCommentCache();
    }
  });

  it('long CJK ideograph comment is truncated at visual-cell budget', () => {
    cleanCommentCache();
    try {
      // 「漢」 = U+6F22 (CJK Unified Ideographs, range 0x4E00-0x9FFF, width 2).
      // 40 kanji = 80 cells; budget 36 => must be cut.
      const longComment = '漢'.repeat(40);
      const { body } = renderCachedComment(longComment);
      assert.ok(body.endsWith('…'), `should end with ellipsis: ${JSON.stringify(body)}`);
      assert.ok(vw(body) <= 36, `CJK truncated body width ${vw(body)} should fit budget=36`);
    } finally {
      cleanCommentCache();
    }
  });

  it('long emoji comment is truncated at visual-cell budget', () => {
    cleanCommentCache();
    try {
      // 🎉 = U+1F389 (Emoji pictograph, range 0x1F300-0x1F9FF, width 2).
      // 30 emoji = 60 cells; budget 36 => must be cut.
      const longComment = '🎉'.repeat(30);
      const { body } = renderCachedComment(longComment);
      assert.ok(body.endsWith('…'), `should end with ellipsis: ${JSON.stringify(body)}`);
      assert.ok(vw(body) <= 36, `emoji truncated body width ${vw(body)} should fit budget=36`);
    } finally {
      cleanCommentCache();
    }
  });

  it('comment fitting within budget is passed through unchanged (no ellipsis)', () => {
    cleanCommentCache();
    try {
      // 10 hiragana = 20 cells, fits comfortably in budget=36.
      const shortComment = 'おつかれさまです！';
      const { body } = renderCachedComment(shortComment);
      assert.ok(!body.endsWith('…'), `should not append ellipsis when within budget: ${JSON.stringify(body)}`);
      assert.ok(body.startsWith(shortComment), `should keep full text: got ${JSON.stringify(body)}`);
    } finally {
      cleanCommentCache();
    }
  });
});

describe('PR fields are not displayed', () => {
  // Claude Code still sends pr.{number,url,review_state}. The status line
  // dropped the segment: the OSC8 link never worked in a real terminal
  // (anthropics/claude-code#26356, closed NOT_PLANNED) and the number and
  // review state were not worth the width.
  const stdinWithPr = {
    cwd: REPO_CWD,
    model: { display_name: 'Opus 4.6' },
    context_window: { used_percentage: 30 },
    pr: {
      number: 99,
      url: 'https://github.com/test/repo/pull/99',
      review_state: 'approved',
    },
  };

  it('PR number, review icon and OSC8 link are all absent', () => {
    const result = run(stdinWithPr);
    assert.equal(result.exitCode, 0);
    const plain = stripAnsi(result.stdout);
    assert.ok(!plain.includes('#99'), 'should not include the PR number');
    assert.ok(!result.stdout.includes('\uF00C'), 'should not include the approved icon');
    assert.ok(!result.stdout.includes('\x1b]8;;'), 'should not emit an OSC8 hyperlink');
  });
});

describe('themes', () => {
  const stdinData = {
    cwd: '/tmp',
    model: { display_name: 'Opus 4.6' },
    context_window: { used_percentage: 30 },
  };

  it('STATUSLINE_THEME=light uses non-bold colors', () => {
    const result = runWithArgs(stdinData, [], { env: { ...process.env, STATUSLINE_THEME: 'light' } });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('\x1b[36m'), 'should contain non-bold cyan for folder');
    assert.ok(!result.stdout.includes('\x1b[1;36m'), 'should not contain bold cyan');
  });

  it('unknown theme name falls back to default', () => {
    const result = runWithArgs(stdinData, [], { env: { ...process.env, STATUSLINE_THEME: 'nonexistent' } });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('\x1b[1;36m'), 'should contain bold cyan (default folder color)');
  });

  it('STATUSLINE_THEME=dracula uses 256-color codes', () => {
    const result = runWithArgs(stdinData, [], { env: { ...process.env, STATUSLINE_THEME: 'dracula' } });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('\x1b[38;5;141m'), 'should contain dracula 256-color purple for model');
  });
});

describe('rate limits', () => {
  function stdinWith(rateLimits) {
    const data = {
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6' },
      context_window: { used_percentage: 30 },
    };
    if (rateLimits) data.rate_limits = rateLimits;
    return data;
  }

  it('shows both windows, rounded', () => {
    const result = run(stdinWith({
      five_hour: { used_percentage: 32.4, resets_at: 1790000000 },
      seven_day: { used_percentage: 67.5, resets_at: 1790500000 },
    }));
    assert.equal(result.exitCode, 0);
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes('5h 32%'), 'should round the 5-hour window down');
    assert.ok(plain.includes('7d 68%'), 'should round the 7-day window up');
  });

  it('shows only the window that arrives', () => {
    const result = run(stdinWith({ seven_day: { used_percentage: 12 } }));
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes('7d 12%'), 'should show the 7-day window');
    assert.ok(!plain.includes('5h'), 'should not show a 5-hour window that was not sent');
  });

  it('omits the segment when rate_limits is absent', () => {
    const result = run(stdinWith(null));
    const plain = stripAnsi(result.stdout);
    assert.ok(!plain.includes('5h'), 'should not show a 5-hour window');
    assert.ok(!plain.includes('7d'), 'should not show a 7-day window');
    assert.ok(!result.stdout.includes('\uF0E4'), 'should not show the meter icon');
  });

  it('omits a window whose used_percentage is missing', () => {
    const result = run(stdinWith({ five_hour: { resets_at: 1790000000 } }));
    const plain = stripAnsi(result.stdout);
    assert.ok(!plain.includes('5h'), 'should not show a window without used_percentage');
  });

  it('replaces the clock: no HH:MM:SS anywhere', () => {
    const result = run(stdinWith({ five_hour: { used_percentage: 10 } }));
    const plain = stripAnsi(result.stdout);
    assert.ok(!/\d\d:\d\d:\d\d/.test(plain), 'should not print a wall clock');
  });
});

describe('prompt cache warmth', () => {
  function stdinWith(promptCache) {
    const data = {
      cwd: '/tmp',
      model: { display_name: 'Opus 4.6' },
      context_window: { used_percentage: 30 },
    };
    if (promptCache) data.prompt_cache = promptCache;
    return data;
  }

  it('warm cache shows the fire icon', () => {
    const result = run(stdinWith({ warm: true, hit_ratio: 0.9 }));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('\uF06D'), 'should show the fire icon');
    assert.ok(!result.stdout.includes('\uF2DC'), 'should not show the snowflake icon');
  });

  it('cold cache shows the snowflake icon', () => {
    const result = run(stdinWith({ warm: false }));
    assert.ok(result.stdout.includes('\uF2DC'), 'should show the snowflake icon');
    assert.ok(!result.stdout.includes('\uF06D'), 'should not show the fire icon');
  });

  it('omits the icon when prompt_cache is absent', () => {
    const result = run(stdinWith(null));
    assert.ok(!result.stdout.includes('\uF06D'), 'should not show the fire icon');
    assert.ok(!result.stdout.includes('\uF2DC'), 'should not show the snowflake icon');
  });

  it('omits the icon when warm is not a boolean', () => {
    // null is the shape that matters: a nullable field reads as "present" to
    // a `!== undefined` check, and would then render as cold.
    for (const warm of [null, 'true', 1]) {
      const result = run(stdinWith({ warm, hit_ratio: 0.5 }));
      assert.ok(!result.stdout.includes('\uF06D'), `should not show the fire icon for warm=${JSON.stringify(warm)}`);
      assert.ok(!result.stdout.includes('\uF2DC'), `should not show the snowflake icon for warm=${JSON.stringify(warm)}`);
    }
  });
});

describe('worktree and session name', () => {
  const base = {
    cwd: '/tmp',
    model: { display_name: 'Opus 4.6' },
    context_window: { used_percentage: 30 },
  };

  function runWide(data) {
    return runWithArgs(data, [], {
      env: { ...process.env, COLUMNS: '200' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  it('worktree.name replaces the path and swaps the folder icon', () => {
    const result = runWide({
      ...base,
      cwd: '/home/u/.claude/worktrees/fix-login',
      worktree: { name: 'fix-login', path: '/home/u/.claude/worktrees/fix-login' },
    });
    assert.equal(result.exitCode, 0);
    const plain = stripAnsi(result.stdout);
    assert.ok(plain.includes('fix-login'), 'should show the worktree name');
    assert.ok(!plain.includes('.claude/worktrees'), 'should not show the worktree path');
    assert.ok(result.stdout.includes('\uF1E0'), 'should show the worktree icon');
    assert.ok(!result.stdout.includes('\uF07C'), 'should not show the folder icon');
  });

  it('path and folder icon stay when worktree is absent', () => {
    const result = runWide(base);
    assert.ok(result.stdout.includes('\uF07C'), 'should show the folder icon');
    assert.ok(!result.stdout.includes('\uF1E0'), 'should not show the worktree icon');
  });

  it('session_name is appended to line 1', () => {
    const result = runWide({ ...base, session_name: 'secrets-migration' });
    const line1 = stripAnsi(result.stdout).split('\n')[0];
    assert.ok(line1.includes('secrets-migration'), 'should show the session name on line 1');
    assert.ok(result.stdout.includes('\uF0C5'), 'should show the session icon');
  });

  it('session_name is dropped when the terminal is too narrow', () => {
    // A git repo cwd, where the branch segment takes the room the name needs.
    const result = runWithArgs({ ...base, cwd: REPO_CWD, session_name: 'secrets-migration' }, [], {
      env: { ...process.env, COLUMNS: '40' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const plain = stripAnsi(result.stdout);
    assert.ok(!plain.includes('secrets-mi'), 'should drop the name rather than overflow');
    assert.ok(!result.stdout.includes('\uF0C5'), 'should not show the session icon');
  });

  it('outside a git repo the name keeps the room the branch would have taken', () => {
    // The branch segment is absent here, so the same width fits more of the
    // name than it would inside a repo.
    const result = runWithArgs({ ...base, session_name: 'abcdefghij-abcdefghij-abcdefghij-ab' }, [], {
      env: { ...process.env, COLUMNS: '80' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const line1 = stripAnsi(result.stdout).split('\n')[0];
    assert.ok(line1.includes('abcdefghij-abcdefghij-abcdefghij-ab'),
      `should fit the whole name: ${line1}`);
  });

  it('no session icon when session_name is absent', () => {
    const result = runWide(base);
    assert.ok(!result.stdout.includes('\uF0C5'), 'should not show the session icon');
  });
});

// Visual cell width, matching index.js: CJK / fullwidth / emoji take 2 cells.
function visualWidth(str) {
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff);
    w += wide ? 2 : 1;
  }
  return w;
}

describe('rendered lines fit the terminal', () => {
  // Below this the layout reserves more than the terminal has: maxContentCols
  // has a floor of 30, and the columns have floors of their own.
  const MIN_SUPPORTED_COLS = 60;

  const inputs = [
    ['everything at once', {
      cwd: REPO_CWD,
      model: { display_name: 'Opus 5 (1M context)' },
      effort: { level: 'xhigh' },
      context_window: { used_percentage: 55 },
      session_name: 'a-very-long-session-name-that-keeps-going-and-going',
      rate_limits: {
        five_hour: { used_percentage: 100 },
        seven_day: { used_percentage: 100 },
      },
      prompt_cache: { warm: true },
    }],
    ['long worktree name', {
      cwd: '/home/u/.claude/worktrees/a-long-worktree-name',
      model: { display_name: 'Sonnet 4.6' },
      worktree: { name: 'a-long-worktree-name-that-keeps-going' },
      context_window: { used_percentage: 5 },
      rate_limits: { seven_day: { used_percentage: 7 } },
      prompt_cache: { warm: false },
    }],
    ['Japanese session name', {
      cwd: REPO_CWD,
      model: { display_name: 'Opus 5' },
      effort: { level: 'medium' },
      context_window: { used_percentage: 80 },
      session_name: 'ステータスラインの作り直しと幅の計算',
      rate_limits: { five_hour: { used_percentage: 42 } },
    }],
    ['outside a git repo', {
      cwd: '/tmp',
      model: { display_name: 'Haiku 4.5' },
      context_window: { used_percentage: 30 },
      session_name: 'no-branch-here-but-a-long-name',
      rate_limits: { five_hour: { used_percentage: 3 }, seven_day: { used_percentage: 9 } },
      prompt_cache: { warm: true },
    }],
  ];

  for (const [label, data] of inputs) {
    for (const cols of [MIN_SUPPORTED_COLS, 80, 100, 120]) {
      it(`${label} fits COLUMNS=${cols}`, () => {
        const result = runWithArgs(data, [], {
          env: { ...process.env, COLUMNS: String(cols) },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        assert.equal(result.exitCode, 0);
        const lines = stripAnsi(result.stdout).split('\n').filter((l) => l.length > 0);
        assert.ok(lines.length >= 2, 'should print both lines');
        for (const [i, line] of lines.entries()) {
          const w = visualWidth(line);
          assert.ok(w <= cols, `line ${i + 1} is ${w} cells, over ${cols}: ${line}`);
        }
      });
    }
  }
});

describe('model name outranks effort when the column is tight', () => {
  // cwd is outside a git repo on purpose: inside one, col1 depends on the
  // branch name and the checkout path, so the column width would differ
  // between a working copy and CI's detached checkout.
  function line2At(cols, model, effortLevel) {
    const result = runWithArgs({
      cwd: '/tmp',
      model: { display_name: model },
      effort: { level: effortLevel },
      context_window: { used_percentage: 55 },
    }, [], {
      env: { ...process.env, COLUMNS: String(cols) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return stripAnsi(result.stdout).split('\n')[1];
  }

  it('keeps both when the column is wide enough', () => {
    const line2 = line2At(120, 'Opus 5', 'xhigh');
    assert.ok(line2.includes('Opus 5 (xhigh)'), line2);
  });

  it('drops the effort rather than truncating the model name', () => {
    // col1 is 13 cells here ("Opus" + " (medium)"), which leaves 4 for the
    // model name once the effort is placed — under the 5-cell floor.
    const line2 = line2At(60, 'Opus', 'medium');
    assert.ok(line2.includes('Opus'), `should keep the model name: ${line2}`);
    assert.ok(!line2.includes('medium'), `should drop the effort: ${line2}`);
    assert.ok(!line2.includes('…'), `should not truncate the model name: ${line2}`);
  });
});
