"use client";

import { useEffect, useMemo, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getStats, updateStats, pushRecent } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { unlock } from "@/lib/achievements";
import { cn } from "@/lib/cn";

type Cell = "X" | "O" | null;
type Mode = "ai-easy" | "ai-med" | "ai-hard" | "2p";
const SIZES = [3, 4, 5] as const;
type Size = (typeof SIZES)[number];
const WIN_LEN: Record<Size, number> = { 3: 3, 4: 4, 5: 4 };

function winnerOf(board: Cell[], size: Size): { who: Cell; line: number[] } | null {
  const n = WIN_LEN[size];
  const at = (r: number, c: number) => board[r * size + c];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const v = at(r, c);
      if (!v) continue;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ]) {
        const line: number[] = [];
        let ok = true;
        for (let k = 0; k < n; k++) {
          const rr = r + dr * k,
            cc = c + dc * k;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size || at(rr, cc) !== v) {
            ok = false;
            break;
          }
          line.push(rr * size + cc);
        }
        if (ok) return { who: v, line };
      }
    }
  return null;
}

function emptyCells(b: Cell[]) {
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) if (!b[i]) out.push(i);
  return out;
}

// Minimax for 3x3 with alpha-beta. For 4/5 limit depth.
function minimax(
  b: Cell[],
  size: Size,
  me: "X" | "O",
  turn: "X" | "O",
  depth: number,
  maxDepth: number,
  alpha = -Infinity,
  beta = Infinity
): { score: number; idx: number } {
  const w = winnerOf(b, size);
  if (w?.who === me) return { score: 100 - depth, idx: -1 };
  if (w && w.who && w.who !== me) return { score: depth - 100, idx: -1 };
  const empties = emptyCells(b);
  if (!empties.length || depth >= maxDepth) return { score: 0, idx: -1 };
  let bestIdx = empties[0];
  if (turn === me) {
    let best = -Infinity;
    for (const i of empties) {
      b[i] = turn;
      const { score } = minimax(b, size, me, turn === "X" ? "O" : "X", depth + 1, maxDepth, alpha, beta);
      b[i] = null;
      if (score > best) {
        best = score;
        bestIdx = i;
      }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return { score: best, idx: bestIdx };
  } else {
    let best = Infinity;
    for (const i of empties) {
      b[i] = turn;
      const { score } = minimax(b, size, me, turn === "X" ? "O" : "X", depth + 1, maxDepth, alpha, beta);
      b[i] = null;
      if (score < best) {
        best = score;
        bestIdx = i;
      }
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return { score: best, idx: bestIdx };
  }
}

function aiMove(b: Cell[], size: Size, mode: Mode): number {
  const empties = emptyCells(b);
  if (mode === "ai-easy" || Math.random() < (mode === "ai-med" ? 0.4 : 0)) {
    return empties[Math.floor(Math.random() * empties.length)];
  }
  const maxDepth = size === 3 ? 9 : size === 4 ? 4 : 3;
  return minimax(b, size, "O", "O", 0, maxDepth).idx;
}

export default function TicTacToePage() {
  const game = getGame("tic-tac-toe")!;
  const [size, setSize] = useState<Size>(3);
  const [mode, setMode] = useState<Mode>("ai-hard");
  const [board, setBoard] = useState<Cell[]>(() => Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [showOver, setShowOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState({ wins: 0, losses: 0, draws: 0 });
  const { play, vibrate } = useSound();

  const result = useMemo(() => winnerOf(board, size), [board, size]);
  const full = board.every(Boolean);
  const finished = !!result || full;

  useEffect(() => {
    pushRecent("tic-tac-toe");
    const s = getStats("tic-tac-toe");
    setStats({ wins: s.wins, losses: s.losses, draws: (s as any).draws ?? 0 });
  }, []);

  useEffect(() => {
    if (!finished) return;
    play(result ? (result.who === "X" ? "win" : "lose") : "blip");
    vibrate(result ? 80 : 40);
    setShowOver(true);
    const s = getStats("tic-tac-toe");
    const next = {
      ...s,
      plays: s.plays + 1,
      wins: s.wins + (result?.who === "X" ? 1 : 0),
      losses: s.losses + (result && result.who !== "X" ? 1 : 0),
      // @ts-ignore extend
      draws: ((s as any).draws ?? 0) + (!result ? 1 : 0),
    };
    updateStats("tic-tac-toe", next as any);
    setStats({ wins: next.wins, losses: next.losses, draws: (next as any).draws });
    if (mode === "ai-hard" && size === 3 && (result?.who === "X" || !result)) unlock("ttt-beat-hard");
  }, [finished]); // eslint-disable-line

  useEffect(() => {
    if (mode === "2p" || finished) return;
    if (turn === "O") {
      const t = setTimeout(() => {
        setBoard((b) => {
          const nb = b.slice();
          const i = aiMove(nb, size, mode);
          if (i >= 0) nb[i] = "O";
          return nb;
        });
        setTurn("X");
        play("click");
      }, 320);
      return () => clearTimeout(t);
    }
  }, [turn, mode, finished, size, play]);

  const place = (i: number) => {
    if (finished || board[i]) return;
    if (mode !== "2p" && turn !== "X") return;
    const nb = board.slice();
    nb[i] = turn;
    setBoard(nb);
    setTurn(turn === "X" ? "O" : "X");
    play("click");
    vibrate(15);
  };

  const reset = (newSize: Size = size) => {
    setBoard(Array(newSize * newSize).fill(null));
    setTurn("X");
    setShowOver(false);
    setSize(newSize);
  };

  return (
    <GameShell
      game={game}
      onRestart={() => reset()}
      onOpenSettings={() => setShowSettings(true)}
      onOpenHowTo={() => setShowHow(true)}
      rightExtra={
        <div className="hidden md:flex gap-1 text-xs">
          <span className="px-2 py-1 rounded bg-white/5">W {stats.wins}</span>
          <span className="px-2 py-1 rounded bg-white/5">L {stats.losses}</span>
          <span className="px-2 py-1 rounded bg-white/5">D {stats.draws}</span>
        </div>
      }
    >
      <div className="text-center mb-3 text-sm text-white/70">
        {finished
          ? result
            ? `${result.who} wins!`
            : "Draw"
          : mode === "2p"
          ? `Player ${turn}'s turn`
          : turn === "X"
          ? "Your turn (X)"
          : "AI thinking…"}
      </div>
      <div
        className="grid gap-1.5 sm:gap-2 p-2 sm:p-3 rounded-2xl bg-white/5 border border-white/10"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {board.map((v, i) => {
          const inLine = result?.line.includes(i);
          return (
            <button
              key={i}
              onClick={() => place(i)}
              disabled={!!v || finished || (mode !== "2p" && turn !== "X")}
              className={cn(
                "aspect-square w-16 sm:w-20 md:w-24 rounded-xl bg-black/30 border border-white/10 grid place-items-center text-3xl sm:text-4xl md:text-5xl font-bold transition",
                "hover:bg-neon-purple/10 disabled:cursor-not-allowed",
                v === "X" && "text-neon-cyan",
                v === "O" && "text-neon-pink",
                inLine && "ring-2 ring-neon-yellow shadow-neon"
              )}
              aria-label={`Cell ${i + 1}${v ? `, ${v}` : ", empty"}`}
            >
              {v}
            </button>
          );
        })}
      </div>

      <GameOverModal
        open={showOver}
        onClose={() => setShowOver(false)}
        title={result ? (result.who === "X" ? "You win!" : "You lose") : "Draw"}
        extra={
          <div className="text-sm text-white/70">
            Wins {stats.wins} · Losses {stats.losses} · Draws {stats.draws}
          </div>
        }
        onRestart={() => reset()}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1">
          <li>Get {WIN_LEN[size]} in a row — horizontal, vertical, or diagonal.</li>
          <li>You play X, AI plays O (in single-player).</li>
          <li>Hard mode uses unbeatable minimax on 3×3.</li>
        </ul>
      </Modal>
      <Modal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Settings"
        footer={
          <button onClick={() => reset()} className="btn-primary w-full justify-center">
            Apply & restart
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-white/60 mb-2">Board size</p>
            <div className="flex gap-2">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm",
                    size === s ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10"
                  )}
                >
                  {s}×{s}
                </button>
              ))}
            </div>
          </div>
          <div>
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
          </div>
        </div>
      </Modal>
    </GameShell>
  );
}
