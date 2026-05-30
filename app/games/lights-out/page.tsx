"use client";

import { useCallback, useEffect, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, storage, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { cn } from "@/lib/cn";
import { Layers } from "lucide-react";

const N = 5;
const TOTAL_LEVELS = 30;

function makeLevel(lvl: number): boolean[] {
  // Press random cells starting from solved state to ensure solvable
  const cells = Array(N * N).fill(false) as boolean[];
  const presses = Math.min(20, 3 + lvl);
  for (let i = 0; i < presses; i++) {
    const idx = Math.floor(Math.random() * N * N);
    toggle(cells, idx);
  }
  return cells;
}
function toggle(cells: boolean[], i: number) {
  const r = Math.floor(i / N), c = i % N;
  const flip = (rr: number, cc: number) => {
    if (rr < 0 || rr >= N || cc < 0 || cc >= N) return;
    cells[rr * N + cc] = !cells[rr * N + cc];
  };
  flip(r, c); flip(r - 1, c); flip(r + 1, c); flip(r, c - 1); flip(r, c + 1);
}

export default function LightsOutGame() {
  const game = getGame("lights-out")!;
  const [cells, setCells] = useState<boolean[]>(() => makeLevel(1));
  const [level, setLevel] = useState(1);
  const [unlocked, setUnlocked] = useState(1);
  const [moves, setMoves] = useState(0);
  const [over, setOver] = useState(false);
  const [best, setBest] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const { play, vibrate } = useSound();

  const reset = useCallback((lvl = 1) => {
    setLevel(lvl);
    setCells(makeLevel(lvl));
    setMoves(0); setOver(false);
    setBest(getHighScore("lights-out", `lvl-${lvl}`));
  }, []);

  useEffect(() => {
    pushRecent("lights-out");
    setUnlocked(storage.get<number>("lights-out:unlocked", 1));
    reset(1);
  }, [reset]);

  const click = (i: number) => {
    if (over) return;
    const nc = cells.slice();
    toggle(nc, i);
    setCells(nc);
    setMoves((m) => m + 1);
    play("click"); vibrate(8);
    if (nc.every((v) => !v)) {
      setOver(true); play("win"); vibrate([40, 30, 60]);
      const prev = getHighScore("lights-out", `lvl-${level}`);
      if (prev === 0 || moves + 1 < prev) {
        setHighScore("lights-out", moves + 1, `lvl-${level}`);
        setBest(moves + 1);
      }
      const next = level + 1;
      if (next > unlocked && next <= TOTAL_LEVELS) {
        setUnlocked(next);
        storage.set("lights-out:unlocked", next);
      }
      updateStats("lights-out", { plays: 1, wins: 1 });
    }
  };

  return (
    <GameShell
      game={game}
      score={moves}
      best={best || "—"}
      onRestart={() => reset(level)}
      onOpenHowTo={() => setShowHow(true)}
      rightExtra={
        <button onClick={() => setShowLevels(true)} className="btn-ghost">
          <Layers size={16} /> <span className="hidden sm:inline">Lvl {level}/{TOTAL_LEVELS}</span>
        </button>
      }
    >
      <div className="grid grid-cols-5 gap-2 p-3 rounded-2xl bg-bg-soft border border-white/10 shadow-neon">
        {cells.map((on, i) => (
          <button key={i} onClick={() => click(i)} className={cn("w-14 h-14 sm:w-16 sm:h-16 rounded-xl border transition", on ? "bg-neon-yellow border-neon-yellow shadow-[0_0_20px_rgba(253,224,71,0.7)]" : "bg-zinc-800 border-white/10")} />
        ))}
      </div>
      <p className="mt-3 text-xs text-white/40">Toggle all lights OFF in as few moves as possible.</p>
      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        title={`Level ${level} cleared!`}
        score={`${moves} moves`}
        extra={level < TOTAL_LEVELS ? <button onClick={() => reset(level + 1)} className="btn-primary mt-3">Next level →</button> : <div className="text-neon-yellow">🏆 ALL LEVELS CLEARED!</div>}
        onRestart={() => reset(level)}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Click a tile to toggle it and its 4 neighbors.</li>
          <li>Goal: turn every light OFF.</li>
          <li>30 levels of increasing complexity. Fewer moves = better.</li>
        </ul>
      </Modal>
      <Modal open={showLevels} onClose={() => setShowLevels(false)} title="Select Level">
        <div className="text-xs text-white/60 mb-2">Unlocked: {unlocked}/{TOTAL_LEVELS}</div>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map((n) => {
            const locked = n > unlocked;
            return (
              <button key={n} disabled={locked} onClick={() => { reset(n); setShowLevels(false); }}
                className={cn("aspect-square rounded-lg text-sm font-bold border",
                  locked ? "bg-white/3 border-white/5 text-white/20" :
                  n === level ? "bg-neon-yellow/30 border-neon-yellow text-white shadow-neon" :
                  "bg-white/5 border-white/10 hover:bg-neon-yellow/20")}>
                {locked ? "🔒" : n}
              </button>
            );
          })}
        </div>
      </Modal>
    </GameShell>
  );
}
