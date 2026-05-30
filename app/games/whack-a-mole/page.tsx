"use client";

import { useCallback, useEffect, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { cn } from "@/lib/cn";

type CellKind = "" | "mole" | "bomb" | "gold";
const HOLES = 9;
const DURATION = 60;

export default function WhackAMoleGame() {
  const game = getGame("whack-a-mole")!;
  const [holes, setHoles] = useState<CellKind[]>(() => Array(HOLES).fill(""));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [time, setTime] = useState(DURATION);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const start = useCallback(() => {
    setHoles(Array(HOLES).fill(""));
    setScore(0); setTime(DURATION); setRunning(true); setOver(false);
  }, []);

  useEffect(() => { pushRecent("whack-a-mole"); setBest(getHighScore("whack-a-mole")); start(); }, [start]);

  // Spawner
  useEffect(() => {
    if (!running) return;
    const speed = Math.max(450, 1200 - (DURATION - time) * 14);
    const id = setInterval(() => {
      setHoles((h) => {
        const nh = h.slice();
        const idx = Math.floor(Math.random() * HOLES);
        if (nh[idx]) return nh;
        const r = Math.random();
        nh[idx] = r < 0.15 ? "bomb" : r < 0.25 ? "gold" : "mole";
        setTimeout(() => {
          setHoles((cur) => { if (cur[idx]) { const cp = cur.slice(); cp[idx] = ""; return cp; } return cur; });
        }, 900);
        return nh;
      });
    }, speed);
    return () => clearInterval(id);
  }, [running, time]);

  // Timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTime((t) => {
      if (t <= 1) {
        setRunning(false); setOver(true);
        const ok = setHighScore("whack-a-mole", score); if (ok) setBest(score);
        updateStats("whack-a-mole", { plays: 1, bestScore: score });
        play("win");
        return 0;
      }
      return t - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [running, score, play]);

  const hit = (i: number) => {
    if (!running) return;
    setHoles((h) => {
      const kind = h[i];
      if (!kind) return h;
      const nh = h.slice(); nh[i] = "";
      if (kind === "mole") { setScore((s) => s + 10); play("pop"); vibrate(20); }
      else if (kind === "gold") { setScore((s) => s + 50); play("ding"); vibrate(40); }
      else if (kind === "bomb") { setScore((s) => Math.max(0, s - 30)); setTime((t) => Math.max(0, t - 3)); play("thud"); vibrate(100); }
      return nh;
    });
  };

  return (
    <GameShell game={game} score={score} best={best} onRestart={start} onOpenHowTo={() => setShowHow(true)} rightExtra={<span className="text-xs text-white/60 tabular-nums">⏱ {time}s</span>}>
      <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-green-900/30 border-2 border-green-700/30 shadow-neon">
        {holes.map((h, i) => (
          <button
            key={i}
            onPointerDown={() => hit(i)}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-stone-800/80 border-4 border-stone-900 relative overflow-hidden grid place-items-center"
          >
            {h && (
              <div className={cn("absolute inset-0 grid place-items-center text-5xl animate-[float_0.3s] transition-transform",
                h === "mole" && "translate-y-2",
                h === "bomb" && "translate-y-1",
                h === "gold" && "")}>
                {h === "mole" ? "🐹" : h === "bomb" ? "💣" : "🐹"}
                {h === "gold" && <span className="absolute -top-2 -right-2 text-xs px-1.5 py-0.5 rounded-full bg-neon-yellow text-black font-bold">×5</span>}
              </div>
            )}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-white/40">Mole +10 · Gold mole +50 · Bomb −30 and −3 seconds</p>
      <GameOverModal open={over} onClose={() => setOver(false)} title="Time's up!" score={score} best={best} isNewBest={score === best && score > 0} onRestart={start} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Whack moles as fast as you can in 60 seconds.</li>
          <li>Gold moles = 5× points. Bombs hurt you.</li>
          <li>Spawn rate ramps up as the timer counts down.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
