"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { useIsTouch } from "@/lib/useTouchControls";
import { storage } from "@/lib/storage";
import { Layers } from "lucide-react";
import { cn } from "@/lib/cn";

const W = 720, H = 540;
const ROWS = 5, COLS = 11;
const ALIEN_W = 32, ALIEN_H = 22;

type Alien = { x: number; y: number; row: number; alive: boolean };
type Bullet = { x: number; y: number; vy: number };
type Barrier = { x: number; y: number; hp: number };

export default function SpaceInvadersGame() {
  const game = getGame("space-invaders")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lives, setLives] = useState(3);
  const [wave, setWave] = useState(1);
  const [showHow, setShowHow] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [startLevel, setStartLevel] = useState(1);
  const [unlocked, setUnlocked] = useState(1);
  const touch = useIsTouch();
  const { play, vibrate } = useSound();
  const TOTAL_LEVELS = 10;

  const s = useRef({
    px: W / 2 - 20,
    aliens: [] as Alien[],
    bullets: [] as Bullet[],
    enemyBullets: [] as Bullet[],
    barriers: [] as Barrier[],
    dir: 1,
    moveAcc: 0,
    moveInterval: 600,
    last: performance.now(),
    keys: {} as Record<string, boolean>,
    shootCool: 0,
    ufoAt: 0,
    ufoX: -40,
    ufoActive: false,
  });

  const spawnWave = useCallback((wv: number) => {
    const aliens: Alien[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        aliens.push({ x: 80 + c * 50, y: 60 + r * 36, row: r, alive: true });
      }
    }
    s.current.aliens = aliens;
    s.current.dir = 1;
    s.current.bullets = [];
    s.current.enemyBullets = [];
    s.current.moveInterval = Math.max(80, 600 - wv * 50);
    s.current.moveAcc = 0;
    // barriers
    s.current.barriers = [];
    for (let i = 0; i < 4; i++) {
      const bx = 90 + i * 150;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 5; dx++) {
        s.current.barriers.push({ x: bx + dx * 10, y: H - 120 + dy * 10, hp: 3 });
      }
    }
    s.current.ufoActive = false;
    s.current.ufoX = -40;
    s.current.ufoAt = performance.now() + 12000 + Math.random() * 8000;
  }, []);

  const reset = useCallback((wv = startLevel) => {
    setScore(0); setLives(3); setWave(wv); setOver(false); setWon(false);
    s.current.px = W / 2 - 20;
    spawnWave(wv);
  }, [spawnWave, startLevel]);

  useEffect(() => {
    pushRecent("space-invaders");
    setBest(getHighScore("space-invaders"));
    setUnlocked(storage.get<number>("space-invaders:unlocked", 1));
    reset();
  }, [reset]);

  const shoot = useCallback(() => {
    if (s.current.shootCool > 0) return;
    if (s.current.bullets.length >= 3) return;
    s.current.bullets.push({ x: s.current.px + 20, y: H - 60, vy: -8 });
    s.current.shootCool = 12;
    play("tick");
  }, [play]);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      s.current.keys[k] = true;
      if (e.code === "Space") { e.preventDefault(); shoot(); }
    };
    const up = (e: KeyboardEvent) => (s.current.keys[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [shoot]);

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current;
      if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last); s.current.last = t;
      const st = s.current;

      if (!over) {
        // player
        const speed = 5;
        if (st.keys["arrowleft"] || st.keys["a"]) st.px = Math.max(0, st.px - speed);
        if (st.keys["arrowright"] || st.keys["d"]) st.px = Math.min(W - 40, st.px + speed);
        st.shootCool = Math.max(0, st.shootCool - 1);
        // aliens move in steps
        st.moveAcc += dt;
        if (st.moveAcc >= st.moveInterval) {
          st.moveAcc = 0;
          // check edge
          let edge = false;
          for (const a of st.aliens) {
            if (!a.alive) continue;
            if ((st.dir > 0 && a.x + ALIEN_W >= W - 20) || (st.dir < 0 && a.x <= 20)) { edge = true; break; }
          }
          if (edge) {
            for (const a of st.aliens) if (a.alive) a.y += 16;
            st.dir = -st.dir;
          } else {
            for (const a of st.aliens) if (a.alive) a.x += st.dir * 14;
          }
          // alien shooting (random)
          const lowestPerCol: Record<number, Alien> = {};
          for (const a of st.aliens) {
            if (!a.alive) continue;
            const col = Math.round((a.x - 80) / 50);
            if (!lowestPerCol[col] || a.y > lowestPerCol[col].y) lowestPerCol[col] = a;
          }
          const shooters = Object.values(lowestPerCol);
          if (shooters.length && Math.random() < 0.35) {
            const a = shooters[Math.floor(Math.random() * shooters.length)];
            st.enemyBullets.push({ x: a.x + ALIEN_W / 2, y: a.y + ALIEN_H, vy: 4 + wave * 0.3 });
          }
          play("tick");
        }
        // UFO
        if (!st.ufoActive && t > st.ufoAt) { st.ufoActive = true; st.ufoX = -40; }
        if (st.ufoActive) {
          st.ufoX += 3;
          if (st.ufoX > W + 40) {
            st.ufoActive = false;
            st.ufoAt = t + 12000 + Math.random() * 8000;
          }
        }
        // bullets
        for (const b of st.bullets) b.y += b.vy * (dt / 16);
        st.bullets = st.bullets.filter((b) => b.y > -10);
        for (const b of st.enemyBullets) b.y += b.vy * (dt / 16);
        st.enemyBullets = st.enemyBullets.filter((b) => b.y < H + 10);
        // bullets vs aliens
        for (let i = st.bullets.length - 1; i >= 0; i--) {
          const b = st.bullets[i];
          for (const a of st.aliens) {
            if (!a.alive) continue;
            if (b.x > a.x && b.x < a.x + ALIEN_W && b.y > a.y && b.y < a.y + ALIEN_H) {
              a.alive = false;
              st.bullets.splice(i, 1);
              const pts = [40, 30, 20, 10, 10][a.row] ?? 10;
              setScore((sc) => sc + pts);
              // speed up
              st.moveInterval = Math.max(80, st.moveInterval - 6);
              play("zap"); vibrate(10);
              break;
            }
          }
          // bullet vs UFO
          if (st.ufoActive && b.y < 50 && b.x > st.ufoX - 6 && b.x < st.ufoX + 40) {
            setScore((sc) => sc + 200);
            st.ufoActive = false; st.ufoAt = t + 12000;
            st.bullets.splice(i, 1);
            play("ding"); vibrate(30);
          }
        }
        // bullets vs barriers
        const bulletVsBarrier = (b: Bullet) => {
          for (const br of st.barriers) {
            if (br.hp <= 0) continue;
            if (b.x > br.x && b.x < br.x + 10 && b.y > br.y && b.y < br.y + 10) {
              br.hp--;
              return true;
            }
          }
          return false;
        };
        st.bullets = st.bullets.filter((b) => !bulletVsBarrier(b));
        st.enemyBullets = st.enemyBullets.filter((b) => !bulletVsBarrier(b));
        // enemy bullets vs player
        for (let i = st.enemyBullets.length - 1; i >= 0; i--) {
          const b = st.enemyBullets[i];
          if (b.y > H - 50 && b.x > st.px && b.x < st.px + 40) {
            st.enemyBullets.splice(i, 1);
            setLives((l) => {
              const n = l - 1;
              if (n <= 0) {
                setOver(true);
                const ok = setHighScore("space-invaders", score); if (ok) setBest(score);
                updateStats("space-invaders", { plays: 1, losses: 1, bestScore: score });
                play("lose"); vibrate(200);
              } else { play("thud"); vibrate(120); }
              return Math.max(0, n);
            });
            break;
          }
        }
        // aliens reach bottom
        for (const a of st.aliens) {
          if (a.alive && a.y + ALIEN_H >= H - 70) {
            setOver(true);
            const ok = setHighScore("space-invaders", score); if (ok) setBest(score);
            updateStats("space-invaders", { plays: 1, losses: 1, bestScore: score });
            play("lose"); vibrate(200);
            break;
          }
        }
        // wave clear
        if (st.aliens.every((a) => !a.alive)) {
          setWave((w) => {
            const nw = w + 1;
            if (nw > unlocked && nw <= TOTAL_LEVELS) {
              setUnlocked(nw); storage.set("space-invaders:unlocked", nw);
            }
            spawnWave(nw);
            setLives((l) => l + 1); // bonus life
            return nw;
          });
          play("win"); vibrate([40, 30, 40]);
        }
      }

      // render
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, 0, W, H);
      // stars
      for (let i = 0; i < 50; i++) {
        const sx = (i * 73) % W;
        const sy = (i * 41) % H;
        ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 3) * 0.2})`;
        ctx.fillRect(sx, sy, 1, 1);
      }
      // ground line
      ctx.strokeStyle = "#22ee9c";
      ctx.beginPath(); ctx.moveTo(0, H - 50); ctx.lineTo(W, H - 50); ctx.stroke();
      // barriers
      for (const br of st.barriers) {
        if (br.hp <= 0) continue;
        ctx.fillStyle = br.hp === 3 ? "#22ee9c" : br.hp === 2 ? "#fde047" : "#ef4444";
        ctx.fillRect(br.x, br.y, 10, 10);
      }
      // aliens
      for (const a of st.aliens) {
        if (!a.alive) continue;
        const colors = ["#ec4899", "#a855f7", "#22d3ee", "#22ee9c", "#fde047"];
        ctx.fillStyle = colors[a.row];
        ctx.shadowColor = ctx.fillStyle as string;
        ctx.shadowBlur = 6;
        // pixel alien body
        const px = a.x, py = a.y;
        const wob = Math.floor(t / 300) % 2;
        ctx.fillRect(px + 4, py + 4, ALIEN_W - 8, 4);
        ctx.fillRect(px, py + 8, ALIEN_W, 8);
        ctx.fillRect(px + 4, py + 16, ALIEN_W - 8, 4);
        // legs alternate
        if (wob) { ctx.fillRect(px, py + 18, 4, 4); ctx.fillRect(px + ALIEN_W - 4, py + 18, 4, 4); }
        else { ctx.fillRect(px + 8, py + 18, 4, 4); ctx.fillRect(px + ALIEN_W - 12, py + 18, 4, 4); }
        // eyes
        ctx.fillStyle = "#000";
        ctx.fillRect(px + 8, py + 10, 4, 4);
        ctx.fillRect(px + ALIEN_W - 12, py + 10, 4, 4);
      }
      ctx.shadowBlur = 0;
      // UFO
      if (st.ufoActive) {
        ctx.fillStyle = "#ef4444"; ctx.shadowColor = "#ef4444"; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.ellipse(st.ufoX + 20, 40, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fde047";
        ctx.beginPath(); ctx.ellipse(st.ufoX + 20, 38, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      // player
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#22ee9c";
      ctx.shadowColor = "#22ee9c"; ctx.shadowBlur = 10;
      const py = H - 60;
      ctx.fillRect(st.px + 8, py, 24, 6);
      ctx.fillRect(st.px, py + 6, 40, 12);
      ctx.fillRect(st.px + 18, py - 6, 4, 8);
      ctx.shadowBlur = 0;
      // bullets
      ctx.fillStyle = "#fde047";
      for (const b of st.bullets) ctx.fillRect(b.x - 1, b.y, 2, 8);
      ctx.fillStyle = "#ec4899";
      for (const b of st.enemyBullets) ctx.fillRect(b.x - 1, b.y, 2, 8);
      // HUD
      ctx.fillStyle = "white"; ctx.font = "14px monospace"; ctx.textAlign = "left";
      ctx.fillText(`SCORE ${score}`, 12, 22);
      ctx.textAlign = "center";
      ctx.fillText(`WAVE ${wave}`, W / 2, 22);
      ctx.textAlign = "right";
      ctx.fillText(`LIVES ${"♥".repeat(lives)}`, W - 12, 22);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [over, score, wave, spawnWave, play, vibrate]);

  return (
    <GameShell game={game} score={score} best={best} onRestart={() => reset()} onOpenHowTo={() => setShowHow(true)} rightExtra={
      <button onClick={() => setShowLevels(true)} className="btn-ghost">
        <Layers size={16} /> <span className="hidden sm:inline">Wv {wave}/{TOTAL_LEVELS}</span>
      </button>
    }>
      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,720px)] h-auto aspect-[720/540]" />
      {touch && (
        <div className="mt-4 flex justify-between w-[min(95vw,500px)]">
          <div className="flex gap-2">
            <button onPointerDown={() => (s.current.keys["arrowleft"] = true)} onPointerUp={() => (s.current.keys["arrowleft"] = false)} className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 text-2xl">◀</button>
            <button onPointerDown={() => (s.current.keys["arrowright"] = true)} onPointerUp={() => (s.current.keys["arrowright"] = false)} className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 text-2xl">▶</button>
          </div>
          <button onPointerDown={() => shoot()} className="w-16 h-16 rounded-2xl bg-neon-green/20 border-2 border-neon-green/50 text-neon-green font-bold">FIRE</button>
        </div>
      )}
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} extra={<div className="text-xs text-white/60">Wave {wave}</div>} onRestart={() => reset()} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>← → to move · Space to fire (max 3 bullets airborne).</li>
          <li>Aliens speed up as you destroy them. Each wave is faster.</li>
          <li>Pink rows = 40 / purple = 30 / cyan = 20 / green/yellow = 10 / red UFO = 200.</li>
          <li>Don't let them reach you. Bonus life every wave.</li>
          <li>Beat 10 waves to complete the campaign. Higher waves spawn much faster.</li>
        </ul>
      </Modal>
      <Modal open={showLevels} onClose={() => setShowLevels(false)} title="Start at wave">
        <div className="text-xs text-white/60 mb-2">Unlocked: {unlocked}/{TOTAL_LEVELS}</div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map((n) => {
            const locked = n > unlocked;
            return (
              <button key={n} disabled={locked} onClick={() => { setStartLevel(n); reset(n); setShowLevels(false); }}
                className={cn("aspect-square rounded-xl text-lg font-bold border",
                  locked ? "bg-white/3 border-white/5 text-white/20" :
                  n === wave ? "bg-neon-green/30 border-neon-green shadow-neon" :
                  "bg-white/5 border-white/10 hover:bg-neon-green/20")}>
                {locked ? "🔒" : n}
              </button>
            );
          })}
        </div>
      </Modal>
    </GameShell>
  );
}
