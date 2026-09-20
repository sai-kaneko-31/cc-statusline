const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// statusline.test.js measures rendered lines with its own copy of
// index.js's visualWidth. A copy drifts silently: the width contract would
// still look green while being checked against ranges the command never
// used. Compare the two range lists directly.
const RANGE_RE = /code >= (0x[0-9A-Fa-f]+) && code <= (0x[0-9A-Fa-f]+)/g;

function rangesOf(file, fnName) {
  const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const start = src.indexOf(`function ${fnName}(str)`);
  assert.ok(start !== -1, `${fnName} not found in ${file}`);
  const end = src.indexOf('\n}', start);
  assert.ok(end !== -1, `end of ${fnName} not found in ${file}`);
  const body = src.slice(start, end);
  const found = [...body.matchAll(RANGE_RE)].map(
    ([, lo, hi]) => `${parseInt(lo, 16)}-${parseInt(hi, 16)}`
  );
  assert.ok(found.length > 0, `no ranges parsed out of ${fnName} in ${file}`);
  return found;
}

describe('visual width ranges', () => {
  it('the test copy matches index.js', () => {
    const source = rangesOf('../index.js', 'visualWidth');
    const copy = rangesOf('statusline.test.js', 'visualWidth');
    assert.deepEqual(copy, source,
      'statusline.test.js visualWidth ranges drifted from index.js');
  });
});
