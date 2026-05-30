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

type CellKind = "" | "mole" | "bomb" | "gold";
const HOLES = 9;
const TOTAL_LEVELS = 10;

type LevelDef = { duration: number; target: number; spawnMs: number; bombRate: number; goldRate: number; label: string };

function defFor(lvl: number): LevelDef {
  const duration = 60;
  const target = 100 + (lvl - 1) * 80;
  const spawnMs = Math.max(380, 1100 - lvl * 70);
  const bombRate = Math.min(0.35, 0.10 + lvl * 0.025);
  const goldRate = Math.max(0.06, 0.15 - lvl * 0.008);
  return { duration, target, spawnMs, bombRate, goldRate, label: `Lvl ${lvl}` };
}

export default function WhackAMoleGame() {
  const game = getGame("whack-a-mole")!;
  const [holes, setHoles] = useState<CellKind[]>(() => Array(HOLES).fill(""));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [level, setLevel] = useState(1);
  const [unlocked, setUnlocked] = useState(1);
  const [time, setTime] = useState(60);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; v: string; color: string }[]>([]);
  const { play, vibrate } = useSound();
  const def = defFor(level);

  const start = useCallback((lvl = level) => {
    const d = defFor(lvl);
    setHoles(Array(HOLES).fill(""));
    setScore(0); setTime(d.duration); setRunning(true); setOver(false);
    setLevel(lvl);
    setBest(getHighScore("whack-a-mole", `lvl-${lvl}`));
  }, [level]);

  useEffect(() => {
    pushRecent("whack-a-mole");
    setUnlocked(storage.get<number>("whack-a-mole:unlocked", 1));
    start(1);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setHoles((h) => {
        const nh = h.slice();
        const idx = Math.floor(Math.random() * HOLES);
        if (nh[idx]) return nh;
        const r = Math.random();
        nh[idx] = r < def.bombRate ? "bomb" : r < def.bombRate + def.goldRate ? "gold" : "mole";
        setTimeout(() => {
          setHoles((cur) => { if (cur[idx]) { const cp = cur.slice(); cp[idx] = ""; return cp; } return cur; });
        }, 900);
        return nh;
      });
    }, def.spawnMs);
    return () => clearInterval(id);
  }, [running, def.spawnMs, def.bombRate, def.goldRate]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTime((t) => {
      if (t <= 1) {
        setRunning(false); setOver(true);
        const reached = score >= def.target;
        const ok = setHighScore("whack-a-mole", score, `lvl-${level}`); if (ok) setBest(score);
        updateStats("whack-a-mole", { plays: 1, wins: reached ? 1 : 0, losses: reached ? 0 : 1, bestScore: score });
        play(reached ? "win" : "lose");
        if (reached) {
          const next = level + 1;
          if (next > unlocked && next <= TOTAL_LEVELS) { setUnlocked(next); storage.set("whack-a-mole:unlocked", next); }
        }
        return 0;
      }
      return t - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [running, score, level, def.target, unlocked, play]);

  const burst = (idx: number, color: string, v: string) => {
    const r = Math.floor(idx / 3), c = idx % 3;
    const id = Date.now() + Math.random();
    setParticles((p) => [...p, { id, x: c, y: r, v, color }]);
    setTimeout(() => setParticles((p) => p.filter((x) => x.id !== id)), 700);
  };

  const hit = (i: number) => {
    if (!running) return;
    setHoles((h) => {
      const kind = h[i];
      if (!kind) return h;
      const nh = h.slice(); nh[i] = "";
      if (kind === "mole") { setScore((s) => s + 10); play("pop"); vibrate(20); burst(i, "#22ee9c", "+10"); }
      else if (kind === "gold") { setScore((s) => s + 50); play("ding"); vibrate(40); burst(i, "#fde047", "+50"); }
      else if (kind === "bomb") { setScore((s) => Math.max(0, s - 30)); setTime((t) => Math.max(0, t - 3)); play("thud"); vibrate(100); burst(i, "#ef4444", "-30 -3s"); }
      return nh;
    });
  };

  const reached = score >= def.target;
  const nextLevel = () => start(Math.min(TOTAL_LEVELS, level + 1));

  return (
    <GameShell
      game={game}
      score={`${score} / ${def.target}`}
      best={best}
      onRestart={() => start(level)}
      onOpenHowTo={() => setShowHow(true)}
      rightExtra={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLevels(true)} className="btn-ghost">
            <Layers size={16} /> <span className="hidden sm:inline">Lvl {level}/{TOTAL_LEVELS}</span>
          </button>
          <span className="text-xs text-white/60 tabular-nums">⏱ {time}s</span>
        </div>
      }
    >
      <div className="relative grid grid-cols-3 gap-3 p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-green-900/50 via-green-800/30 to-emerald-900/40 border-2 border-green-600/30 shadow-neon">
        {holes.map((h, i) => (
          <button
            key={i}
            onPointerDown={() => hit(i)}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-b from-stone-900 to-stone-950 border-4 border-stone-800 relative overflow-hidden grid place-items-center shadow-[inset_0_8px_16px_rgba(0,0,0,0.5)]"
          >
            {h && (
              <div className={cn("absolute inset-0 grid place-items-center text-5xl transition-transform duration-150",
                h === "mole" && "translate-y-1",
                h === "bomb" && "",
                h === "gold" && "drop-shadow-[0_0_12px_rgba(253,224,71,0.7)]")}>
                {h === "mole" ? "🐹" : h === "bomb" ? "💣" : "🐹"}
                {h === "gold" && <span className="absolute -top-2 -right-2 text-xs px-1.5 py-0.5 rounded-full bg-neon-yellow text-black font-bold shadow-neon">×5</span>}
              </div>
            )}
          </button>
        ))}
        {particles.map((p) => (
          <div key={p.id} className="absolute pointer-events-none font-bold animate-[float_0.7s_ease-out_forwards]"
            style={{ color: p.color, left: `${p.x * 33 + 16}%`, top: `${p.y * 33 + 16}%`, textShadow: `0 0 8px ${p.color}` }}>
            {p.v}
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-white/40 text-center">
        Target {def.target} to advance · Mole +10 · Gold +50 · Bomb −30 / −3s · Level {level} of {TOTAL_LEVELS}
      </div>
      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        title={reached ? `Level ${level} cleared!` : "Time's up"}
        score={score}
        best={best}
        isNewBest={score === best && score > 0}
        extra={
          reached && level < TOTAL_LEVELS ? <button onClick={nextLevel} className="btn-primary mt-2">Next level →</button>
          : reached && level >= TOTAL_LEVELS ? <div className="text-neon-yellow">🏆 ALL LEVELS CLEARED!</div>
          : <div className="text-sm text-white/60">Need {def.target} to advance</div>
        }
        onRestart={() => start(level)}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Whack moles. 60 seconds per level.</li>
          <li>Gold moles (×5 points) appear less often as you level up.</li>
          <li>Bombs lose points and time. They get more frequent.</li>
          <li>Beat the target score to unlock the next level.</li>
        </ul>
      </Modal>
      <Modal open={showLevels} onClose={() => setShowLevels(false)} title="Select Level">
        <div className="text-xs text-white/60 mb-2">Unlocked: {unlocked}/{TOTAL_LEVELS}</div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map((n) => {
            const locked = n > unlocked;
            return (
              <button key={n} disabled={locked} onClick={() => { start(n); setShowLevels(false); }}
                className={cn("aspect-square rounded-xl text-lg font-bold border",
                  locked ? "bg-white/3 border-white/5 text-white/20" :
                  n === level ? "bg-neon-pink/30 border-neon-pink shadow-neon" :
                  "bg-white/5 border-white/10 hover:bg-neon-pink/20")}>
                {locked ? "🔒" : n}
              </button>
            );
          })}
        </div>
      </Modal>
    </GameShell>
  );
}
