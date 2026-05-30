import { Chess, Move, Square } from "chess.js";

// Standard piece values
const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables (white perspective; mirrored for black)
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

function sqIdx(sq: string): number {
  const f = sq.charCodeAt(0) - 97; // a-h => 0-7
  const r = 8 - parseInt(sq[1], 10);
  return r * 8 + f;
}

function evaluate(g: Chess): number {
  if (g.isCheckmate()) return g.turn() === "w" ? -100000 : 100000;
  if (g.isDraw()) return 0;
  let score = 0;
  const board = g.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const idx = r * 8 + c;
      const wIdx = p.color === "w" ? idx : 63 - idx;
      const v = VAL[p.type] + (PST[p.type]?.[wIdx] ?? 0);
      score += p.color === "w" ? v : -v;
    }
  }
  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return moves.slice().sort((a, b) => {
    const score = (m: Move) => (m.captured ? VAL[m.captured] - VAL[m.piece] / 10 : 0) + (m.promotion ? 800 : 0) + (m.flags.includes("c") ? 50 : 0);
    return score(b) - score(a);
  });
}

function minimax(g: Chess, depth: number, alpha: number, beta: number, maximizing: boolean): { score: number; move?: Move } {
  if (depth === 0 || g.isGameOver()) return { score: evaluate(g) };
  const moves = orderMoves(g.moves({ verbose: true }) as Move[]);
  let bestMove: Move | undefined;
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      g.move(m.san);
      const { score } = minimax(g, depth - 1, alpha, beta, false);
      g.undo();
      if (score > best) { best = score; bestMove = m; }
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return { score: best, move: bestMove };
  } else {
    let best = Infinity;
    for (const m of moves) {
      g.move(m.san);
      const { score } = minimax(g, depth - 1, alpha, beta, true);
      g.undo();
      if (score < best) { best = score; bestMove = m; }
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return { score: best, move: bestMove };
  }
}

export function pickMove(fen: string, level: "easy" | "med" | "hard"): Move | null {
  const g = new Chess(fen);
  const moves = g.moves({ verbose: true }) as Move[];
  if (!moves.length) return null;
  if (level === "easy") return moves[Math.floor(Math.random() * moves.length)];
  if (level === "med" && Math.random() < 0.3) return moves[Math.floor(Math.random() * moves.length)];
  const depth = level === "hard" ? 3 : 2;
  const { move } = minimax(g, depth, -Infinity, Infinity, g.turn() === "w");
  return move ?? moves[0];
}
