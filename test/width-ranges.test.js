const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// statusline.test.js measures rendered lines with its own copy of
// index.js's WIDE_RANGES. A copy drifts silently: the width contract would
// still look green while being checked against ranges the command never
// used. Compare the two range lists directly.
const RANGE_RE = /\[(0x[0-9A-Fa-f]+), (0x[0-9A-Fa-f]+)\]/g;

function rangesOf(file) {
  const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const start = src.indexOf('const WIDE_RANGES = [');
  assert.ok(start !== -1, `WIDE_RANGES not found in ${file}`);
  const end = src.indexOf('];', start);
  assert.ok(end !== -1, `end of WIDE_RANGES not found in ${file}`);
  const body = src.slice(start, end);
  const found = [...body.matchAll(RANGE_RE)].map(
    ([, lo, hi]) => `${parseInt(lo, 16)}-${parseInt(hi, 16)}`
  );
  assert.ok(found.length > 0, `no ranges parsed out of WIDE_RANGES in ${file}`);
  return found;
}

describe('visual width ranges', () => {
  it('the test copy matches index.js', () => {
    const source = rangesOf('../index.js');
    const copy = rangesOf('statusline.test.js');
    assert.deepEqual(copy, source,
      'statusline.test.js WIDE_RANGES drifted from index.js');
  });
});

describe('icon width', () => {
  it('index.js counts a Nerd Font icon as two cells', () => {
    // The private use area is added to WIDE_RANGES by hand. Regenerating the
    // table from unicodedata alone drops it, and the layout then reserves one
    // cell per icon while the terminal draws two. Without this the only test
    // that notices is an unrelated assertion about the comment budget.
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    const ranges = [...src.matchAll(/\[(0x[0-9A-Fa-f]+), (0x[0-9A-Fa-f]+)\]/g)]
      .map(([, lo, hi]) => [parseInt(lo, 16), parseInt(hi, 16)]);
    // U+F07C folder-open, the icon ICON_SEG is measured from
    const icon = 0xF07C;
    const covered = ranges.some(([lo, hi]) => icon >= lo && icon <= hi);
    assert.ok(covered, `U+${icon.toString(16).toUpperCase()} must be in WIDE_RANGES`);
  });
});
