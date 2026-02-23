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
});
