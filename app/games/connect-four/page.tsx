"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { pushRecent, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { unlock } from "@/lib/achievements";
import { cn } from "@/lib/cn";

const ROWS = 6;
const COLS = 7;
type Cell = 0 | 1 | 2; // 0 empty, 1 player(red), 2 ai(yellow)
type Mode = "ai-easy" | "ai-med" | "ai-hard" | "2p";

const dirs = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

function makeBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0) as Cell[]);
}

function drop(b: Cell[][], col: number, who: Cell): { row: number; board: Cell[][] } | null {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (b[r][col] === 0) {
      const nb = b.map((row) => row.slice()) as Cell[][];
      nb[r][col] = who;
      return { row: r, board: nb };
    }
  }
  return null;
}

function winLineFrom(b: Cell[][], r: number, c: number): [number, number][] | null {
  const v = b[r][c];
  if (!v) return null;
  for (const [dr, dc] of dirs) {
    const line: [number, number][] = [[r, c]];
    for (let k = 1; k < 4; k++) {
      const rr = r + dr * k,
        cc = c + dc * k;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr][cc] !== v) break;
      line.push([rr, cc]);
    }
    for (let k = 1; k < 4; k++) {
      const rr = r - dr * k,
        cc = c - dc * k;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr][cc] !== v) break;
      line.unshift([rr, cc]);
    }
    if (line.length >= 4) return line.slice(0, 4);
  }
  return null;
}

function findWinner(b: Cell[][]): { who: Cell; line: [number, number][] } | null {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const line = winLineFrom(b, r, c);
      if (line) return { who: b[r][c], line };
    }
  return null;
}

function legalCols(b: Cell[][]) {
  const out: number[] = [];
  for (let c = 0; c < COLS; c++) if (b[0][c] === 0) out.push(c);
  return out;
}

function evalBoard(b: Cell[][]): number {
  const w = findWinner(b);
  if (w?.who === 2) return 10000;
  if (w?.who === 1) return -10000;
  // window scoring
  let score = 0;
  const score4 = (window: Cell[]) => {
    const a = window.filter((v) => v === 2).length;
    const p = window.filter((v) => v === 1).length;
    const e = window.filter((v) => v === 0).length;
    if (a && p) return 0;
    if (a === 3 && e === 1) return 50;
    if (a === 2 && e === 2) return 10;
    if (p === 3 && e === 1) return -60;
    if (p === 2 && e === 2) return -10;
    return 0;
  };
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dr, dc] of dirs) {
        const window: Cell[] = [];
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k,
            cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) {
            window.length = 0;
            break;
          }
          window.push(b[rr][cc]);
        }
        if (window.length === 4) score += score4(window);
      }
  // center bonus
  for (let r = 0; r < ROWS; r++) if (b[r][3] === 2) score += 3;
  for (let r = 0; r < ROWS; r++) if (b[r][3] === 1) score -= 3;
  return score;
}

