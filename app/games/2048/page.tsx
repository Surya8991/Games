"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, storage } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { useSwipe } from "@/lib/useTouchControls";
import { cn } from "@/lib/cn";
import { Undo2 } from "lucide-react";
import { unlock } from "@/lib/achievements";

type Grid = number[][];
type Dir = "up" | "down" | "left" | "right";
const SIZES = [3, 4, 5] as const;
type Size = (typeof SIZES)[number];
const TARGETS = [1024, 2048, 4096, 8192] as const;
type Target = (typeof TARGETS)[number];

const tileBg: Record<number, string> = {
  0: "bg-white/5",
  2: "bg-[#3a3a55] text-white",
  4: "bg-[#4a4a6e] text-white",
  8: "bg-[#f59e0b] text-white",
  16: "bg-[#fb923c] text-white",
  32: "bg-[#ef4444] text-white",
  64: "bg-[#e11d48] text-white",
  128: "bg-[#a855f7] text-white",
  256: "bg-[#8b5cf6] text-white",
  512: "bg-[#3b82f6] text-white",
  1024: "bg-[#06b6d4] text-white",
  2048: "bg-[#22d3ee] text-black",
  4096: "bg-[#22ee9c] text-black",
};

function emptyGrid(n: Size): Grid {
  return Array.from({ length: n }, () => Array(n).fill(0));
}
function clone(g: Grid): Grid {
  return g.map((r) => r.slice());
}
function addTile(g: Grid): Grid {
  const empty: [number, number][] = [];
  g.forEach((row, r) => row.forEach((v, c) => v === 0 && empty.push([r, c])));
  if (!empty.length) return g;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  g[r][c] = Math.random() < 0.9 ? 2 : 4;
  return g;
}

function slideRow(row: number[]): { row: number[]; gained: number; moved: boolean } {
  const filtered = row.filter((v) => v !== 0);
  let gained = 0;
  const out: number[] = [];
  for (let i = 0; i < filtered.length; i++) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const merged = filtered[i] * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else out.push(filtered[i]);
  }
  while (out.length < row.length) out.push(0);
  const moved = out.some((v, i) => v !== row[i]);
  return { row: out, gained, moved };
}

function move(g: Grid, dir: Dir): { grid: Grid; gained: number; moved: boolean } {
  const n = g.length;
  const out = emptyGrid(n as Size);
  let gained = 0;
  let moved = false;
  if (dir === "left" || dir === "right") {
    for (let r = 0; r < n; r++) {
      const row = dir === "left" ? g[r].slice() : g[r].slice().reverse();
      const s = slideRow(row);
      gained += s.gained;
      if (s.moved) moved = true;
      out[r] = dir === "left" ? s.row : s.row.reverse();
    }
  } else {
    for (let c = 0; c < n; c++) {
      const col: number[] = [];
      for (let r = 0; r < n; r++) col.push(g[r][c]);
      const row = dir === "up" ? col : col.reverse();
      const s = slideRow(row);
      gained += s.gained;
      if (s.moved) moved = true;
      const final = dir === "up" ? s.row : s.row.reverse();
      for (let r = 0; r < n; r++) out[r][c] = final[r];
    }
  }
  return { grid: out, gained, moved };
}

function canMove(g: Grid) {
  return (["up", "down", "left", "right"] as Dir[]).some((d) => move(g, d).moved);
}

