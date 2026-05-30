// 100 procedurally-defined Breakout levels.
// Each level returns a grid of brick HP values; 0 = empty, 1-3 = HP, -1 = indestructible.

export type LevelDef = {
  index: number;
  name: string;
  speed: number;
  paddleW: number;
  bricks: (-1 | 0 | 1 | 2 | 3 | 4 | 5)[][]; // rows × cols
};

export const COLS = 12;
export const ROWS = 8;

const PATTERNS: Record<string, (r: number, c: number, lvl: number) => -1 | 0 | 1 | 2 | 3 | 4 | 5> = {
  // 1. Full rectangle
  rect: (r, c, l) => {
    if (r >= Math.min(6, 2 + Math.floor(l / 6))) return 0;
    const hp = Math.min(3, 1 + Math.floor(r / 2)) as 1 | 2 | 3;
    return hp;
  },
  // 2. Pyramid
  pyramid: (r, c) => (c >= r && c < COLS - r ? Math.min(3, r + 1) as 1 | 2 | 3 : 0),
  // 3. Inverted pyramid
  invPyramid: (r, c) => (c < r || c >= COLS - r ? 0 : Math.min(3, ROWS - r) as 1 | 2 | 3),
  // 4. Diamond
  diamond: (r, c) => {
    const cx = COLS / 2 - 0.5, cy = ROWS / 2 - 0.5;
    const d = Math.abs(c - cx) + Math.abs(r - cy);
    if (d > 5) return 0;
    return Math.min(3, 4 - Math.floor(d)) as 1 | 2 | 3;
  },
  // 5. Checkerboard
  checker: (r, c) => ((r + c) % 2 ? 0 : 2),
  // 6. Stripes
  stripes: (r) => (r % 2 ? 0 : Math.min(3, r / 2 + 1) as 1 | 2 | 3),
  // 7. Vertical stripes
  vStripes: (r, c) => (c % 3 === 0 ? 2 : c % 3 === 1 ? 1 : 0),
  // 8. Heart
  heart: (r, c) => {
    const grid = [
      "001100110000",
      "011111111100",
      "011111111100",
      "001111111000",
      "000111110000",
      "000011100000",
      "000001000000",
      "000000000000",
    ];
    return parseInt(grid[r][c]) ? 2 : 0;
  },
  // 9. Smiley
  smiley: (r, c) => {
    const grid = [
      "000111111000",
      "001000000100",
      "010011001010",
      "010011001010",
      "010000000010",
      "010100001010",
      "001011110100",
      "000111111000",
    ];
    return parseInt(grid[r][c]) ? 2 : 0;
  },
  // 10. Indestructible cross
  cross: (r, c, l) => {
    const inCross = (r >= 2 && r <= 5 && (c === 5 || c === 6)) || (c >= 2 && c <= 9 && (r === 3 || r === 4));
    const inBlock = r < 6;
    if (inCross) return l > 30 ? -1 : 3;
    if (inBlock) return 1;
    return 0;
  },
  // 11. Borders
  borders: (r, c, l) => {
    if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return l > 40 ? -1 : 3;
    if ((r + c) % 2) return 1;
    return 2;
  },
  // 12. Spiral
  spiral: (r, c) => {
    const grid = [
      "111111111111",
      "100000000001",
      "101111111101",
      "101000000101",
      "101011110101",
      "101000010101",
      "101111110101",
      "100000000101",
    ];
    return parseInt(grid[r][c]) ? 2 : 0;
  },
  // 13. Random scatter
  scatter: (r, c, l) => {
    // deterministic pseudo-random from indices + level
    const seed = (r * 37 + c * 91 + l * 17) % 100;
    if (seed < 60) return 0;
    if (seed < 90) return 1;
    if (seed < 98) return 2;
    return l > 50 ? -1 : 3;
  },
  // 14. Stairs
  stairs: (r, c) => (c < r * 2 + 1 ? Math.min(3, r + 1) as 1 | 2 | 3 : 0),
  // 15. X shape
  xshape: (r, c) => {
    if (c === r || c === ROWS - 1 - r || c === r + 1 || c === ROWS - r) return 3;
    if (Math.abs(c - r) < 2 || Math.abs(c - (ROWS - 1 - r)) < 2) return 1;
    return 0;
  },
};

const PATTERN_KEYS = Object.keys(PATTERNS);

export function buildLevel(idx: number): LevelDef {
  // idx is 1-100
  const lvl = Math.max(1, Math.min(100, idx));
  const patternIdx = (lvl - 1) % PATTERN_KEYS.length;
  const patternName = PATTERN_KEYS[patternIdx];
  const pattern = PATTERNS[patternName];
  const bricks: LevelDef["bricks"] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: LevelDef["bricks"][number] = [];
    for (let c = 0; c < COLS; c++) row.push(pattern(r, c, lvl));
    bricks.push(row);
  }
  // Speed/paddle scaling
  const speed = Math.min(9, 4 + lvl * 0.06);
  const paddleW = Math.max(60, 110 - lvl * 0.4);
  const names = ["Rectangle","Pyramid","Inverted Pyramid","Diamond","Checkerboard","Stripes","Vertical Stripes","Heart","Smiley","Cross","Borders","Spiral","Scatter","Stairs","X-Shape"];
  return {
    index: lvl,
    name: `Lvl ${lvl}: ${names[patternIdx]}${lvl > 15 ? " ★" : ""}`,
    speed,
    paddleW,
    bricks,
  };
}

export const TOTAL_LEVELS = 100;
