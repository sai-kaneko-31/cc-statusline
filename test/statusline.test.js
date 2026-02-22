const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.js');

function run(input) {
  try {
    const stdout = execFileSync('node', [INDEX], {
      input: typeof input === 'string' ? input : JSON.stringify(input),
      encoding: 'utf8',
      timeout: 10000,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', exitCode: err.status };
  }
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