export default function Game2048() {
  const meta = getGame("2048")!;
  const [size, setSize] = useState<Size>(4);
  const [target, setTarget] = useState<Target>(2048);
  const [grid, setGrid] = useState<Grid>(() => addTile(addTile(emptyGrid(4))));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [history, setHistory] = useState<{ g: Grid; s: number }[]>([]);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [keepGoing, setKeepGoing] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { play, vibrate } = useSound();

  useEffect(() => {
    pushRecent("2048");
    setBest(getHighScore("2048", `${size}`));
  }, []); // eslint-disable-line

  const doMove = useCallback(
    (dir: Dir) => {
      if (over) return;
      const res = move(grid, dir);
      if (!res.moved) return;
      const ng = addTile(clone(res.grid));
      setHistory((h) => [...h.slice(-9), { g: grid, s: score }]);
      setGrid(ng);
      const ns = score + res.gained;
      setScore(ns);
      if (setHighScore("2048", ns, `${size}`)) setBest(ns);
      // Achievements based on max tile
      const maxTile = Math.max(...ng.flat());
      if (maxTile >= 1024) unlock("2048-reach-1024");
      if (maxTile >= 2048) unlock("2048-win");
      if (maxTile >= 4096) unlock("2048-master");
      if (!won && !keepGoing && ng.some((row) => row.some((v) => v >= target))) {
        setWon(true);
      }
      if (!canMove(ng)) {
        setOver(true);
        play("lose");
        vibrate(120);
      } else {
        play(res.gained > 0 ? "pop" : "click");
        if (res.gained > 0) vibrate(20);
      }
    },
    [grid, score, size, target, over, won, keepGoing, play, vibrate]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        arrowup: "up",
        arrowdown: "down",
        arrowleft: "left",
        arrowright: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
      };
      const d = map[e.key.toLowerCase()];
      if (d) {
        e.preventDefault();
        doMove(d);
      } else if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove]); // eslint-disable-line

  useSwipe(wrapRef, doMove, 22);

  const undo = () => {
    setHistory((h) => {
      const last = h[h.length - 1];
      if (!last) return h;
      setGrid(last.g);
      setScore(last.s);
      setOver(false);
      return h.slice(0, -1);
    });
  };

  const reset = (n: Size = size) => {
    setSize(n);
    setGrid(addTile(addTile(emptyGrid(n))));
    setScore(0);
    setHistory([]);
    setOver(false);
    setWon(false);
    setKeepGoing(false);
    setBest(getHighScore("2048", `${n}`));
  };

  const cellPx = useMemo(() => (size === 5 ? "w-16 h-16" : size === 4 ? "w-20 h-20" : "w-24 h-24"), [size]);

  return (
    <GameShell
      game={meta}
      score={score}
      best={best}
      onRestart={() => reset()}
      onOpenHowTo={() => setShowHow(true)}
      onOpenSettings={() => setShowSettings(true)}
      rightExtra={
        <button
          onClick={undo}
          disabled={!history.length}
          className="btn-ghost disabled:opacity-30"
          aria-label="Undo"
        >
          <Undo2 size={16} />
        </button>
      }
    >
      <div ref={wrapRef} className="no-scroll touch-none select-none">
        <div
          className="grid gap-2 p-3 sm:p-4 rounded-2xl bg-bg-soft border border-white/10 shadow-neon"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {grid.flat().map((v, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg grid place-items-center font-bold pixel-font transition-all duration-150",
                cellPx,
                tileBg[v] || "bg-[#0ff] text-black",
                v >= 1024 ? "text-base sm:text-xl" : v >= 128 ? "text-lg sm:text-2xl" : "text-xl sm:text-3xl"
              )}
            >
              {v === 0 ? "" : v}
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-white/40 mt-3">
          Swipe or use arrows/WASD · Ctrl+Z to undo
        </p>
      </div>

      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        score={score}
        best={best}
        isNewBest={score >= best && score > 0}
        onRestart={() => reset()}
      />
      <Modal
        open={won && !keepGoing}
        onClose={() => setKeepGoing(true)}
        title={`You hit ${target}! 🎉`}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setKeepGoing(true)} className="btn-primary flex-1 justify-center">
              Keep going
            </button>
            <button onClick={() => reset()} className="btn-ghost flex-1 justify-center">
              New game
            </button>
          </div>
        }
      >
        <p>Score: <span className="text-neon-cyan font-bold">{score}</span></p>
      </Modal>
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Swipe or use arrow keys / WASD to slide tiles.</li>
          <li>Two tiles with the same number merge into one (doubled).</li>
          <li>Reach 2048 to win — but you can keep playing.</li>
          <li>Ctrl+Z (or undo button) reverts the last move.</li>
        </ul>
      </Modal>
      <Modal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Settings"
        footer={
          <button onClick={() => reset(size)} className="btn-primary w-full justify-center">
            Restart
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-white/60 mb-2">Board size</p>
            <div className="flex gap-2">
              {SIZES.map((n) => (
                <button
                  key={n}
                  onClick={() => reset(n)}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg border text-sm",
                    size === n ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10"
                  )}
                >
                  {n}×{n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-white/60 mb-2">Target tile</p>
            <div className="grid grid-cols-4 gap-2">
              {TARGETS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTarget(t)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm",
                    target === t ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </GameShell>
  );
}
