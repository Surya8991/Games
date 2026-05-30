"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, storage, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { unlock } from "@/lib/achievements";
import { buildLevel, COLS, ROWS, TOTAL_LEVELS } from "@/lib/breakout-levels";
import { cn } from "@/lib/cn";
import { Layers } from "lucide-react";

const W = 720, H = 540;
const PAD_H = 14;
const BALL_R = 7;
const BRICK_GAP = 4;
const BRICK_H = 22;
const BRICK_W = (W - BRICK_GAP * (COLS + 1)) / COLS;
const BRICK_TOP = 60;

type Brick = { x: number; y: number; hp: number; indestructible: boolean; color: string };
type Ball = { x: number; y: number; vx: number; vy: number };
type PowerKind = "wide" | "multi" | "slow" | "laser" | "life" | "fast" | "narrow" | "sticky";
type Power = { x: number; y: number; kind: PowerKind };
type Laser = { x: number; y: number };

const HP_COLORS = ["", "#22ee9c", "#22d3ee", "#fde047", "#f59e0b", "#ec4899", "#a855f7"];
const POWER_INFO: Record<PowerKind, { color: string; label: string; good: boolean }> = {
  wide:    { color: "#22d3ee", label: "W", good: true },
  multi:   { color: "#ec4899", label: "M", good: true },
  slow:    { color: "#a855f7", label: "S", good: true },
  laser:   { color: "#fde047", label: "L", good: true },
  life:    { color: "#22ee9c", label: "+", good: true },
  fast:    { color: "#ef4444", label: "F", good: false },
  narrow:  { color: "#fb923c", label: "N", good: false },
  sticky:  { color: "#06b6d4", label: "K", good: true },
};

function bricksFromLevel(level: number): Brick[] {
  const def = buildLevel(level);
  const out: Brick[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = def.bricks[r][c];
      if (v === 0) continue;
      const indestructible = v === -1;
      const hp = indestructible ? 99 : v;
      out.push({
        x: BRICK_GAP + c * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        hp,
        indestructible,
        color: indestructible ? "#666" : HP_COLORS[Math.min(6, hp)],
      });
    }
  }
  return out;
}

