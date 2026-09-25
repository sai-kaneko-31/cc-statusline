// The icons the statusline draws, the code point ranges that take two terminal
// cells, and the measurement both feed. index.js and the tests read this one
// copy, so what the layout reserves is what the tests check.

// The Ambiguous code points the layout draws itself — the bar's filled cell █,
// the ahead/behind arrows, the truncation ellipsis — are not in this table, so
// they count as one cell. A terminal setting that widens the whole Ambiguous
// class draws them two and the lines run longer than the arithmetic reserved.
// The bar's empty cell ░ is Neutral rather than Ambiguous, so it stays one cell
// either way.
//
// The table is not limited to East Asian Wide, though. The emoji block
// below spans 46 East Asian Wide code points, 80 Ambiguous and 322 Neutral
// (Unicode 15.0), so a branch name holding one of the latter two — ✓ U+2713 is
// Neutral — is reserved two cells and drawn one. The column then pads one cell
// short, which misaligns the two lines without running past the edge.

// Every icon is an Emoji_Presentation code point other than a regional
// indicator. Unicode makes those East Asian Wide, so the terminal and Claude
// Code's own renderer both give them two cells with no setting. Nerd Font icons
// sit in the private use area, which is Ambiguous: Claude Code places them in
// one cell whatever the terminal does, so a terminal set to advance them two no
// longer matches Claude Code's cell grid. Every icon the layout draws is here,
// so that the width check covers the whole set rather than the one the
// arithmetic happens to measure.
const ICONS = {
  FOLDER: '\u{1F4C2}', // 📂 open file folder
  BRANCH: '\u{1F33F}', // 🌿 herb
  ROCKET: '\u{1F680}', // 🚀 rocket (ahead/behind)
  OPUS: '\u{1F3BC}', // 🎼 musical score
  SONNET: '\u{1F4DC}', // 📜 scroll (also any other model)
  HAIKU: '\u{1F343}', // 🍃 leaf fluttering in wind
  HEART: '\u{1F497}', // 💗 growing heart (context window bar)
  COMMENT: '\u{1F4AC}', // 💬 speech balloon
  METER: '\u{1F4CA}', // 📊 bar chart (rate limit usage)
  WORKTREE: '\u{1F333}', // 🌳 deciduous tree (worktree session)
  SESSION: '\u{1F4DD}', // 📝 memo (session name)
};

// Code point ranges that occupy two terminal cells. The East Asian Wide and
// Fullwidth ranges are generated from unicodedata rather than hand-listed —
// picking them by hand left ⭐ ⏰ ⬛ and the CJK extension planes counting as
// one cell, which broke the width contract by tens of cells on a single line.
// The emoji blocks are added on top by hand, so regenerating from unicodedata
// alone drops them. The private use areas are left out, so they count one
// cell as Claude Code counts them.
//
// visualWidth stops at the first range whose low end is above the code point,
// so entries stay sorted by that low end.
const WIDE_RANGES = [
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
];

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
      if (code <= hi) {
        wide = true;
        break;
      }
    }
    w += wide ? 2 : 1;
  }
  return w;
}

module.exports = { ICONS, WIDE_RANGES, visualWidth };
