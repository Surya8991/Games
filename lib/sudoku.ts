// Sudoku generator + solver
export type Board = number[][];

function shuffled<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function valid(b: Board, r: number, c: number, n: number): boolean {
  for (let i = 0; i < 9; i++) if (b[r][i] === n || b[i][c] === n) return false;
  const r0 = Math.floor(r / 3) * 3, c0 = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (b[r0 + i][c0 + j] === n) return false;
  return true;
}

function solve(b: Board, count = { n: 0 }, limit = 2): boolean {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (b[r][c] === 0) {
      for (const n of shuffled([1,2,3,4,5,6,7,8,9])) {
        if (valid(b, r, c, n)) {
          b[r][c] = n;
          if (solve(b, count, limit)) return true;
          b[r][c] = 0;
        }
      }
      return false;
    }
  }
  count.n++;
  return count.n >= 1;
}

function countSolutions(b: Board, limit = 2): number {
  let count = 0;
  function go(): boolean {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (b[r][c] === 0) {
        for (let n = 1; n <= 9; n++) {
          if (valid(b, r, c, n)) {
            b[r][c] = n;
            if (go()) { b[r][c] = 0; return true; }
            b[r][c] = 0;
          }
        }
        return false;
      }
    }
    count++;
    return count >= limit;
  }
  go();
  return count;
}

export function generate(difficulty: "easy" | "med" | "hard" | "expert"): { puzzle: Board; solution: Board } {
  const solution: Board = Array.from({ length: 9 }, () => Array(9).fill(0));
  solve(solution);
  const puzzle: Board = solution.map((r) => r.slice());
  const removeCount = { easy: 38, med: 48, hard: 54, expert: 58 }[difficulty];
  const cells = shuffled(Array.from({ length: 81 }, (_, i) => i));
  let removed = 0;
  for (const idx of cells) {
    if (removed >= removeCount) break;
    const r = Math.floor(idx / 9), c = idx % 9;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;
    const copy = puzzle.map((row) => row.slice());
    if (countSolutions(copy) === 1) removed++;
    else puzzle[r][c] = backup;
  }
  return { puzzle, solution };
}

export function isComplete(b: Board): boolean {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (b[r][c] === 0) return false;
  return true;
}

export function findErrors(b: Board, solution: Board): boolean[][] {
  return b.map((row, r) => row.map((v, c) => v !== 0 && v !== solution[r][c]));
}
