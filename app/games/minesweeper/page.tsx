"use client";

import { useEffect, useMemo, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { unlock } from "@/lib/achievements";
import { cn } from "@/lib/cn";
import { Flag, Bomb } from "lucide-react";

type Difficulty = "beginner" | "intermediate" | "expert";
const DIFF: Record<Difficulty, { rows: number; cols: number; mines: number }> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

type Cell = {
  mine: boolean;
  open: boolean;
  flagged: boolean;
  question: boolean;
  adj: number;
};

function makeBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, open: false, flagged: false, question: false, adj: 0 }))
  );
}

function placeMines(b: Cell[][], mines: number, safeR: number, safeC: number) {
  const rows = b.length, cols = b[0].length;
  const banned = new Set<string>();
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) banned.add(`${safeR + dr},${safeC + dc}`);
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (b[r][c].mine || banned.has(`${r},${c}`)) continue;
    b[r][c].mine = true;
    placed++;
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (b[r][c].mine) continue;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      if (b[rr][cc].mine) n++;
    }
    b[r][c].adj = n;
  }
}

function flood(b: Cell[][], r: number, c: number) {
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [rr, cc] = stack.pop()!;
    const cell = b[rr][cc];
    if (cell.open || cell.flagged) continue;
    cell.open = true;
    if (cell.adj === 0 && !cell.mine) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = rr + dr, nc = cc + dc;
        if (nr < 0 || nc < 0 || nr >= b.length || nc >= b[0].length) continue;
        if (!b[nr][nc].open) stack.push([nr, nc]);
      }
    }
  }
}

const NUM_COLORS = ["", "#22d3ee", "#22ee9c", "#fde047", "#f59e0b", "#ec4899", "#a855f7", "#fff", "#fff"];

