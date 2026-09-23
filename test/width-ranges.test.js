const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ICONS, WIDE_RANGES, visualWidth } = require('../lib/widths');

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

  it('every icon is an emoji that needs no terminal setting', () => {
    // Unicode makes every Emoji_Presentation code point East Asian Wide except
    // the 26 regional indicators, which are Neutral and pair up into flags. The
    // rest are what terminals and Claude Code's renderer both count two cells,
    // which is what the arithmetic reserves. The check above cannot catch a
    // wrong pick: the emoji blocks in WIDE_RANGES also hold Neutral code points
    // such as U+1F3F7, which measure two here and are drawn one.
    const off = Object.entries(ICONS)
      .filter(([, ch]) => !/^(?!\p{Regional_Indicator})\p{Emoji_Presentation}$/u.test(ch))
      .map(([name, ch]) => `${name} (U+${ch.codePointAt(0).toString(16).toUpperCase()})`);
    assert.deepEqual(off, [],
      `these icons are not a wide Emoji_Presentation code point: ${off.join(', ')}`);
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

  it('the Ambiguous code points the layout draws stay one cell', () => {
    // The layout draws code points besides the icons that a terminal may treat
    // as Ambiguous, and reserves one cell for each. A terminal told to widen the whole
    // Ambiguous class draws them two cells wide and the lines run past the
    // edge, which is why README's Requirements tells Windows Terminal users not
    // to set that. Pin the premise that warning rests on.
    const narrow = {
      '\u2588': 'the context bar\u2019s filled cell',
      '\u2591': 'the context bar\u2019s empty cell',
      '\u2191': 'the ahead arrow',
      '\u2193': 'the behind arrow',
      '\u2026': 'the truncation ellipsis',
    };
    for (const [ch, what] of Object.entries(narrow)) {
      assert.equal(visualWidth(ch), 1,
        `${what} (U+${ch.codePointAt(0).toString(16).toUpperCase()}) must stay one cell`);
    }
  });

  it('private use code points measure one cell', () => {
    // Unicode calls the private use areas Ambiguous, and Claude Code's renderer
    // places them in one cell. A branch or session name holding one is reserved
    // the cell Claude Code gives it. U+F900 sits next to the BMP private use
    // area but is East Asian Wide, so it stays two.
    for (const cp of [0xE000, 0xF07C, 0xF8FF, 0xF0000, 0xFFFFD, 0x100000, 0x10FFFD]) {
      assert.equal(visualWidth(String.fromCodePoint(cp)), 1,
        `U+${cp.toString(16).toUpperCase()} should measure one cell`);
    }
    assert.equal(visualWidth('\uF900'), 2, 'U+F900 is East Asian Wide');
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
