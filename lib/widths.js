// The icons the statusline draws, the code point ranges that take two terminal
// cells, and the measurement both feed. index.js and the tests read this one
// copy, so what the layout reserves is what the tests check.

// How many cells the terminal advances a Nerd Font icon. Unicode calls the
// private use areas Ambiguous, which leaves the width to the terminal's own
// table — that table is what advances the cursor, not the font's metrics. Two
// is the target, and Cica's glyphs fit inside two (its U+F07C draws 1.57 cells
// of ink), so nothing spills into the next cell. Set STATUSLINE_ICON_CELLS=1
// for a terminal that advances one and cannot be told otherwise. README's
// Requirements says which terminals can be told and how to check one in a line.
//
// Only the private use areas are widened out of the Ambiguous class. Every
// other Ambiguous code point the layout draws — the bar's █, the ahead/behind
// arrows, the truncation ellipsis — is counted as one cell here, so a terminal
// setting that widens the whole class makes the lines longer than the
// arithmetic expects.
const ICON_CELLS = process.env.STATUSLINE_ICON_CELLS === '1' ? 1 : 2;

// Nerd Font icons. Every icon the layout draws is here, so that the width
// check covers the whole set rather than the one the arithmetic happens to
// measure.
const ICONS = {
  FOLDER: '\uF07C',   //  folder-open
  BRANCH: '\uF126',   //  code-fork
  ROCKET: '\uF135',   //  rocket
  OPUS: '\uF2DB',     //  microchip
  SONNET: '\uF005',   //  star
  HAIKU: '\uF0F4',    //  coffee
  HEART: '\uF004',    //  heart
  COMMENT: '\uF075',  //  comment
  METER: '\uF0E4',       //  dashboard (rate limit usage)
  WORKTREE: '\uF1E0',    //  share-alt (worktree session)
  SESSION: '\uF0C5',     //  files-o (session name)
  CACHE_WARM: '\uF06D',  //  fire (prompt cache warm)
  CACHE_COLD: '\uF2DC',  //  snowflake (prompt cache cold)
};

// Code point ranges that occupy two terminal cells. The East Asian Wide and
// Fullwidth ranges are generated from unicodedata rather than hand-listed —
// picking them by hand left ⭐ ⏰ ⬛ and the CJK extension planes counting as
// one cell, which broke the width contract by tens of cells on a single line.
// The emoji blocks and the private use areas are added on top by hand, so
// regenerating from unicodedata alone drops them.
//
// The private use planes are listed whole rather than the ranges a font happens
// to fill, so that adding icons never needs an edit here when a font gains or
// moves glyphs. Planes 15 and 16 are private use end to end, so widening them
// catches nothing standard.
//
// visualWidth stops at the first range whose low end is above the code point,
// so entries stay sorted by that low end.
const ALL_WIDE_RANGES = [
  [0x1100, 0x115F],
  [0x231A, 0x231B],
  [0x2329, 0x232A],
  [0x23E9, 0x23EC],
  [0x23F0, 0x23F0],
  [0x23F3, 0x23F3],
  [0x25FD, 0x25FE],
  [0x2600, 0x27BF],
  [0x2B1B, 0x2B1C],
  [0x2B50, 0x2B50],
  [0x2B55, 0x2B55],
  [0x2E80, 0x2E99],
  [0x2E9B, 0x2EF3],
  [0x2F00, 0x2FD5],
  [0x2FF0, 0x2FFB],
  [0x3000, 0x303E],
  [0x3041, 0x3096],
  [0x3099, 0x30FF],
  [0x3105, 0x312F],
  [0x3131, 0x318E],
  [0x3190, 0x31E3],
  [0x31F0, 0x321E],
  [0x3220, 0x3247],
  [0x3250, 0x4DBF],
  [0x4E00, 0xA48C],
  [0xA490, 0xA4C6],
  [0xA960, 0xA97C],
  [0xAC00, 0xD7A3],
  [0xE000, 0xF8FF],  // private use (BMP)
  [0xF900, 0xFAFF],
  [0xFE10, 0xFE19],
  [0xFE30, 0xFE52],
  [0xFE54, 0xFE66],
  [0xFE68, 0xFE6B],
  [0xFF01, 0xFF60],
  [0xFFE0, 0xFFE6],
  [0x16FE0, 0x16FE4],
  [0x16FF0, 0x16FF1],
  [0x17000, 0x187F7],
  [0x18800, 0x18CD5],
  [0x18D00, 0x18D08],
  [0x1AFF0, 0x1AFF3],
  [0x1AFF5, 0x1AFFB],
  [0x1AFFD, 0x1AFFE],
  [0x1B000, 0x1B122],
  [0x1B132, 0x1B132],
  [0x1B150, 0x1B152],
  [0x1B155, 0x1B155],
  [0x1B164, 0x1B167],
  [0x1B170, 0x1B2FB],
  [0x1F004, 0x1F004],
  [0x1F0CF, 0x1F0CF],
  [0x1F18E, 0x1F18E],
  [0x1F191, 0x1F19A],
  [0x1F200, 0x1F202],
  [0x1F210, 0x1F23B],
  [0x1F240, 0x1F248],
  [0x1F250, 0x1F251],
  [0x1F260, 0x1F265],
  [0x1F300, 0x1F9FF],
  [0x1FA70, 0x1FAFF],
  [0x20000, 0x2FFFD],
  [0x30000, 0x3FFFD],
  [0xF0000, 0xFFFFD],   // private use (plane 15)
  [0x100000, 0x10FFFD], // private use (plane 16)
];

// The private use entries are the ones ICON_CELLS decides. The CJK
// compatibility block sitting next to the first one is East Asian Wide and
// comes from unicodedata, so it stays either way.
const PRIVATE_USE_RANGES = [
  [0xE000, 0xF8FF],
  [0xF0000, 0xFFFFD],
  [0x100000, 0x10FFFD],
];

const WIDE_RANGES = ICON_CELLS === 2
  ? ALL_WIDE_RANGES
  : ALL_WIDE_RANGES.filter(
    ([lo, hi]) => !PRIVATE_USE_RANGES.some(([puLo, puHi]) => puLo === lo && puHi === hi)
  );

// Visual display width: a wide code point counts as 2 cells, the rest as 1.
// Every width in the layout is measured here — column widths, truncation
// and padding — so that what the arithmetic counts is what the terminal draws.
function visualWidth(str) {
  let w = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    let wide = false;
    for (const [lo, hi] of WIDE_RANGES) {
      if (code < lo) break;
      if (code <= hi) { wide = true; break; }
    }
    w += wide ? 2 : 1;
  }
  return w;
}

module.exports = { ICON_CELLS, ICONS, PRIVATE_USE_RANGES, WIDE_RANGES, visualWidth };
