"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { cn } from "@/lib/cn";

type Size = 3 | 4 | 5;

function makeSolved(n: Size): number[] {
  return Array.from({ length: n * n }, (_, i) => (i + 1) % (n * n));
}
function shuffle(arr: number[], n: Size): number[] {
  // Random walk from solved to keep solvable
  const a = arr.slice();
  let zero = a.indexOf(0);
  for (let i = 0; i < n * n * 80; i++) {
    const r = Math.floor(zero / n), c = zero % n;
    const opts: number[] = [];
    if (r > 0) opts.push(zero - n);
    if (r < n - 1) opts.push(zero + n);
    if (c > 0) opts.push(zero - 1);
    if (c < n - 1) opts.push(zero + 1);
    const pick = opts[Math.floor(Math.random() * opts.length)];
    [a[zero], a[pick]] = [a[pick], a[zero]];
    zero = pick;
  }
  return a;
}
function isSolved(a: number[]) {
  for (let i = 0; i < a.length - 1; i++) if (a[i] !== i + 1) return false;
  return a[a.length - 1] === 0;
}

export default function SlidePuzzleGame() {
  const game = getGame("slide-puzzle")!;
  const [n, setN] = useState<Size>(4);
  const [tiles, setTiles] = useState<number[]>(() => shuffle(makeSolved(4), 4));
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [best, setBest] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const reset = useCallback((sz: Size = n) => {
    setN(sz);
    setTiles(shuffle(makeSolved(sz), sz));
    setMoves(0); setTime(0); setRunning(false); setOver(false);
    setBest(getHighScore("slide-puzzle", `t-${sz}`));
  }, [n]);

  useEffect(() => {
    pushRecent("slide-puzzle");
    reset(4);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!running || over) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running, over]);

  const move = (i: number) => {
    if (over) return;
    const z = tiles.indexOf(0);
    const r = Math.floor(i / n), c = i % n;
    const zr = Math.floor(z / n), zc = z % n;
    if ((Math.abs(r - zr) === 1 && c === zc) || (Math.abs(c - zc) === 1 && r === zr)) {
      const nt = tiles.slice();
      [nt[i], nt[z]] = [nt[z], nt[i]];
      setTiles(nt);
      setMoves((m) => m + 1);
      if (!running) setRunning(true);
      play("click"); vibrate(8);
      if (isSolved(nt)) {
        setOver(true); setRunning(false);
        play("win"); vibrate([40, 30, 60]);
        const prev = getHighScore("slide-puzzle", `t-${n}`);
        if (prev === 0 || time < prev) { setHighScore("slide-puzzle", time, `t-${n}`); setBest(time); }
        updateStats("slide-puzzle", { plays: 1, wins: 1, bestScore: moves });
      }
    }
  };

  // arrow keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const z = tiles.indexOf(0);
      const r = Math.floor(z / n), c = z % n;
      let target = -1;
      if (e.key === "ArrowUp" && r < n - 1) target = z + n;
      else if (e.key === "ArrowDown" && r > 0) target = z - n;
      else if (e.key === "ArrowLeft" && c < n - 1) target = z + 1;
      else if (e.key === "ArrowRight" && c > 0) target = z - 1;
      if (target >= 0) move(target);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <GameShell game={game} score={`${moves}m · ${fmt(time)}`} best={best ? fmt(best) : "—"} onRestart={() => reset()} onOpenHowTo={() => setShowHow(true)} onOpenSettings={() => setShowSettings(true)}>
      <div className="grid gap-2 p-3 rounded-2xl bg-bg-soft border border-white/10 shadow-neon" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
        {tiles.map((v, i) => (
          <button
            key={i}
            onClick={() => move(i)}
            className={cn(
              "aspect-square rounded-xl text-2xl sm:text-3xl font-bold pixel-font transition",
              v === 0 ? "bg-transparent" : "bg-gradient-to-br from-neon-purple/30 to-neon-cyan/20 border border-neon-purple/40 text-white hover:from-neon-purple/50 shadow-neon",
              n === 5 ? "w-12 h-12 sm:w-16 sm:h-16 text-xl" : n === 4 ? "w-14 h-14 sm:w-20 sm:h-20" : "w-20 h-20 sm:w-24 sm:h-24"
            )}
            disabled={v === 0}
          >
            {v || ""}
          </button>
        ))}
      </div>
      <GameOverModal open={over} onClose={() => setOver(false)} title="Solved!" score={fmt(time)} extra={<div className="text-sm text-white/70">{moves} moves</div>} onRestart={() => reset()} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Slide tiles into the empty space to put 1–{n*n-1} in order.</li>
          <li>Use arrow keys or click adjacent tiles.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings" footer={<button onClick={() => reset()} className="btn-primary w-full justify-center">New puzzle</button>}>
        <p className="text-xs text-white/60 mb-2">Size</p>
        <div className="flex gap-2">
          {([3,4,5] as Size[]).map((s) => (
            <button key={s} onClick={() => reset(s)} className={cn("flex-1 px-3 py-2 rounded-lg border text-sm", n === s ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>{s}×{s}</button>
          ))}
        </div>
      </Modal>
    </GameShell>
  );
}
