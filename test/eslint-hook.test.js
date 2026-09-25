const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const REPO = path.join(__dirname, '..');
const HOOK = path.join(REPO, '.claude', 'hooks', 'eslint-fix.js');

// Hand the hook the input Claude Code sends after an Edit or Write, and return
// the note it leaves for Claude, or '' when it says nothing.
function runHook(filePath) {
  const stdout = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } }),
    encoding: 'utf8',
    timeout: 30000,
  });
  if (stdout === '') return '';
  const out = JSON.parse(stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PostToolUse');
  assert.ok(out.additionalContext, 'output with an empty note should not be sent at all');
  return out.additionalContext;
}

// A project outside this checkout that lints with this repository's config,
// so the tests can write files without touching the working tree.
function makeProject({ withEslint, config }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsl-eslint-hook-'));
  const repoConfig = pathToFileURL(path.join(REPO, 'eslint.config.mjs')).href;
  fs.writeFileSync(path.join(dir, 'eslint.config.mjs'),
    config || `export { default } from '${repoConfig}';\n`);
  if (withEslint) {
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  }
  return dir;
}

describe('eslint-fix hook', () => {
  let project;

  before(() => {
    project = makeProject({ withEslint: true });
  });

  after(() => {
    if (project) fs.rmSync(project, { recursive: true, force: true });
  });

  it('fixes what it can and says the file changed on disk', () => {
    const file = path.join(project, 'fixable.js');
    fs.writeFileSync(file, 'let line2 = 1;\nline2 +=`x`;\nmodule.exports = line2;\n');
    const note = runHook(file);
    assert.equal(fs.readFileSync(file, 'utf8'), 'let line2 = 1;\nline2 += `x`;\nmodule.exports = line2;\n');
    assert.match(note, /eslint --fix rewrote fixable\.js\. Read it again before the next edit\./);
    assert.doesNotMatch(note, /problems left/, note);
  });

  it('reports what the fixer cannot settle', () => {
    const file = path.join(project, 'unfixable.js');
    const source = 'const a = 1; const b = 2;\nmodule.exports = a + b;\n';
    fs.writeFileSync(file, source);
    const note = runHook(file);
    assert.equal(fs.readFileSync(file, 'utf8'), source, 'nothing here is fixable');
    assert.match(note, /^ESLint problems left in unfixable\.js:$/m, note);
    assert.match(note, /^ {2}1:14 @stylistic\/max-statements-per-line /m, note);
    assert.doesNotMatch(note, /rewrote/, note);
  });

  it('says nothing about a clean file', () => {
    const file = path.join(project, 'clean.js');
    fs.writeFileSync(file, 'module.exports = 1;\n');
    assert.equal(runHook(file), '');
  });

  it('leaves files that are not JavaScript alone', () => {
    const file = path.join(project, 'notes.md');
    fs.writeFileSync(file, 'a=1\n');
    assert.equal(runHook(file), '');
    assert.equal(fs.readFileSync(file, 'utf8'), 'a=1\n');
  });

  // A checkout that pulled a new plugin without running npm install again.
  // ESLint then exits 2 and opens its error output with a banner; the note
  // has to carry the cause after it.
  it('passes on why ESLint could not run', () => {
    const broken = makeProject({
      withEslint: true,
      config: 'import missing from \'no-such-package-ccsl\';\nexport default [missing];\n',
    });
    try {
      const file = path.join(broken, 'x.js');
      fs.writeFileSync(file, 'module.exports = 1;\n');
      assert.match(runHook(file),
        /^ESLint could not lint x\.js: Error \[ERR_MODULE_NOT_FOUND\]: Cannot find package 'no-such-package-ccsl'/);
    }
    finally {
      fs.rmSync(broken, { recursive: true, force: true });
    }
  });

  it('says so when ESLint is not installed', () => {
    const bare = makeProject({ withEslint: false });
    try {
      const file = path.join(bare, 'x.js');
      fs.writeFileSync(file, 'module.exports=1;\n');
      assert.match(runHook(file), /^ESLint is not installed in .*, so x\.js was not linted\./);
      assert.equal(fs.readFileSync(file, 'utf8'), 'module.exports=1;\n');
    }
    finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });
});
