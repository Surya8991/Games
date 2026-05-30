"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, storage, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { unlock } from "@/lib/achievements";
import { DPad } from "@/components/TouchPad";
import { useSwipe, useIsTouch } from "@/lib/useTouchControls";
import { walls as wallsFor, speedMs, goalFor, GRID, TOTAL_LEVELS, Pt } from "@/lib/snake-levels";
import { cn } from "@/lib/cn";
import { Layers } from "lucide-react";

type Mode = "classic" | "wrap" | "campaign";

export default function SnakeGame() {
  const game = getGame("snake")!;
  const [mode, setMode] = useState<Mode>("campaign");
  const [level, setLevel] = useState(1);
  const [unlockedLvl, setUnlockedLvl] = useState(1);
  const [eaten, setEaten] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const touch = useIsTouch();
  const { play, vibrate } = useSound();

  const stateRef = useRef({
    snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }] as Pt[],
    dir: { x: 1, y: 0 } as Pt,
    nextDir: { x: 1, y: 0 } as Pt,
    food: { x: 15, y: 10 } as Pt,
    walls: [] as Pt[],
    acc: 0,
    last: 0,
    alive: true,
    interval: 110,
  });

  const place = (snake: Pt[], walls: Pt[]): Pt => {
    while (true) {
      const p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
      if (!snake.some((s) => s.x === p.x && s.y === p.y) && !walls.some((w) => w.x === p.x && w.y === p.y)) return p;
    }
  };

  const reset = useCallback((lvl = 1, m: Mode = mode) => {
    const ws = m === "campaign" ? wallsFor(lvl) : [];
    const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    stateRef.current = {
      snake,
      dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
      food: place(snake, ws),
      walls: ws,
      acc: 0, last: performance.now(),
      alive: true,
      interval: m === "campaign" ? speedMs(lvl) : 110,
    };
    setMode(m);
    setLevel(lvl);
    setEaten(0);
    setOver(false);
    setWon(false);
    setPaused(false);
    setBest(getHighScore("snake", m === "campaign" ? `lvl-${lvl}` : m));
  }, [mode]);

  useEffect(() => {
    pushRecent("snake");
    setUnlockedLvl(storage.get<number>("snake:unlocked", 1));
    reset(1, "campaign");
  }, []); // eslint-disable-line

  const setDir = useCallback((dx: number, dy: number) => {
    const s = stateRef.current;
    if (s.dir.x === -dx && s.dir.y === -dy) return;
    if (s.dir.x === dx && s.dir.y === dy) return;
    s.nextDir = { x: dx, y: dy };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w") setDir(0, -1);
      else if (k === "arrowdown" || k === "s") setDir(0, 1);
      else if (k === "arrowleft" || k === "a") setDir(-1, 0);
      else if (k === "arrowright" || k === "d") setDir(1, 0);
      else if (k === " " || k === "p") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDir]);

  useSwipe(wrapRef, (dir) => {
    if (dir === "up") setDir(0, -1); else if (dir === "down") setDir(0, 1);
    else if (dir === "left") setDir(-1, 0); else setDir(1, 0);
  });

  const finishLevel = useCallback((didWin: boolean) => {
    const s = stateRef.current;
    s.alive = false;
    setOver(true);
    setWon(didWin);
    const sc = s.snake.length - 3;
    if (mode === "campaign") {
      const ok = setHighScore("snake", sc, `lvl-${level}`);
      if (ok) setBest(sc);
      if (didWin) {
        const nextLvl = Math.min(TOTAL_LEVELS, level + 1);
        if (nextLvl > unlockedLvl) {
          setUnlockedLvl(nextLvl);
          storage.set("snake:unlocked", nextLvl);
        }
        if (nextLvl >= 51) unlock("snake-lvl-50");
        play("win"); vibrate([40, 30, 40]);
      } else {
        play("lose"); vibrate(150);
      }
    } else {
      const ok = setHighScore("snake", sc, mode);
      if (ok) setBest(sc);
      play("lose"); vibrate(150);
    }
    if (sc >= 10) unlock("snake-10");
    if (sc >= 50) unlock("snake-50");
    updateStats("snake", { plays: 1, wins: didWin ? 1 : 0, losses: didWin ? 0 : 1, bestScore: sc });
  }, [level, mode, unlockedLvl, play, vibrate]);

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const s = stateRef.current;
      const c = canvasRef.current;
      if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const W = c.width, cell = W / GRID;

      if (!paused && s.alive) {
        s.acc += t - s.last; s.last = t;
        if (s.acc >= s.interval) {
          s.acc = 0;
          s.dir = s.nextDir;
          const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };
          if (mode === "wrap") { head.x = (head.x + GRID) % GRID; head.y = (head.y + GRID) % GRID; }
          const oob = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
          const hitSelf = s.snake.some((p, i) => i > 0 && p.x === head.x && p.y === head.y);
          const hitWall = s.walls.some((w) => w.x === head.x && w.y === head.y);
          if (oob || hitSelf || hitWall) finishLevel(false);
          else {
            s.snake.unshift(head);
            if (head.x === s.food.x && head.y === s.food.y) {
              setEaten((e) => {
                const ne = e + 1;
                if (mode === "campaign" && ne >= goalFor(level)) {
                  // defer to next tick so React doesn't batch over the win flag
                  setTimeout(() => finishLevel(true), 0);
                }
                return ne;
              });
              s.food = place(s.snake, s.walls);
              play("ding"); vibrate(20);
            } else s.snake.pop();
          }
        }
      } else s.last = t;

      // draw
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, 0, W, W);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      for (let i = 1; i < GRID; i++) {
        ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, W); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell); ctx.stroke();
      }
      ctx.fillStyle = "#ec4899";
      ctx.shadowColor = "#ec4899"; ctx.shadowBlur = 8;
      for (const w of s.walls) ctx.fillRect(w.x * cell + 1, w.y * cell + 1, cell - 2, cell - 2);
      ctx.fillStyle = "#fde047";
      ctx.shadowColor = "#fde047";
      ctx.beginPath(); ctx.arc(s.food.x * cell + cell / 2, s.food.y * cell + cell / 2, cell / 2 - 2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = "#22ee9c"; ctx.shadowBlur = 10;
      s.snake.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? "#22ee9c" : `hsl(${150 + Math.min(60, i * 2)}, 80%, ${55 - Math.min(20, i)}%)`;
        ctx.fillRect(p.x * cell + 1, p.y * cell + 1, cell - 2, cell - 2);
      });
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, mode, level, finishLevel, play, vibrate]);

  const score = eaten;
  const goal = mode === "campaign" ? goalFor(level) : null;
  const nextLevel = () => reset(Math.min(TOTAL_LEVELS, level + 1), mode);

  return (
    <GameShell
      game={game}
      score={mode === "campaign" ? `${eaten}/${goal}` : eaten}
      best={best}
      paused={paused}
      onTogglePause={() => setPaused((p) => !p)}
      onRestart={() => reset(level, mode)}
      onOpenHowTo={() => setShowHow(true)}
      onOpenSettings={() => setShowSettings(true)}
      rightExtra={
        mode === "campaign" && (
          <button onClick={() => setShowLevels(true)} className="btn-ghost" aria-label="Level select">
            <Layers size={16} /> <span className="hidden sm:inline">Lvl {level}/{TOTAL_LEVELS}</span>
          </button>
        )
      }
    >
      <div ref={wrapRef} className="no-scroll">
        <canvas
          ref={canvasRef}
          width={520}
          height={520}
          className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(92vw,520px)] h-[min(92vw,520px)]"
        />
      </div>
      {touch && (
        <div className="mt-6 flex justify-center">
          <DPad onPress={(d) => {
            if (d === "up") setDir(0, -1);
            if (d === "down") setDir(0, 1);
            if (d === "left") setDir(-1, 0);
            if (d === "right") setDir(1, 0);
          }} />
        </div>
      )}

      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        title={won ? `Level ${level} cleared!` : "Game Over"}
        score={score}
        best={best}
        isNewBest={score === best && score > 0}
        extra={
          won && mode === "campaign" && level < TOTAL_LEVELS ? (
            <button onClick={nextLevel} className="btn-primary mt-3">Next level →</button>
          ) : won && level >= TOTAL_LEVELS ? (
            <div className="text-neon-yellow">🏆 ALL 50 LEVELS CLEARED!</div>
          ) : null
        }
        onRestart={() => reset(level, mode)}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Arrows / WASD / swipe to steer.</li>
          <li><b>Campaign</b>: eat the level's goal of apples to advance. 50 levels, 10 cycled maze layouts, faster each level.</li>
          <li><b>Classic</b>: endless, no walls. <b>Wrap</b>: edges teleport.</li>
          <li>Space / P to pause.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings" footer={<button onClick={() => reset(1, mode)} className="btn-primary w-full justify-center">Restart</button>}>
        <p className="text-xs text-white/60 mb-2">Mode</p>
        <div className="grid grid-cols-3 gap-2">
          {(["campaign", "classic", "wrap"] as Mode[]).map((m) => (
            <button key={m} onClick={() => reset(1, m)} className={cn("px-3 py-2 rounded-lg border text-sm capitalize", mode === m ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>{m}</button>
          ))}
        </div>
      </Modal>
      <Modal open={showLevels} onClose={() => setShowLevels(false)} title="Select Level">
        <div className="text-xs text-white/60 mb-2">Unlocked: {unlockedLvl}/{TOTAL_LEVELS}</div>
        <div className="grid grid-cols-10 gap-1 max-h-72 overflow-y-auto">
          {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map((n) => {
            const locked = n > unlockedLvl;
            return (
              <button
                key={n}
                disabled={locked}
                onClick={() => { reset(n, "campaign"); setShowLevels(false); }}
                className={cn(
                  "aspect-square rounded text-xs font-bold border",
                  locked ? "bg-white/3 border-white/5 text-white/20" :
                  n === level ? "bg-neon-purple/40 border-neon-purple text-white shadow-neon" :
                  "bg-white/5 border-white/10 hover:bg-neon-purple/20"
                )}
              >
                {locked ? "🔒" : n}
              </button>
            );
          })}
        </div>
      </Modal>
    </GameShell>
  );
}