function minimax(b: Cell[][], depth: number, alpha: number, beta: number, maximizing: boolean): { score: number; col: number } {
  const w = findWinner(b);
  if (w || depth === 0 || legalCols(b).length === 0) {
    return { score: evalBoard(b), col: -1 };
  }
  const cols = legalCols(b).sort((a, b2) => Math.abs(3 - a) - Math.abs(3 - b2));
  let bestCol = cols[0];
  if (maximizing) {
    let value = -Infinity;
    for (const c of cols) {
      const res = drop(b, c, 2)!;
      const { score } = minimax(res.board, depth - 1, alpha, beta, false);
      if (score > value) {
        value = score;
        bestCol = c;
      }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return { score: value, col: bestCol };
  } else {
    let value = Infinity;
    for (const c of cols) {
      const res = drop(b, c, 1)!;
      const { score } = minimax(res.board, depth - 1, alpha, beta, true);
      if (score < value) {
        value = score;
        bestCol = c;
      }
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return { score: value, col: bestCol };
  }
}

function aiPick(b: Cell[][], mode: Mode): number {
  const cols = legalCols(b);
  if (mode === "ai-easy") return cols[Math.floor(Math.random() * cols.length)];
  if (mode === "ai-med" && Math.random() < 0.4) return cols[Math.floor(Math.random() * cols.length)];
  const depth = mode === "ai-hard" ? 6 : 4;
  return minimax(b.map((r) => r.slice()) as Cell[][], depth, -Infinity, Infinity, true).col;
}

export default function ConnectFourGame() {
  const game = getGame("connect-four")!;
  const [board, setBoard] = useState<Cell[][]>(makeBoard);
  const [turn, setTurn] = useState<Cell>(1);
  const [mode, setMode] = useState<Mode>("ai-hard");
  const [hover, setHover] = useState<number | null>(null);
  const [showOver, setShowOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<Cell[][][]>([]);
  const { play, vibrate } = useSound();

  useEffect(() => {
    pushRecent("connect-four");
  }, []);

  const win = useMemo(() => findWinner(board), [board]);
  const draw = !win && board[0].every((v) => v !== 0);
  const finished = !!win || draw;

  useEffect(() => {
    if (!finished) return;
    setShowOver(true);
    if (win) {
      play(win.who === 1 ? "win" : "lose");
      vibrate(win.who === 1 ? [60, 30, 60] : 120);
    } else {
      play("blip");
    }
    updateStats("connect-four", {
      plays: 1,
      wins: win?.who === 1 ? 1 : 0,
      losses: win && win.who !== 1 ? 1 : 0,
    });
    if (win?.who === 1 && mode === "ai-hard") unlock("c4-beat-hard");
  }, [finished]); // eslint-disable-line

  const playCol = useCallback(
    (c: number) => {
      if (finished) return;
      if (mode !== "2p" && turn !== 1) return;
      const res = drop(board, c, turn);
      if (!res) return;
      setHistory((h) => [...h, board]);
      setBoard(res.board);
      setTurn(turn === 1 ? 2 : 1);
      play("pop");
      vibrate(15);
    },
    [board, turn, mode, finished, play, vibrate]
  );

  useEffect(() => {
    if (mode === "2p" || finished) return;
    if (turn === 2) {
      const t = setTimeout(() => {
        const col = aiPick(board, mode);
        const res = drop(board, col, 2);
        if (res) {
          setBoard(res.board);
          setTurn(1);
          play("pop");
        }
      }, 350);
      return () => clearTimeout(t);
    }
  }, [turn, mode, board, finished, play]);

  const reset = () => {
    setBoard(makeBoard());
    setTurn(1);
    setHistory([]);
    setShowOver(false);
  };

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const lastIdx = mode === "2p" ? 1 : 2;
      const back = h.slice(0, Math.max(0, h.length - lastIdx));
      setBoard(h[Math.max(0, h.length - lastIdx)] ?? makeBoard());
      setTurn(1);
      setShowOver(false);
      return back;
    });
  };

  const isWinCell = (r: number, c: number) => win?.line.some(([wr, wc]) => wr === r && wc === c);

  return (
    <GameShell
      game={game}
      onRestart={reset}
      onOpenHowTo={() => setShowHow(true)}
      onOpenSettings={() => setShowSettings(true)}
      rightExtra={
        <button onClick={undo} disabled={!history.length} className="btn-ghost disabled:opacity-30">
          Undo
        </button>
      }
    >
      <div className="text-center mb-3 text-sm text-white/70">
        {finished ? (win ? `${win.who === 1 ? "Red" : "Yellow"} wins!` : "Draw") : turn === 1 ? "Your turn (Red)" : mode === "2p" ? "Yellow's turn" : "AI thinking…"}
      </div>
      <div className="inline-block rounded-2xl bg-blue-900/40 border-2 border-blue-500/40 p-2 sm:p-3 shadow-neon">
        <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
          {Array.from({ length: COLS }).map((_, c) => (
            <button
              key={`hdr-${c}`}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover(null)}
              onClick={() => playCol(c)}
              className="h-6 sm:h-8 rounded-md text-xs text-white/40 hover:bg-white/10"
              aria-label={`Drop in column ${c + 1}`}
            >
              {hover === c ? "▼" : ""}
            </button>
          ))}
          {board.flatMap((row, r) =>
            row.map((v, c) => (
              <button
                key={`${r}-${c}`}
                onClick={() => playCol(c)}
                onMouseEnter={() => setHover(c)}
                className={cn(
                  "w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full grid place-items-center transition",
                  v === 0 && "bg-black/40",
                  v === 1 && "bg-red-500 shadow-[inset_0_-4px_8px_rgba(0,0,0,0.4)]",
                  v === 2 && "bg-yellow-400 shadow-[inset_0_-4px_8px_rgba(0,0,0,0.4)]",
                  isWinCell(r, c) && "ring-4 ring-neon-green animate-pulse"
                )}
                aria-label={`Row ${r + 1}, column ${c + 1}, ${v === 0 ? "empty" : v === 1 ? "red" : "yellow"}`}
              />
            ))
          )}
        </div>
      </div>

      <GameOverModal
        open={showOver}
        onClose={() => setShowOver(false)}
        title={win ? (win.who === 1 ? "You win!" : "AI wins") : "Draw"}
        onRestart={reset}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Drop discs into columns by clicking the top.</li>
          <li>Connect 4 in a row — horizontal, vertical, or diagonal.</li>
          <li>Red goes first. AI plays Yellow on Hard with alpha-beta depth 6.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings" footer={<button className="btn-primary w-full justify-center" onClick={reset}>Restart</button>}>
        <p className="text-xs text-white/60 mb-2">Mode</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["ai-easy", "AI Easy"],
              ["ai-med", "AI Medium"],
              ["ai-hard", "AI Hard"],
              ["2p", "2 Player"],
            ] as [Mode, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={cn(
                "px-3 py-2 rounded-lg border text-sm",
                mode === k ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10"
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </Modal>
    </GameShell>
  );
}
