"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { pushRecent, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { cn } from "@/lib/cn";

type Piece = { color: "r" | "b"; king: boolean } | null;
type Board = Piece[][];
type Move = { from: [number, number]; to: [number, number]; captures: [number, number][] };

function initBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) b[r][c] = { color: "b", king: false };
  for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) b[r][c] = { color: "r", king: false };
  return b;
}

function piecesDirs(p: NonNullable<Piece>): [number, number][] {
  if (p.king) return [[-1,-1],[-1,1],[1,-1],[1,1]];
  return p.color === "r" ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
}

function inBounds(r: number, c: number) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function captureMovesFrom(b: Board, r: number, c: number, chain: [number, number][] = []): Move[] {
  const p = b[r][c]; if (!p) return [];
  const out: Move[] = [];
  for (const [dr, dc] of piecesDirs(p)) {
    const mr = r + dr, mc = c + dc;
    const lr = r + dr * 2, lc = c + dc * 2;
    if (inBounds(lr, lc) && b[mr]?.[mc]?.color && b[mr][mc]!.color !== p.color && b[lr][lc] === null) {
      const nb = b.map((row) => row.slice()) as Board;
      nb[lr][lc] = nb[r][c]; nb[r][c] = null; nb[mr][mc] = null;
      // king on promotion ends jumping
      const promote = !p.king && ((p.color === "r" && lr === 0) || (p.color === "b" && lr === 7));
      if (promote) nb[lr][lc] = { ...nb[lr][lc]!, king: true };
      const nextChain = [...chain, [mr, mc] as [number, number]];
      const further = promote ? [] : captureMovesFrom(nb, lr, lc, nextChain);
      if (further.length === 0) {
        out.push({ from: [r, c], to: [lr, lc], captures: nextChain });
      } else {
        out.push(...further.map((m) => ({ from: [r, c] as [number, number], to: m.to, captures: nextChain.concat(m.captures.slice(nextChain.length)) })));
      }
    }
  }
  return out;
}

function allMoves(b: Board, color: "r" | "b"): Move[] {
  const caps: Move[] = [];
  const slides: Move[] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c]; if (!p || p.color !== color) continue;
    const cs = captureMovesFrom(b, r, c);
    if (cs.length) caps.push(...cs);
    else {
      for (const [dr, dc] of piecesDirs(p)) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && b[nr][nc] === null) slides.push({ from: [r, c], to: [nr, nc], captures: [] });
      }
    }
  }
  // forced capture rule
  return caps.length ? caps : slides;
}

function applyMove(b: Board, m: Move): Board {
  const nb = b.map((row) => row.slice()) as Board;
  const p = nb[m.from[0]][m.from[1]];
  nb[m.from[0]][m.from[1]] = null;
  for (const [cr, cc] of m.captures) nb[cr][cc] = null;
  nb[m.to[0]][m.to[1]] = p!;
  if (p && !p.king && ((p.color === "r" && m.to[0] === 0) || (p.color === "b" && m.to[0] === 7))) {
    nb[m.to[0]][m.to[1]] = { ...p, king: true };
  }
  return nb;
}

function evalBoard(b: Board): number {
  let s = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c]; if (!p) continue;
    const val = (p.king ? 3 : 1) + (p.color === "b" ? r * 0.05 : (7 - r) * 0.05);
    s += p.color === "b" ? val : -val;
  }
  return s;
}
function minimax(b: Board, depth: number, who: "r" | "b", a = -Infinity, beta = Infinity): { score: number; move: Move | null } {
  const moves = allMoves(b, who);
  if (depth === 0 || !moves.length) return { score: !moves.length ? (who === "b" ? -1000 : 1000) : evalBoard(b), move: null };
  let best: Move | null = moves[0];
  if (who === "b") {
    let v = -Infinity;
    for (const m of moves) {
      const { score } = minimax(applyMove(b, m), depth - 1, "r", a, beta);
      if (score > v) { v = score; best = m; }
      a = Math.max(a, v); if (a >= beta) break;
    }
    return { score: v, move: best };
  } else {
    let v = Infinity;
    for (const m of moves) {
      const { score } = minimax(applyMove(b, m), depth - 1, "b", a, beta);
      if (score < v) { v = score; best = m; }
      beta = Math.min(beta, v); if (a >= beta) break;
    }
    return { score: v, move: best };
  }
}

