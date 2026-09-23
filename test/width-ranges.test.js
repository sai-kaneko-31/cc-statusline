const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const {
  ICON_CELLS, ICONS, PRIVATE_USE_RANGES, WIDE_RANGES, visualWidth,
} = require('../lib/widths');

const WIDTHS = require.resolve('../lib/widths');

// lib/widths.js reads STATUSLINE_ICON_CELLS once, when it is required, so the
// other setting has to be measured in a second process.
function widthsUnder(cells) {
  const script = `
    const w = require(process.argv[1]);
    console.log(JSON.stringify({
      cells: w.ICON_CELLS,
      ranges: w.WIDE_RANGES,
      folder: w.visualWidth(w.ICONS.FOLDER),
      cjkCompat: w.visualWidth('\\uF900'),
      japanese: w.visualWidth('\\u3042'),
    }));
  `;
  const env = { ...process.env };
  if (cells === null) delete env.STATUSLINE_ICON_CELLS;
  else env.STATUSLINE_ICON_CELLS = cells;
  const out = execFileSync(process.execPath, ['-e', script, WIDTHS], {
    env, encoding: 'utf8', timeout: 10000,
  });
  return JSON.parse(out);
}

describe('icon width', () => {
  it('every icon the layout draws is the same two cells', () => {
    // The arithmetic reserves ICON_SEG cells per icon and measures ICONS.FOLDER
    // for all of them, so the whole set has to agree. Reading ICONS rather than
    // index.js's source text means an icon added in any spelling is checked.
    assert.ok(Object.keys(ICONS).length > 0, 'ICONS is empty');
    const wrong = Object.entries(ICONS)
      .filter(([, ch]) => visualWidth(ch) !== 2)
      .map(([name, ch]) => `${name} (U+${ch.codePointAt(0).toString(16).toUpperCase()}) = ${visualWidth(ch)}`);
    assert.deepEqual(wrong, [], `these icons are not two cells: ${wrong.join(', ')}`);
  });

  it('each icon is a single code point', () => {
    // visualWidth sums the cells of every code point, so a two-code-point
    // icon would measure four and pass the check above while the terminal
    // draws one glyph.
    const multi = Object.entries(ICONS)
      .filter(([, ch]) => [...ch].length !== 1)
      .map(([name, ch]) => `${name} (${[...ch].length} code points: ${JSON.stringify(ch)})`);
    assert.deepEqual(multi, [], `these icons are not one code point: ${multi.join(', ')}`);
  });

  it('the private use ranges are entries of the table they filter', () => {
    // PRIVATE_USE_RANGES names the entries STATUSLINE_ICON_CELLS removes. If
    // one of them stopped matching an entry in the table, the filter would
    // quietly drop nothing and a one-cell terminal would keep the two-cell
    // arithmetic. Measured with the default, where the table still has them.
    assert.equal(ICON_CELLS, 2, 'run this suite without STATUSLINE_ICON_CELLS');
    const missing = PRIVATE_USE_RANGES.filter(
      ([lo, hi]) => !WIDE_RANGES.some(([l, h]) => l === lo && h === hi)
    ).map(([lo, hi]) => `[0x${lo.toString(16)}, 0x${hi.toString(16)}]`);
    assert.deepEqual(missing, [], `not in WIDE_RANGES: ${missing.join(', ')}`);
  });

  it('the ranges stay sorted by their low end', () => {
    // visualWidth stops at the first range whose low end is above the code
    // point, so an out-of-order entry is never reached and its code points
    // silently measure one cell.
    for (let i = 1; i < WIDE_RANGES.length; i += 1) {
      const [prevLo, prevHi] = WIDE_RANGES[i - 1];
      const [lo] = WIDE_RANGES[i];
      assert.ok(lo > prevHi,
        `[0x${lo.toString(16)}, ...] follows [0x${prevLo.toString(16)}, 0x${prevHi.toString(16)}]`);
    }
  });
});

describe('STATUSLINE_ICON_CELLS', () => {
  it('defaults to two cells', () => {
    assert.equal(ICON_CELLS, 2);
    assert.equal(widthsUnder(null).cells, 2);
  });

  it('set to 1, it drops the private use ranges and nothing else', () => {
    const two = widthsUnder(null);
    const one = widthsUnder('1');
    assert.equal(one.cells, 1);
    assert.equal(one.folder, 1, 'an icon should measure one cell');
    // The CJK compatibility block sits next to the BMP private use area but is
    // East Asian Wide, and Japanese text is wide in every terminal. Neither
    // depends on how the terminal advances an icon.
    assert.equal(one.cjkCompat, 2, 'U+F900 is East Asian Wide, not private use');
    assert.equal(one.japanese, 2, 'U+3042 is East Asian Wide, not private use');
    const dropped = two.ranges.filter(
      ([lo]) => !one.ranges.some(([lo2]) => lo2 === lo)
    );
    assert.deepEqual(dropped, PRIVATE_USE_RANGES,
      'exactly the private use ranges should go');
  });

  it('any other value leaves the icons at two cells', () => {
    // The layout is built for two, so only the documented opt-in narrows it.
    for (const value of ['', '0', '2', 'true', 'yes']) {
      assert.equal(widthsUnder(value).folder, 2,
        `STATUSLINE_ICON_CELLS=${JSON.stringify(value)} should not narrow the icons`);
    }
  });
});
