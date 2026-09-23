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
    // The private use areas are added to WIDE_RANGES by hand. Regenerating the
    // table from unicodedata alone drops them, and the layout then reserves one
    // cell per icon while the terminal draws two. Without this the only test
    // that notices is an unrelated assertion about the comment budget.
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    // ICON_FOLDER is what ICON_SEG measures, so read it rather than repeating
    // the code point here.
    const iconMatch = src.match(/const ICON_FOLDER = '\\u([0-9A-Fa-f]+)'/);
    assert.ok(iconMatch, 'ICON_FOLDER not found in index.js');
    const icon = parseInt(iconMatch[1], 16);
    const ranges = rangesOf('../index.js').map((r) => r.split('-').map(Number));
    const covered = ranges.some(([lo, hi]) => icon >= lo && icon <= hi);
    assert.ok(covered,
      `U+${icon.toString(16).toUpperCase()} (ICON_FOLDER) must be in WIDE_RANGES`);
  });

  it('every icon the layout draws is the same two cells', () => {
    // ICON_SEG measures ICON_FOLDER but stands in for every icon, and the cache
    // slot measures whichever of the two cache icons the line draws. Both hold
    // only while the whole set is in WIDE_RANGES, so check the set rather than
    // the one icon the arithmetic happens to read.
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    // Read every ICON_ declaration, then resolve each one's code point. A regex
    // that only matched one spelling would let an icon written another way slip
    // past while the count still looked plausible, which is the hole this test
    // exists to close. So take all of them first and account for each one:
    // anything that is not a quoted literal has to be named here on purpose.
    const all = [...src.matchAll(/^const (ICON_[A-Z_]+) = (.*)$/gm)];
    assert.ok(all.length >= 14, `expected the icon constants, got ${all.length}`);
    const derived = all.filter(([, , value]) => !/^['"`]/.test(value)).map(([, name]) => name);
    assert.deepEqual(derived, ['ICON_SEG'],
      `ICON_SEG is a cell count, not an icon. Anything else here is an icon this test cannot read: ${derived.join(', ')}`);
    const declarations = all
      .filter(([, , value]) => /^['"`]/.test(value))
      .map(([, name, value]) => {
        const quote = value[0];
        const literal = value.match(new RegExp(`^${quote}((?:\\\\.|[^\\\\${quote}])*)${quote}`));
        assert.ok(literal, `${name} is not a closed string literal: ${value}`);
        return [name, literal[1]];
      });
    const icons = declarations.map(([name, literal]) => {
      const escaped = literal.match(/^\\u\{?([0-9A-Fa-f]+)\}?$/);
      if (escaped) return [name, parseInt(escaped[1], 16)];
      const points = [...literal];
      assert.equal(points.length, 1,
        `${name} is not a single code point, so its width cannot be checked: ${literal}`);
      return [name, points[0].codePointAt(0)];
    });
    const ranges = rangesOf('../index.js').map((r) => r.split('-').map(Number));
    const outside = icons
      .filter(([, cp]) => !ranges.some(([lo, hi]) => cp >= lo && cp <= hi))
      .map(([name, cp]) => `${name} (U+${cp.toString(16).toUpperCase()})`);
    assert.deepEqual(outside, [],
      `these icons would be measured as one cell: ${outside.join(', ')}`);
  });
});
