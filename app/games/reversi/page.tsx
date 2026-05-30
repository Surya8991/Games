"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { pushRecent, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { cn } from "@/lib/cn";

type Cell = 0 | 1 | 2; // 0 empty, 1 black (player), 2 white (AI)
const N = 8;
const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] as const;

function makeBoard(): Cell[][] {
  const b = Array.from({ length: N }, () => Array(N).fill(0) as Cell[]);
  b[3][3] = 2; b[3][4] = 1; b[4][3] = 1; b[4][4] = 2;
  return b;
}
function flipsFrom(b: Cell[][], r: number, c: number, who: Cell): [number, number][] {
  if (b[r][c] !== 0) return [];
  const flips: [number, number][] = [];
  for (const [dr, dc] of DIRS) {
    const line: [number, number][] = [];
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < N && cc >= 0 && cc < N) {
      if (b[rr][cc] === 0) { line.length = 0; break; }
      if (b[rr][cc] === who) break;
      line.push([rr, cc]);
      rr += dr; cc += dc;
    }
    if (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr][cc] === who) flips.push(...line);
  }
  return flips;
}
function legalMoves(b: Cell[][], who: Cell): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (flipsFrom(b, r, c, who).length) out.push([r, c]);
  return out;
}
function apply(b: Cell[][], r: number, c: number, who: Cell): Cell[][] {
  const flips = flipsFrom(b, r, c, who);
  const nb = b.map((row) => row.slice()) as Cell[][];
  nb[r][c] = who;
  for (const [fr, fc] of flips) nb[fr][fc] = who;
  return nb;
}
function counts(b: Cell[][]) {
  let black = 0, white = 0;
  for (const row of b) for (const v of row) { if (v === 1) black++; if (v === 2) white++; }
  return { black, white };
}
const WEIGHTS = [
  [100,-20, 10,  5,  5, 10,-20,100],
  [-20,-50, -2, -2, -2, -2,-50,-20],
  [ 10, -2,  1,  1,  1,  1, -2, 10],
  [  5, -2,  1,  1,  1,  1, -2,  5],
  [  5, -2,  1,  1,  1,  1, -2,  5],
  [ 10, -2,  1,  1,  1,  1, -2, 10],
  [-20,-50, -2, -2, -2, -2,-50,-20],
  [100,-20, 10,  5,  5, 10,-20,100],
];
function evalBoard(b: Cell[][]): number {
  let s = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (b[r][c] === 2) s += WEIGHTS[r][c];
    else if (b[r][c] === 1) s -= WEIGHTS[r][c];
  }
  return s;
}
function minimax(b: Cell[][], depth: number, who: Cell, alpha = -Infinity, beta = Infinity): { score: number; move: [number, number] | null } {
  if (depth === 0) return { score: evalBoard(b), move: null };
  const moves = legalMoves(b, who);
  if (!moves.length) {
    const opp = who === 1 ? 2 : 1;
    if (!legalMoves(b, opp).length) {
      const { black, white } = counts(b);
      return { score: white > black ? 10000 : black > white ? -10000 : 0, move: null };
    }
    const { score } = minimax(b, depth - 1, opp, alpha, beta);
    return { score, move: null };
  }
  let bestMove: [number, number] | null = moves[0];
  if (who === 2) {
    let best = -Infinity;
    for (const m of moves) {
      const { score } = minimax(apply(b, m[0], m[1], who), depth - 1, 1, alpha, beta);
      if (score > best) { best = score; bestMove = m; }
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return { score: best, move: bestMove };
  } else {
    let best = Infinity;
    for (const m of moves) {
      const { score } = minimax(apply(b, m[0], m[1], who), depth - 1, 2, alpha, beta);
      if (score < best) { best = score; bestMove = m; }
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return { score: best, move: bestMove };
  }
}

type Mode = "ai-easy" | "ai-med" | "ai-hard" | "2p";

export default function ReversiGame() {
  const game = getGame("reversi")!;
  const [board, setBoard] = useState<Cell[][]>(makeBoard);
  const [turn, setTurn] = useState<Cell>(1);
  const [mode, setMode] = useState<Mode>("ai-med");
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { play, vibrate } = useSound();

  useEffect(() => { pushRecent("reversi"); }, []);
  const { black, white } = useMemo(() => counts(board), [board]);
  const moves = useMemo(() => legalMoves(board, turn), [board, turn]);

  const checkOver = useCallback((b: Cell[][], next: Cell): Cell => {
    const mine = legalMoves(b, next);
    if (mine.length) return next;
    const other = next === 1 ? 2 : 1;
    if (legalMoves(b, other).length) return other;
    setOver(true);
    return next;
  }, []);

  // AI move
  useEffect(() => {
    if (mode === "2p" || over) return;
    if (turn === 2) {
      const t = setTimeout(() => {
        const depth = mode === "ai-hard" ? 4 : mode === "ai-med" ? 3 : 1;
        const { move } = minimax(board, depth, 2);
        if (move) {
          const nb = apply(board, move[0], move[1], 2);
          setBoard(nb);
          setTurn(checkOver(nb, 1));
          play("click");
        } else {
          setTurn(checkOver(board, 1));
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [turn, mode, board, over, checkOver, play]);

  useEffect(() => {
    if (over) {
      play(white > black ? "lose" : black > white ? "win" : "blip");
      vibrate(60);
      updateStats("reversi", { plays: 1, wins: black > white ? 1 : 0, losses: white > black ? 1 : 0 });
    }
  }, [over]); // eslint-disable-line

  const place = (r: number, c: number) => {
    if (over) return;
    if (mode !== "2p" && turn !== 1) return;
    if (!moves.some(([mr, mc]) => mr === r && mc === c)) return;
    const nb = apply(board, r, c, turn);
    setBoard(nb);
    setTurn(checkOver(nb, turn === 1 ? 2 : 1));
    play("pop"); vibrate(15);
  };

  const reset = () => { setBoard(makeBoard()); setTurn(1); setOver(false); };

  return (
    <GameShell game={game} score={`B ${black}-${white} W`} onRestart={reset} onOpenHowTo={() => setShowHow(true)} onOpenSettings={() => setShowSettings(true)}>
      <div className="text-xs text-white/60 mb-2">{over ? (black > white ? "Black wins!" : white > black ? "White wins!" : "Draw") : turn === 1 ? "Your move (Black)" : mode === "2p" ? "White's move" : "AI thinking…"}</div>
      <div className="inline-block p-2 rounded-2xl bg-green-900/30 border-2 border-green-600/40 shadow-neon">
        <div className="grid grid-cols-8 gap-0.5">
          {board.flatMap((row, r) => row.map((v, c) => {
            const isLegal = turn === 1 && moves.some(([mr, mc]) => mr === r && mc === c);
            return (
              <button key={`${r}-${c}`} onClick={() => place(r, c)} className={cn("w-9 h-9 sm:w-11 sm:h-11 rounded grid place-items-center bg-green-800/50 hover:bg-green-700/50", isLegal && "ring-2 ring-neon-cyan/60")}>
                {v !== 0 && (
                  <div className={cn("w-7 h-7 sm:w-9 sm:h-9 rounded-full transition", v === 1 ? "bg-black shadow-[inset_0_-4px_8px_rgba(255,255,255,0.2)]" : "bg-white shadow-[inset_0_-4px_8px_rgba(0,0,0,0.3)]")} />
                )}
                {v === 0 && isLegal && <div className="w-3 h-3 rounded-full bg-neon-cyan/40" />}
              </button>
            );
          }))}
        </div>
      </div>
      <GameOverModal open={over} onClose={() => setOver(false)} title={black > white ? "You win!" : white > black ? "AI wins" : "Draw"} score={`${black} – ${white}`} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Place a disc to flip any opponent discs sandwiched between yours.</li>
          <li>Must flip at least one. No moves? Skip turn.</li>
          <li>Game ends when neither side can move. Most discs wins.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings" footer={<button onClick={reset} className="btn-primary w-full justify-center">Restart</button>}>
        <p className="text-xs text-white/60 mb-2">Mode</p>
        <div className="grid grid-cols-2 gap-2">
          {([["ai-easy","AI Easy"],["ai-med","AI Medium"],["ai-hard","AI Hard"],["2p","2 Player"]] as [Mode,string][]).map(([k,l]) => (
            <button key={k} onClick={() => setMode(k)} className={cn("px-3 py-2 rounded-lg border text-sm", mode === k ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>{l}</button>
          ))}
        </div>
      </Modal>
    </GameShell>
  );
}