export default function BreakoutGame() {
  const game = getGame("breakout")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [unlockedLvl, setUnlockedLvl] = useState(1);
  const [showHow, setShowHow] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [activePower, setActivePower] = useState<string>("");
  const [allCleared, setAllCleared] = useState(false);
  const { play, vibrate } = useSound();

  const s = useRef({
    padW: 100,
    padX: W / 2 - 50,
    balls: [] as Ball[],
    bricks: [] as Brick[],
    powers: [] as Power[],
    lasers: [] as Laser[],
    slowUntil: 0,
    fastUntil: 0,
    laserUntil: 0,
    stickyUntil: 0,
    last: performance.now(),
    started: false,
    levelSpeed: 4.5,
  });

  const initLevel = (lvl: number, freshLives = false) => {
    const def = buildLevel(lvl);
    s.current.padW = def.paddleW;
    s.current.padX = W / 2 - def.paddleW / 2;
    s.current.balls = [{ x: W / 2, y: H - 40, vx: def.speed * 0.7, vy: -def.speed }];
    s.current.bricks = bricksFromLevel(lvl);
    s.current.powers = [];
    s.current.lasers = [];
    s.current.slowUntil = 0; s.current.fastUntil = 0; s.current.laserUntil = 0; s.current.stickyUntil = 0;
    s.current.started = false;
    s.current.levelSpeed = def.speed;
    setLevel(lvl);
    setActivePower("");
    if (freshLives) setLives(3);
    setOver(false);
    setPaused(false);
    setAllCleared(false);
  };

  useEffect(() => {
    pushRecent("breakout");
    setBest(getHighScore("breakout"));
    setUnlockedLvl(storage.get<number>("breakout:unlocked", 1));
    initLevel(1, true);
  }, []); // eslint-disable-line

  // Active power label
  useEffect(() => {
    const id = setInterval(() => {
      const t = performance.now();
      const parts: string[] = [];
      if (t < s.current.slowUntil) parts.push(`Slow ${Math.ceil((s.current.slowUntil - t) / 1000)}s`);
      if (t < s.current.fastUntil) parts.push(`Fast ${Math.ceil((s.current.fastUntil - t) / 1000)}s`);
      if (t < s.current.laserUntil) parts.push(`Laser ${Math.ceil((s.current.laserUntil - t) / 1000)}s`);
      if (t < s.current.stickyUntil) parts.push(`Sticky ${Math.ceil((s.current.stickyUntil - t) / 1000)}s`);
      setActivePower(parts.join(" · "));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key.toLowerCase() === "p") setPaused((p) => !p);
      if (e.key === "ArrowLeft") s.current.padX = Math.max(0, s.current.padX - 36);
      if (e.key === "ArrowRight") s.current.padX = Math.min(W - s.current.padW, s.current.padX + 36);
      if (e.key.toLowerCase() === "f" && performance.now() < s.current.laserUntil) {
        s.current.lasers.push({ x: s.current.padX + 8, y: H - 30 }, { x: s.current.padX + s.current.padW - 12, y: H - 30 });
        play("tick");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const move = (clientX: number) => {
      const rect = c.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * W;
      s.current.padX = Math.max(0, Math.min(W - s.current.padW, x - s.current.padW / 2));
    };
    const click = () => {
      if (!s.current.started) s.current.started = true;
      else if (performance.now() < s.current.laserUntil) {
        s.current.lasers.push({ x: s.current.padX + 8, y: H - 30 }, { x: s.current.padX + s.current.padW - 12, y: H - 30 });
        play("tick");
      } else if (performance.now() < s.current.stickyUntil) {
        // release stuck balls
        for (const b of s.current.balls) if (b.vy === 0) b.vy = -s.current.levelSpeed;
      }
    };
    const mm = (e: MouseEvent) => move(e.clientX);
    const tm = (e: TouchEvent) => { if (e.touches[0]) move(e.touches[0].clientX); };
    c.addEventListener("mousemove", mm);
    c.addEventListener("touchmove", tm, { passive: true });
    c.addEventListener("touchstart", (e) => { if (e.touches[0]) move(e.touches[0].clientX); click(); }, { passive: true });
    c.addEventListener("click", click);
    return () => {
      c.removeEventListener("mousemove", mm);
      c.removeEventListener("touchmove", tm);
      c.removeEventListener("click", click);
    };
  }, [play]);

  const applyPower = (k: PowerKind) => {
    const st = s.current;
    const t = performance.now();
    play("ding");
    if (k === "wide") st.padW = Math.min(200, st.padW + 40);
    else if (k === "narrow") st.padW = Math.max(50, st.padW - 30);
    else if (k === "slow") st.slowUntil = t + 6000;
    else if (k === "fast") st.fastUntil = t + 4000;
    else if (k === "life") setLives((l) => l + 1);
    else if (k === "laser") st.laserUntil = t + 8000;
    else if (k === "sticky") st.stickyUntil = t + 8000;
    else if (k === "multi") {
      const add: Ball[] = [];
      for (const b of st.balls) {
        const sp = Math.hypot(b.vx, b.vy);
        add.push({ x: b.x, y: b.y, vx: sp, vy: -sp }, { x: b.x, y: b.y, vx: -sp, vy: -sp });
      }
      st.balls.push(...add);
    }
  };

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current;
      if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last);
      s.current.last = t;
      const st = s.current;
      const speedMul = t < st.slowUntil ? 0.55 : t < st.fastUntil ? 1.55 : 1;

      if (!paused && !over) {
        // balls
        for (const ball of st.balls) {
          if (!st.started) {
            ball.x = st.padX + st.padW / 2;
            ball.y = H - 40;
            continue;
          }
          ball.x += ball.vx * speedMul * (dt / 16);
          ball.y += ball.vy * speedMul * (dt / 16);
          if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx *= -1; play("tick"); }
          if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx *= -1; play("tick"); }
          if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy *= -1; play("tick"); }
          // paddle
          if (ball.y > H - 40 && ball.y < H - 26 && ball.x > st.padX && ball.x < st.padX + st.padW && ball.vy > 0) {
            const off = (ball.x - (st.padX + st.padW / 2)) / (st.padW / 2);
            const sp = Math.hypot(ball.vx, ball.vy);
            ball.vx = off * sp * 0.95;
            ball.vy = -Math.sqrt(Math.max(1, sp * sp - ball.vx * ball.vx));
            if (t < st.stickyUntil) ball.vy = 0; // stick
            play("blip"); vibrate(10);
          }
          // bricks
          for (let i = 0; i < st.bricks.length; i++) {
            const b = st.bricks[i];
            if (ball.x > b.x && ball.x < b.x + BRICK_W && ball.y > b.y && ball.y < b.y + BRICK_H) {
              if (b.indestructible) {
                play("thud");
              } else {
                b.hp--;
                setScore((sc) => sc + 10);
                if (b.hp <= 0) {
                  if (Math.random() < 0.2) {
                    const kinds: PowerKind[] = ["wide", "multi", "slow", "laser", "life", "fast", "narrow", "sticky"];
                    st.powers.push({ x: b.x + BRICK_W / 2, y: b.y + BRICK_H / 2, kind: kinds[Math.floor(Math.random() * kinds.length)] });
                  }
                  st.bricks.splice(i, 1);
                  i--;
                } else {
                  b.color = HP_COLORS[Math.min(6, b.hp)];
                }
                play("pop"); vibrate(8);
              }
              const px = Math.abs(ball.x - (b.x + BRICK_W / 2)) / BRICK_W;
              const py = Math.abs(ball.y - (b.y + BRICK_H / 2)) / BRICK_H;
              if (px > py) ball.vx *= -1; else ball.vy *= -1;
              break;
            }
          }
        }
        st.balls = st.balls.filter((b) => b.y < H + 20);
        if (st.balls.length === 0) {
          setLives((l) => {
            const next = l - 1;
            if (next <= 0) {
              setOver(true);
              const ok = setHighScore("breakout", score); if (ok) setBest(score);
              updateStats("breakout", { plays: 1, losses: 1, bestScore: score });
              play("lose"); vibrate(180);
            } else {
              st.balls = [{ x: st.padX + st.padW / 2, y: H - 40, vx: st.levelSpeed * 0.7, vy: -st.levelSpeed }];
              st.started = false;
            }
            return Math.max(0, next);
          });
        }
        // powers fall
        for (const p of st.powers) p.y += 2.4 * (dt / 16);
        st.powers = st.powers.filter((p) => {
          if (p.y > H - 40 && p.y < H - 16 && p.x > st.padX && p.x < st.padX + st.padW) {
            applyPower(p.kind);
            return false;
          }
          return p.y < H + 20;
        });
        // lasers shoot up
        for (const l of st.lasers) l.y -= 9 * (dt / 16);
        st.lasers = st.lasers.filter((l) => {
          for (let i = 0; i < st.bricks.length; i++) {
            const b = st.bricks[i];
            if (l.x > b.x && l.x < b.x + BRICK_W && l.y < b.y + BRICK_H) {
              if (!b.indestructible) {
                b.hp--;
                if (b.hp <= 0) { st.bricks.splice(i, 1); setScore((sc) => sc + 10); }
                else b.color = HP_COLORS[Math.min(6, b.hp)];
                play("zap");
              }
              return false;
            }
          }
          return l.y > -10;
        });
        // level cleared
        const destructible = st.bricks.filter((b) => !b.indestructible);
        if (destructible.length === 0) {
          const nextLvl = level + 1;
          setScore((sc) => sc + lives * 100 + level * 50); // bonus
          if (nextLvl > TOTAL_LEVELS) {
            setOver(true);
            setAllCleared(true);
            unlock("breakout-lvl-100");
            const ok = setHighScore("breakout", score); if (ok) setBest(score);
            play("win"); vibrate([60, 30, 60, 30, 60]);
          } else {
            if (nextLvl > unlockedLvl) {
              setUnlockedLvl(nextLvl);
              storage.set("breakout:unlocked", nextLvl);
            }
            if (nextLvl === 11) unlock("breakout-lvl-10");
            if (nextLvl === 51) unlock("breakout-lvl-50");
            play("win"); vibrate(60);
            initLevel(nextLvl);
          }
        }
      }

      // render
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, 0, W, H);
      // bricks
      for (const b of st.bricks) {
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = b.indestructible ? 0 : 10;
        ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H);
        if (b.indestructible) {
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
          ctx.strokeRect(b.x + 1, b.y + 1, BRICK_W - 2, BRICK_H - 2);
        }
      }
      ctx.shadowBlur = 0;
      // paddle
      ctx.fillStyle = "#22d3ee";
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = 16;
      ctx.fillRect(st.padX, H - 24, st.padW, PAD_H);
      if (t < st.laserUntil) {
        ctx.fillStyle = "#fde047";
        ctx.fillRect(st.padX + 4, H - 30, 4, 8);
        ctx.fillRect(st.padX + st.padW - 8, H - 30, 4, 8);
      }
      // balls
      ctx.shadowColor = "#fde047";
      ctx.fillStyle = "#fde047";
      for (const b of st.balls) {
        ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
      }
      // powers
      ctx.shadowBlur = 8;
      for (const p of st.powers) {
        const info = POWER_INFO[p.kind];
        ctx.fillStyle = info.color;
        ctx.shadowColor = info.color;
        ctx.fillRect(p.x - 12, p.y - 8, 24, 16);
        ctx.fillStyle = "#000";
        ctx.font = "bold 12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(info.label, p.x, p.y + 4);
      }
      // lasers
      ctx.shadowColor = "#fde047";
      ctx.fillStyle = "#fde047";
      for (const l of st.lasers) ctx.fillRect(l.x - 1, l.y - 8, 2, 8);
      ctx.shadowBlur = 0;
      // hud
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "12px Inter";
      ctx.textAlign = "left";
      ctx.fillText(`Lvl ${level}/${TOTAL_LEVELS} · Lives ${lives}${activePower ? " · " + activePower : ""}`, 12, 24);
      ctx.textAlign = "right";
      ctx.fillText(`Score ${score}`, W - 12, 24);
      if (!st.started && !over) {
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "16px Inter";
        ctx.fillText("Click / tap to launch", W / 2, H / 2 - 50);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, lives, level, score, unlockedLvl, activePower, play, vibrate]);

  const restart = () => initLevel(1, true);
  const replayLevel = () => initLevel(level, false);

  const levelButtons = useMemo(() => Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1), []);

  return (
    <GameShell
      game={game}
      score={score}
      best={best}
      paused={paused}
      onTogglePause={() => setPaused((p) => !p)}
      onRestart={restart}
      onOpenHowTo={() => setShowHow(true)}
      rightExtra={
        <button onClick={() => setShowLevels(true)} className="btn-ghost" aria-label="Level select">
          <Layers size={16} /> <span className="hidden sm:inline">Lvl {level}/{TOTAL_LEVELS}</span>
        </button>
      }
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,720px)] h-auto aspect-[720/540] cursor-pointer"
      />
      <p className="mt-2 text-xs text-white/40">Mouse / touch to move · Click to launch · F to fire laser · Space to pause</p>

      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        title={allCleared ? "🏆 ALL 100 LEVELS CLEARED!" : "Game Over"}
        score={score}
        best={best}
        isNewBest={score === best && score > 0}
        extra={<div className="text-sm text-white/70">Reached level {level} / {TOTAL_LEVELS}</div>}
        onRestart={restart}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Move paddle with mouse, touch, or ← →.</li>
          <li>Click / tap to launch the ball.</li>
          <li>100 levels — speed up, paddle shrinks, gray bricks are indestructible.</li>
          <li>Power-ups: <b>W</b>ide, <b>M</b>ulti-ball, <b>S</b>low, <b>L</b>aser (press F or click to fire), <b>+</b>Life, sticky (<b>K</b>). Red <b>F</b>ast and orange <b>N</b>arrow are bad.</li>
          <li>Level select unlocks as you progress.</li>
        </ul>
      </Modal>
      <Modal open={showLevels} onClose={() => setShowLevels(false)} title="Select Level">
        <div className="text-xs text-white/60 mb-2">Unlocked: {unlockedLvl}/{TOTAL_LEVELS}</div>
        <div className="grid grid-cols-10 gap-1 max-h-80 overflow-y-auto">
          {levelButtons.map((n) => {
            const locked = n > unlockedLvl;
            return (
              <button
                key={n}
                disabled={locked}
                onClick={() => { initLevel(n, true); setShowLevels(false); }}
                className={cn(
                  "aspect-square rounded text-xs font-bold border transition",
                  locked
                    ? "bg-white/3 border-white/5 text-white/20"
                    : n === level
                    ? "bg-neon-purple/40 border-neon-purple text-white shadow-neon"
                    : "bg-white/5 border-white/10 hover:bg-neon-purple/20"
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