type Mode = "ai-easy" | "ai-med" | "ai-hard" | "2p";

export default function CheckersGame() {
  const game = getGame("checkers")!;
  const [board, setBoard] = useState<Board>(initBoard);
  const [turn, setTurn] = useState<"r" | "b">("r");
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [mode, setMode] = useState<Mode>("ai-med");
  const [over, setOver] = useState(false);
  const [winner, setWinner] = useState<"r" | "b" | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { play, vibrate } = useSound();

  useEffect(() => { pushRecent("checkers"); }, []);

  const moves = useMemo(() => allMoves(board, turn), [board, turn]);
  const movesForSel = useMemo(() => sel ? moves.filter((m) => m.from[0] === sel[0] && m.from[1] === sel[1]) : [], [moves, sel]);

  useEffect(() => {
    if (!moves.length && !over) {
      setOver(true);
      setWinner(turn === "r" ? "b" : "r");
      play(turn === "r" ? "lose" : "win"); vibrate(120);
      updateStats("checkers", { plays: 1, wins: turn === "b" ? 1 : 0, losses: turn === "r" ? 1 : 0 });
    }
  }, [moves, over, turn, play, vibrate]);

  useEffect(() => {
    if (mode === "2p" || over) return;
    if (turn === "b") {
      const t = setTimeout(() => {
        const depth = mode === "ai-hard" ? 5 : mode === "ai-med" ? 3 : 1;
        const { move } = minimax(board, depth, "b");
        if (move) {
          setBoard(applyMove(board, move));
          setTurn("r");
          play(move.captures.length ? "pop" : "click");
        }
      }, 350);
      return () => clearTimeout(t);
    }
  }, [turn, mode, board, over, play]);

  const onCell = (r: number, c: number) => {
    if (over) return;
    if (mode !== "2p" && turn !== "r") return;
    if (sel) {
      const m = movesForSel.find((mv) => mv.to[0] === r && mv.to[1] === c);
      if (m) {
        setBoard(applyMove(board, m));
        setSel(null);
        setTurn(turn === "r" ? "b" : "r");
        play(m.captures.length ? "pop" : "click"); vibrate(m.captures.length ? 25 : 10);
        return;
      }
      if (board[r][c]?.color === turn) setSel([r, c]); else setSel(null);
    } else if (board[r][c]?.color === turn) setSel([r, c]);
  };

  const reset = () => { setBoard(initBoard()); setTurn("r"); setSel(null); setOver(false); setWinner(null); };

  return (
    <GameShell game={game} onRestart={reset} onOpenHowTo={() => setShowHow(true)} onOpenSettings={() => setShowSettings(true)}>
      <div className="text-xs text-white/60 mb-2">{over ? `${winner === "r" ? "You win!" : "AI wins"}` : turn === "r" ? "Your move (red)" : mode === "2p" ? "Black's move" : "AI thinking…"}</div>
      <div className="inline-block rounded-2xl overflow-hidden shadow-neon border-2 border-white/10">
        {board.map((row, r) => (
          <div key={r} className="flex">
            {row.map((p, c) => {
              const dark = (r + c) % 2 === 1;
              const isSel = sel && sel[0] === r && sel[1] === c;
              const canMoveHere = movesForSel.some((m) => m.to[0] === r && m.to[1] === c);
              return (
                <button key={c} onClick={() => onCell(r, c)} className={cn("w-9 h-9 sm:w-12 sm:h-12 grid place-items-center", dark ? "bg-[#5b3a1a]" : "bg-[#e6c79a]", isSel && "ring-4 ring-neon-cyan ring-inset", canMoveHere && "ring-2 ring-neon-yellow/70 ring-inset")}>
                  {p && (
                    <div className={cn("w-7 h-7 sm:w-9 sm:h-9 rounded-full grid place-items-center", p.color === "r" ? "bg-red-500" : "bg-zinc-900", p.king && "ring-2 ring-yellow-300")}>
                      {p.king && <span className="text-yellow-300 text-xs">♛</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <GameOverModal open={over} onClose={() => setOver(false)} title={winner === "r" ? "You win!" : "AI wins"} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Move diagonally forward. Jump over enemies to capture.</li>
          <li>Captures are <b>forced</b> when available. Chain jumps if you can.</li>
          <li>Reach the back row → become a king (move both ways).</li>
          <li>You play red. AI plays black.</li>
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
