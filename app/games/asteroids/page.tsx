"use client";

import { useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { useIsTouch } from "@/lib/useTouchControls";
import { unlock } from "@/lib/achievements";
import { cn } from "@/lib/cn";

const W = 800, H = 600;

type Vec = { x: number; y: number };
type Ship = Vec & { angle: number; vx: number; vy: number; cool: number; invuln: number };
type Rock = Vec & { vx: number; vy: number; size: number; sides: number[] };
type Bullet = Vec & { vx: number; vy: number; life: number };
type Ufo = Vec & { vx: number; cool: number; small: boolean };

function wrap(p: { x: number; y: number }) {
  if (p.x < 0) p.x += W; if (p.x > W) p.x -= W;
  if (p.y < 0) p.y += H; if (p.y > H) p.y -= H;
}

function makeRock(size: number, x?: number, y?: number): Rock {
  const sides: number[] = [];
  for (let i = 0; i < 12; i++) sides.push(0.8 + Math.random() * 0.4);
  return {
    x: x ?? (Math.random() < 0.5 ? 0 : W),
    y: y ?? Math.random() * H,
    vx: (Math.random() - 0.5) * 2,
    vy: (Math.random() - 0.5) * 2,
    size,
    sides,
  };
}

export default function AsteroidsGame() {
  const game = getGame("asteroids")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [over, setOver] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lives, setLives] = useState(3);
  const [wave, setWave] = useState(1);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard" | "insane">("normal");
  const { play, vibrate } = useSound();
  const touch = useIsTouch();
  const diffConfig = { easy: { rocks: 2, lives: 5 }, normal: { rocks: 3, lives: 3 }, hard: { rocks: 5, lives: 2 }, insane: { rocks: 7, lives: 1 } }[difficulty];

  const s = useRef({
    ship: { x: W / 2, y: H / 2, angle: -Math.PI / 2, vx: 0, vy: 0, cool: 0, invuln: 60 } as Ship,
    rocks: [] as Rock[],
    bullets: [] as Bullet[],
    ufo: null as Ufo | null,
    ufoBullets: [] as Bullet[],
    keys: {} as Record<string, boolean>,
    last: performance.now(),
    extraLifeAt: 10000,
  });

  const startWave = (w: number) => {
    s.current.rocks = [];
    for (let i = 0; i < diffConfig.rocks + w; i++) s.current.rocks.push(makeRock(40));
  };

  const reset = () => {
    s.current.ship = { x: W / 2, y: H / 2, angle: -Math.PI / 2, vx: 0, vy: 0, cool: 0, invuln: 60 };
    s.current.bullets = []; s.current.ufoBullets = []; s.current.ufo = null;
    setScore(0); setLives(diffConfig.lives); setWave(1); setOver(false);
    startWave(1);
  };

  useEffect(() => { pushRecent("asteroids"); setBest(getHighScore("asteroids")); reset(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => { s.current.keys[e.key.toLowerCase()] = true; if (e.code === "Space") e.preventDefault(); };
    const up = (e: KeyboardEvent) => (s.current.keys[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  const hyperspace = () => {
    s.current.ship.x = Math.random() * W;
    s.current.ship.y = Math.random() * H;
    s.current.ship.vx = 0; s.current.ship.vy = 0;
    s.current.ship.invuln = 30;
    play("zap");
  };
  const fire = () => {
    const sh = s.current.ship;
    if (sh.cool > 0 || s.current.bullets.length >= 5) return;
    s.current.bullets.push({ x: sh.x + Math.cos(sh.angle) * 14, y: sh.y + Math.sin(sh.angle) * 14, vx: Math.cos(sh.angle) * 8 + sh.vx, vy: Math.sin(sh.angle) * 8 + sh.vy, life: 60 });
    sh.cool = 8;
    play("tick");
  };

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current;
      if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last); s.current.last = t;
      const st = s.current, sh = st.ship;
      if (!over) {
        // input
        const k = st.keys;
        if (k["arrowleft"] || k["a"]) sh.angle -= 0.07 * (dt / 16);
        if (k["arrowright"] || k["d"]) sh.angle += 0.07 * (dt / 16);
        if (k["arrowup"] || k["w"]) {
          sh.vx += Math.cos(sh.angle) * 0.15 * (dt / 16);
          sh.vy += Math.sin(sh.angle) * 0.15 * (dt / 16);
        }
        if (k[" "] || k["space"]) fire();
        if (k["h"]) { hyperspace(); k["h"] = false; }
        // friction
        sh.vx *= 0.992; sh.vy *= 0.992;
        sh.x += sh.vx * (dt / 16); sh.y += sh.vy * (dt / 16);
        wrap(sh);
        sh.cool = Math.max(0, sh.cool - 1);
        sh.invuln = Math.max(0, sh.invuln - 1);
        // rocks
        for (const r of st.rocks) {
          r.x += r.vx * (dt / 16); r.y += r.vy * (dt / 16); wrap(r);
        }
        // bullets
        for (const b of st.bullets) { b.x += b.vx * (dt / 16); b.y += b.vy * (dt / 16); b.life--; wrap(b); }
        st.bullets = st.bullets.filter((b) => b.life > 0);
        for (const b of st.ufoBullets) { b.x += b.vx * (dt / 16); b.y += b.vy * (dt / 16); b.life--; wrap(b); }
        st.ufoBullets = st.ufoBullets.filter((b) => b.life > 0);
        // collisions: bullet/rock
        for (let i = st.rocks.length - 1; i >= 0; i--) {
          const r = st.rocks[i];
          for (let j = st.bullets.length - 1; j >= 0; j--) {
            const b = st.bullets[j];
            const dx = r.x - b.x, dy = r.y - b.y;
            if (dx * dx + dy * dy < r.size * r.size) {
              st.rocks.splice(i, 1); st.bullets.splice(j, 1);
              const pts = r.size > 30 ? 20 : r.size > 18 ? 50 : 100;
              setScore((sc) => {
                const ns = sc + pts;
                if (ns >= st.extraLifeAt) { setLives((l) => l + 1); st.extraLifeAt += 10000; play("ding"); }
                return ns;
              });
              if (r.size > 18) {
                for (let k = 0; k < 2; k++) {
                  const nr = makeRock(r.size > 30 ? 22 : 12, r.x, r.y);
                  nr.vx = (Math.random() - 0.5) * 3; nr.vy = (Math.random() - 0.5) * 3;
                  st.rocks.push(nr);
                }
              }
              play("zap"); vibrate(15);
              break;
            }
          }
        }
        // collisions: rock/ship
        if (sh.invuln === 0) {
          for (const r of st.rocks) {
            const dx = r.x - sh.x, dy = r.y - sh.y;
            if (dx * dx + dy * dy < (r.size + 10) * (r.size + 10)) {
              setLives((l) => {
                const next = l - 1;
                if (next <= 0) {
                  setOver(true);
                  const ok = setHighScore("asteroids", score); if (ok) setBest(score);
                  updateStats("asteroids", { plays: 1, losses: 1, bestScore: score });
                  play("lose"); vibrate(200);
                } else { sh.x = W / 2; sh.y = H / 2; sh.vx = 0; sh.vy = 0; sh.invuln = 120; play("thud"); vibrate(100); }
                return Math.max(0, next);
              });
              break;
            }
          }
          for (const b of st.ufoBullets) {
            const dx = b.x - sh.x, dy = b.y - sh.y;
            if (dx * dx + dy * dy < 100) {
              setLives((l) => {
                const next = l - 1;
                if (next <= 0) {
                  setOver(true); play("lose");
                  const ok = setHighScore("asteroids", score); if (ok) setBest(score);
                  updateStats("asteroids", { plays: 1, losses: 1, bestScore: score });
                } else { sh.x = W / 2; sh.y = H / 2; sh.vx = 0; sh.vy = 0; sh.invuln = 120; play("thud"); }
                return Math.max(0, next);
              });
              st.ufoBullets = [];
              break;
            }
          }
        }
        // UFO
        if (!st.ufo && Math.random() < 0.0015 && wave >= 2) {
          st.ufo = { x: Math.random() < 0.5 ? 0 : W, y: 80 + Math.random() * (H - 160), vx: (Math.random() < 0.5 ? -1 : 1) * 1.8, cool: 60, small: wave >= 4 && Math.random() < 0.4 };
        }
        if (st.ufo) {
          st.ufo.x += st.ufo.vx * (dt / 16);
          st.ufo.cool--;
          if (st.ufo.cool <= 0) {
            const angle = st.ufo.small ? Math.atan2(sh.y - st.ufo.y, sh.x - st.ufo.x) : Math.random() * Math.PI * 2;
            st.ufoBullets.push({ x: st.ufo.x, y: st.ufo.y, vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5, life: 120 });
            st.ufo.cool = 80;
          }
          if (st.ufo.x < -30 || st.ufo.x > W + 30) st.ufo = null;
          // bullet hits UFO
          if (st.ufo) {
            for (let j = st.bullets.length - 1; j >= 0; j--) {
              const b = st.bullets[j];
              const dx = st.ufo.x - b.x, dy = st.ufo.y - b.y;
              if (dx * dx + dy * dy < 400) {
                setScore((sc) => sc + (st.ufo!.small ? 1000 : 200));
                st.ufo = null; st.bullets.splice(j, 1);
                play("ding"); vibrate(40);
                break;
              }
            }
          }
        }
        // next wave
        if (st.rocks.length === 0) {
          setWave((w) => {
            const nw = w + 1; startWave(nw);
            if (nw >= 5) unlock("asteroids-wave-5");
            return nw;
          });
          play("ding");
        }
      }

      // render
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, 0, W, H);
      // ship
      if (sh.invuln === 0 || Math.floor(performance.now() / 100) % 2 === 0) {
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(sh.angle);
        ctx.strokeStyle = "#22d3ee";
        ctx.shadowColor = "#22d3ee";
        ctx.shadowBlur = 10;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-10, 9); ctx.lineTo(-6, 0); ctx.lineTo(-10, -9); ctx.closePath();
        ctx.stroke();
        if (st.keys["arrowup"] || st.keys["w"]) {
          ctx.strokeStyle = "#fde047";
          ctx.shadowColor = "#fde047";
          ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-14, 5); ctx.lineTo(-10, 0); ctx.lineTo(-14, -5); ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }
      // rocks
      ctx.strokeStyle = "#ec4899";
      ctx.shadowColor = "#ec4899";
      ctx.shadowBlur = 8;
      for (const r of st.rocks) {
        ctx.beginPath();
        for (let i = 0; i < r.sides.length; i++) {
          const a = (i / r.sides.length) * Math.PI * 2;
          const rad = r.size * r.sides[i];
          const x = r.x + Math.cos(a) * rad;
          const y = r.y + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      // bullets
      ctx.fillStyle = "#fde047";
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 6;
      for (const b of st.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
      // ufo
      if (st.ufo) {
        ctx.strokeStyle = "#a855f7"; ctx.shadowColor = "#a855f7"; ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.ellipse(st.ufo.x, st.ufo.y, st.ufo.small ? 12 : 20, st.ufo.small ? 6 : 10, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(st.ufo.x, st.ufo.y - (st.ufo.small ? 4 : 6), st.ufo.small ? 6 : 10, st.ufo.small ? 3 : 5, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#ef4444";
      ctx.shadowColor = "#ef4444";
      for (const b of st.ufoBullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowBlur = 0;
      // hud
      ctx.fillStyle = "white";
      ctx.font = "16px Inter";
      ctx.textAlign = "left";
      ctx.fillText(`${score}`, 12, 24);
      ctx.fillText(`Wave ${wave}`, 12, 44);
      ctx.textAlign = "right";
      ctx.fillText("▲".repeat(lives), W - 12, 28);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [over, lives, score, wave, play, vibrate]);

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)} onOpenSettings={() => setShowSettings(true)} rightExtra={<span className="text-xs text-white/60 capitalize">{difficulty}</span>}>
      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,800px)] h-auto aspect-[800/600]" />
      {touch && (
        <div className="mt-4 grid grid-cols-3 gap-2 w-[min(95vw,400px)]">
          <button onPointerDown={() => (s.current.keys["arrowleft"] = true)} onPointerUp={() => (s.current.keys["arrowleft"] = false)} className="px-4 py-3 rounded-xl bg-white/10 border border-white/20">◀</button>
          <button onPointerDown={() => (s.current.keys["arrowup"] = true)} onPointerUp={() => (s.current.keys["arrowup"] = false)} className="px-4 py-3 rounded-xl bg-neon-cyan/20 border border-neon-cyan/40 text-neon-cyan font-bold">▲ thrust</button>
          <button onPointerDown={() => (s.current.keys["arrowright"] = true)} onPointerUp={() => (s.current.keys["arrowright"] = false)} className="px-4 py-3 rounded-xl bg-white/10 border border-white/20">▶</button>
          <button onPointerDown={() => fire()} className="col-span-2 px-4 py-3 rounded-xl bg-neon-pink/20 border border-neon-pink/40 text-neon-pink font-bold">FIRE</button>
          <button onPointerDown={() => hyperspace()} className="px-4 py-3 rounded-xl bg-neon-purple/20 border border-neon-purple/40 text-neon-purple font-bold">WARP</button>
        </div>
      )}
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} extra={<div className="text-xs text-white/60">Wave {wave}</div>} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>← → rotate · ↑ thrust · Space fire · H hyperspace</li>
          <li>Break rocks: large → medium → small (20/50/100 pts).</li>
          <li>UFOs appear in higher waves. Small UFOs aim at you. (1000 pts)</li>
          <li>Extra life every 10,000 points.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Difficulty" footer={<button onClick={() => { setShowSettings(false); reset(); }} className="btn-primary w-full justify-center">Restart</button>}>
        <div className="grid grid-cols-2 gap-2">
          {(["easy", "normal", "hard", "insane"] as const).map((d) => {
            const cfg = { easy: { rocks: 2, lives: 5 }, normal: { rocks: 3, lives: 3 }, hard: { rocks: 5, lives: 2 }, insane: { rocks: 7, lives: 1 } }[d];
            return (
              <button key={d} onClick={() => setDifficulty(d)} className={cn("px-3 py-2 rounded-lg border text-sm capitalize", difficulty === d ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>
                {d}
                <div className="text-[10px] text-white/50">{cfg.rocks} rocks · {cfg.lives} {cfg.lives === 1 ? "life" : "lives"}</div>
              </button>
            );
          })}
        </div>
      </Modal>
    </GameShell>
  );
}