export default function MinesweeperGame() {
  const game = getGame("minesweeper")!;
  const [diff, setDiff] = useState<Difficulty>("beginner");
  const cfg = DIFF[diff];
  const [board, setBoard] = useState<Cell[][]>(() => makeBoard(cfg.rows, cfg.cols));
  const [seeded, setSeeded] = useState(false);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [best, setBest] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { play, vibrate } = useSound();

  useEffect(() => { pushRecent("minesweeper"); }, []);
  useEffect(() => { setBest(getHighScore("minesweeper", `t-${diff}`)); reset(diff); /* eslint-disable-next-line */ }, [diff]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTime((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const reset = (d: Difficulty = diff) => {
    const c = DIFF[d];
    setBoard(makeBoard(c.rows, c.cols));
    setSeeded(false);
    setOver(false);
    setWon(false);
    setTime(0);
    setRunning(false);
  };

  const flagCount = useMemo(() => board.flat().filter((c) => c.flagged).length, [board]);
  const remaining = cfg.mines - flagCount;

  const click = (r: number, c: number) => {
    if (over) return;
    setBoard((b) => {
      const nb = b.map((row) => row.map((cell) => ({ ...cell })));
      if (!seeded) {
        placeMines(nb, cfg.mines, r, c);
        setSeeded(true);
        setRunning(true);
      }
      const cell = nb[r][c];
      if (cell.flagged || cell.open) return nb;
      if (cell.mine) {
        cell.open = true;
        // reveal all
        for (const row of nb) for (const cc of row) if (cc.mine) cc.open = true;
        setOver(true);
        setWon(false);
        setRunning(false);
        play("lose"); vibrate(180);
        updateStats("minesweeper", { plays: 1, losses: 1 });
      } else {
        flood(nb, r, c);
        play("click"); vibrate(10);
        // win check
        const allSafeOpen = nb.flat().every((cc) => cc.mine || cc.open);
        if (allSafeOpen) {
          setOver(true); setWon(true); setRunning(false);
          play("win"); vibrate([40, 30, 60]);
          const prev = getHighScore("minesweeper", `t-${diff}`);
          if (prev === 0 || time < prev) {
            setHighScore("minesweeper", time, `t-${diff}`);
            setBest(time);
          }
          updateStats("minesweeper", { plays: 1, wins: 1 });
          if (diff === "beginner") unlock("mine-beginner");
          if (diff === "expert") unlock("mine-expert");
        }
      }
      return nb;
    });
  };

  const flag = (r: number, c: number) => {
    if (over) return;
    setBoard((b) => {
      const nb = b.map((row) => row.map((cell) => ({ ...cell })));
      const cell = nb[r][c];
      if (cell.open) return nb;
      if (!cell.flagged && !cell.question) cell.flagged = true;
      else if (cell.flagged) { cell.flagged = false; cell.question = true; }
      else cell.question = false;
      play("tick");
      return nb;
    });
  };

  // Chord click: open all neighbours if flag count matches
  const chord = (r: number, c: number) => {
    const cell = board[r][c];
    if (!cell.open || !cell.adj) return;
    let flags = 0;
    const toOpen: [number, number][] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= board.length || cc >= board[0].length) continue;
      if (board[rr][cc].flagged) flags++;
      else if (!board[rr][cc].open) toOpen.push([rr, cc]);
    }
    if (flags === cell.adj) {
      toOpen.forEach(([rr, cc]) => click(rr, cc));
    }
  };

  const cellPx = diff === "expert" ? "w-6 h-6 text-[10px]" : diff === "intermediate" ? "w-7 h-7 text-xs" : "w-8 h-8 text-sm";
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <GameShell
      game={game}
      score={
        <span className="flex items-center gap-2">
          <Bomb size={12} /> {remaining}
        </span>
      }
      best={best ? fmt(best) : "—"}
      onRestart={() => reset()}
      onOpenHowTo={() => setShowHow(true)}
      onOpenSettings={() => setShowSettings(true)}
      rightExtra={<span className="text-xs text-white/60 tabular-nums">⏱ {fmt(time)}</span>}
    >
      <div className="overflow-auto p-2 rounded-2xl bg-bg-soft border border-white/10 shadow-neon max-w-full">
        <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))` }}>
          {board.map((row, r) =>
            row.map((cell, c) => (
              <button
                key={`${r}-${c}`}
                onClick={() => (cell.open ? chord(r, c) : click(r, c))}
                onContextMenu={(e) => { e.preventDefault(); flag(r, c); }}
                onTouchStart={(e) => {
                  const target = e.currentTarget;
                  const timer = window.setTimeout(() => flag(r, c), 350);
                  const clear = () => window.clearTimeout(timer);
                  target.addEventListener("touchend", clear, { once: true });
                  target.addEventListener("touchmove", clear, { once: true });
                }}
                className={cn(
                  cellPx,
                  "grid place-items-center font-bold select-none",
                  cell.open
                    ? cell.mine
                      ? "bg-red-500/70 text-black"
                      : "bg-white/5 text-white"
                    : "bg-white/15 hover:bg-neon-purple/20 border border-white/5"
                )}
                style={cell.open && cell.adj ? { color: NUM_COLORS[cell.adj] } : undefined}
                aria-label={cell.open ? (cell.mine ? "mine" : `${cell.adj}`) : cell.flagged ? "flag" : "hidden"}
              >
                {cell.open ? (cell.mine ? "💣" : cell.adj || "") : cell.flagged ? <Flag size={12} /> : cell.question ? "?" : ""}
              </button>
            ))
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-white/40">Left-click reveal · Right-click / long-press to flag · Click number to chord</p>

      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        title={won ? "Cleared!" : "Boom"}
        score={won ? fmt(time) : "💀"}
        best={best ? fmt(best) : "—"}
        isNewBest={won && time === best && time > 0}
        onRestart={() => reset()}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Reveal all non-mine cells. Numbers show how many mines touch that cell.</li>
          <li>Right-click (or long-press) to flag a suspected mine.</li>
          <li>Click a number with the correct number of flags around it to chord (auto-open the rest).</li>
          <li>First click is always safe.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Difficulty" footer={<button onClick={() => reset()} className="btn-primary w-full justify-center">New game</button>}>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(DIFF) as Difficulty[]).map((d) => (
            <button key={d} onClick={() => setDiff(d)} className={cn("px-3 py-2 rounded-lg border text-sm capitalize", diff === d ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>
              {d}
              <div className="text-[10px] text-white/50">{DIFF[d].rows}×{DIFF[d].cols} / {DIFF[d].mines}</div>
            </button>
          ))}
        </div>
      </Modal>
    </GameShell>
  );
}
