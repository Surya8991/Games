"use client";

import { useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { unlock } from "@/lib/achievements";

const W = 400, H = 640;

type PlatType = "normal" | "moving" | "spring" | "breakable" | "vanish";
type Platform = { x: number; y: number; w: number; type: PlatType; vx?: number; alive: boolean; sprung?: boolean };
type Monster = { x: number; y: number; vx: number };

const PLAT_W = 70, PLAT_H = 12;

export default function DoodleJumpGame() {
  const game = getGame("doodle-jump")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [over, setOver] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const s = useRef({
    x: W / 2,
    y: H - 100,
    vx: 0,
    vy: 0,
    plats: [] as Platform[],
    monsters: [] as Monster[],
    cameraY: 0,
    last: performance.now(),
    keys: { left: false, right: false },
    jetpack: 0,
    facing: 1,
  });

  const spawnPlatform = (y: number): Platform => {
    const r = Math.random();
    let type: PlatType = "normal";
    if (r < 0.1) type = "moving";
    else if (r < 0.15) type = "spring";
    else if (r < 0.22) type = "breakable";
    else if (r < 0.28 && y < -500) type = "vanish";
    return {
      x: Math.random() * (W - PLAT_W),
      y,
      w: PLAT_W,
      type,
      vx: type === "moving" ? (Math.random() < 0.5 ? -1 : 1) * 1.6 : 0,
      alive: true,
      sprung: false,
    };
  };

  const reset = () => {
    s.current.x = W / 2;
    s.current.y = H - 100;
    s.current.vx = 0;
    s.current.vy = -12;
    s.current.cameraY = 0;
    s.current.jetpack = 0;
    const plats: Platform[] = [];
    plats.push({ x: W / 2 - PLAT_W / 2, y: H - 50, w: PLAT_W, type: "normal", alive: true });
    for (let i = 1; i < 14; i++) plats.push(spawnPlatform(H - 50 - i * 70 - Math.random() * 30));
    s.current.plats = plats;
    s.current.monsters = [];
    setScore(0);
    setOver(false);
  };

  useEffect(() => {
    pushRecent("doodle-jump");
    setBest(getHighScore("doodle-jump"));
    reset();
  }, []); // eslint-disable-line

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") s.current.keys.left = true;
      if (k === "arrowright" || k === "d") s.current.keys.right = true;
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") s.current.keys.left = false;
      if (k === "arrowright" || k === "d") s.current.keys.right = false;
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const move = (clientX: number) => {
      const rect = c.getBoundingClientRect();
      const tx = ((clientX - rect.left) / rect.width) * W;
      const diff = tx - s.current.x;
      s.current.vx = Math.max(-8, Math.min(8, diff * 0.3));
    };
    const tm = (e: TouchEvent) => { if (e.touches[0]) move(e.touches[0].clientX); };
    c.addEventListener("touchmove", tm, { passive: true });
    c.addEventListener("touchstart", tm, { passive: true });
    return () => { c.removeEventListener("touchmove", tm); c.removeEventListener("touchstart", tm); };
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current;
      if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last);
      s.current.last = t;
      const st = s.current;

      if (!over) {
        // movement
        if (st.keys.left) st.vx = Math.max(-7, st.vx - 0.6);
        if (st.keys.right) st.vx = Math.min(7, st.vx + 0.6);
        if (!st.keys.left && !st.keys.right) st.vx *= 0.94;
        st.x += st.vx * (dt / 16);
        if (st.x < 0) st.x = W;
        if (st.x > W) st.x = 0;
        st.facing = st.vx > 0.1 ? 1 : st.vx < -0.1 ? -1 : st.facing;
        // gravity + jetpack
        if (st.jetpack > 0) { st.vy = -14; st.jetpack -= dt; }
        else st.vy += 0.4 * (dt / 16);
        st.y += st.vy * (dt / 16);
        // camera follow up
        if (st.y < H / 2 + st.cameraY) {
          const shift = (H / 2 + st.cameraY) - st.y;
          st.cameraY -= shift;
          setScore((sc) => Math.max(sc, Math.floor(-st.cameraY)));
        }
        // platform collisions (only when falling)
        if (st.vy > 0) {
          for (const p of st.plats) {
            if (!p.alive) continue;
            const px1 = p.x, px2 = p.x + p.w;
            const py = p.y;
            if (st.x > px1 - 14 && st.x < px2 + 14 && st.y > py - 6 && st.y < py + 12) {
              if (p.type === "vanish" && p.sprung) continue;
              if (p.type === "breakable") {
                p.alive = false;
                continue;
              }
              if (p.type === "spring") {
                st.vy = -18;
                p.sprung = true;
                play("ding");
              } else {
                st.vy = -12;
                play("blip");
              }
              if (p.type === "vanish") p.sprung = true;
              vibrate(8);
            }
          }
          // monsters
          for (const m of st.monsters) {
            if (Math.abs(st.x - m.x) < 24 && Math.abs(st.y - m.y) < 24) {
              setOver(true);
              const ok = setHighScore("doodle-jump", score); if (ok) setBest(score);
              updateStats("doodle-jump", { plays: 1, losses: 1, bestScore: score });
          if (score >= 5000) unlock("doodle-5k");
              play("lose"); vibrate(180);
            }
          }
        }
        // moving plats
        for (const p of st.plats) {
          if (p.type === "moving" && p.alive) {
            p.x += (p.vx || 0) * (dt / 16);
            if (p.x < 0 || p.x > W - p.w) p.vx = -(p.vx || 0);
          }
        }
        for (const m of st.monsters) m.x += m.vx * (dt / 16);
        // recycle plats above
        st.plats = st.plats.filter((p) => p.y < H + 100 - st.cameraY);
        while (st.plats.length < 14) {
          const minY = Math.min(...st.plats.map((p) => p.y));
          st.plats.push(spawnPlatform(minY - 60 - Math.random() * 40));
        }
        // spawn monster occasionally
        if (score > 1500 && Math.random() < 0.003 && st.monsters.length < 2) {
          const minY = Math.min(...st.plats.map((p) => p.y));
          st.monsters.push({ x: Math.random() * W, y: minY - 40, vx: (Math.random() < 0.5 ? -1 : 1) * 1.5 });
        }
        st.monsters = st.monsters.filter((m) => m.y < H + 100 - st.cameraY);
        // death
        if (st.y > H - st.cameraY) {
          setOver(true);
          const ok = setHighScore("doodle-jump", score); if (ok) setBest(score);
          updateStats("doodle-jump", { plays: 1, losses: 1, bestScore: score });
          if (score >= 5000) unlock("doodle-5k");
          play("lose"); vibrate(180);
        }
      }

      // draw
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#1b1e3a");
      grad.addColorStop(1, "#06081a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      // stars
      for (let i = 0; i < 30; i++) {
        const sx = (i * 41) % W;
        const sy = (i * 67 - st.cameraY * 0.2) % H;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + (i % 3) * 0.15})`;
        ctx.fillRect(sx, ((sy % H) + H) % H, 2, 2);
      }
      // platforms
      for (const p of st.plats) {
        if (!p.alive) continue;
        const py = p.y + st.cameraY;
        ctx.fillStyle = p.type === "spring" ? "#fde047" : p.type === "moving" ? "#22d3ee" : p.type === "breakable" ? "#ec4899" : p.type === "vanish" ? (p.sprung ? "#666" : "#a855f7") : "#22ee9c";
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
        ctx.fillRect(p.x, py, p.w, PLAT_H);
        if (p.type === "spring") {
          ctx.fillStyle = "#000";
          ctx.fillRect(p.x + p.w / 2 - 4, py - 6, 8, 6);
        }
      }
      ctx.shadowBlur = 0;
      // monsters
      for (const m of st.monsters) {
        const my = m.y + st.cameraY;
        ctx.fillStyle = "#ef4444";
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(m.x, my, 18, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      // player
      const py = st.y + st.cameraY;
      ctx.fillStyle = "#fde047";
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(st.x, py, 14, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.arc(st.x + st.facing * 4, py - 3, 2.5, 0, Math.PI * 2); ctx.fill();
      // score
      ctx.fillStyle = "white";
      ctx.font = "bold 22px 'Press Start 2P', monospace";
      ctx.textAlign = "left";
      ctx.fillText(String(score), 12, 30);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [over, score, play, vibrate]);

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)}>
      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(92vw,400px)] h-auto aspect-[400/640] touch-none" />
      <p className="mt-2 text-xs text-white/40">A/D or ←/→ · Drag on mobile · Springs launch you higher · Avoid monsters</p>
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Bounce up forever. Don't fall off the bottom.</li>
          <li>Yellow = spring (extra height). Cyan = moving. Pink = breakable. Purple = vanishing.</li>
          <li>Higher scores spawn monsters. Score = max height reached.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
