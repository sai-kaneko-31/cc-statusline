#!/usr/bin/env node
// PostToolUse hook for Edit and Write: runs `eslint --fix` on the JavaScript
// file just written, and tells Claude when the file changed on disk and what
// the fixer could not settle.
//
// Written in Node rather than shell so that reading the hook's JSON input
// needs nothing this repository does not already require.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Claude Code reads a PostToolUse hook's feedback from this JSON shape; plain
// stdout does not reach the model.
function report(text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text },
  }));
}

// The nearest directory above the file that holds the ESLint config. A file
// in a worktree then gets that worktree's config and node_modules, not those
// of the checkout the session started in.
function findProjectRoot(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'eslint.config.mjs'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

function main(input) {
  let filePath;
  try {
    filePath = JSON.parse(input).tool_input.file_path;
  }
  catch {
    return;
  }
  if (typeof filePath !== 'string' || !/\.[cm]?js$/.test(filePath)) return;
  if (!fs.existsSync(filePath)) return;

  const root = findProjectRoot(path.dirname(path.resolve(filePath)));
  if (!root) return;
  const rel = path.relative(root, filePath);

  let eslintBin;
  try {
    eslintBin = path.join(
      path.dirname(require.resolve('eslint/package.json', { paths: [root] })),
      'bin', 'eslint.js',
    );
  }
  catch {
    report(`ESLint is not installed in ${root}, so ${rel} was not linted. Run npm install there.`);
    return;
  }

  const before = fs.readFileSync(filePath);
  const result = spawnSync(
    process.execPath,
    [eslintBin, '--fix', '--no-warn-ignored', '--format', 'json', filePath],
    { cwd: root, encoding: 'utf8' },
  );
  const changed = !before.equals(fs.readFileSync(filePath));

  const notes = [];
  if (changed) {
    notes.push(`eslint --fix rewrote ${rel}. Read it again before the next edit.`);
  }
  // ESLint exits 0 when clean, 1 when problems remain, and 2 when it could not
  // lint at all, such as on a broken config.
  if (result.status === 1) {
    const messages = JSON.parse(result.stdout)[0].messages;
    notes.push(`ESLint problems left in ${rel}:`);
    for (const m of messages) {
      notes.push(`  ${m.line}:${m.column} ${m.ruleId || 'error'} ${m.message}`);
    }
  }
  else if (result.status !== 0) {
    notes.push(`ESLint could not lint ${rel}: ${(result.stderr || '').trim().split('\n')[0]}`);
  }
  if (notes.length > 0) report(notes.join('\n'));
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => main(input));
