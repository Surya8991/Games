"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { useSwipe } from "@/lib/useTouchControls";

const W = 720, H = 540;
const LANES = 5;

type Obs = { lane: number; z: number; kind: "block" | "coin" };

// pseudo-3D project: z=0 is far, z=1 is near (at player)
function projectY(z: number) {
  const ny = 0.18 + (1 - z) * 0.7; // far=0.18, near=0.88
  return ny * H;
}
function laneX(lane: number, z: number) {
  // perspective: lanes narrower at distance
  const centerX = W / 2;
  const farSpread = 50; // lane spread at horizon
  const nearSpread = 110;
  const spread = farSpread + (1 - z) * (nearSpread - farSpread);
  return centerX + (lane - (LANES - 1) / 2) * spread;
}

export default function CubeRunnerGame() {
  const game = getGame("cube-runner")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const s = useRef({
    lane: 2, targetLane: 2,
    obstacles: [] as Obs[],
    spawnAt: 0,
    speed: 0.012,
    last: performance.now(),
    timeAlive: 0,
  });

  const reset = useCallback(() => {
    s.current.lane = 2; s.current.targetLane = 2;
    s.current.obstacles = [];
    s.current.spawnAt = performance.now() + 600;
    s.current.speed = 0.012;
    s.current.timeAlive = 0;
    setScore(0); setCoins(0); setOver(false);
  }, []);

  useEffect(() => { pushRecent("cube-runner"); setBest(getHighScore("cube-runner")); reset(); }, [reset]);

  const move = (dir: -1 | 1) => {
    s.current.targetLane = Math.max(0, Math.min(LANES - 1, s.current.targetLane + dir));
    play("tick"); vibrate(8);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") move(-1);
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") move(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line

  useSwipe(wrapRef, (d) => { if (d === "left") move(-1); if (d === "right") move(1); });

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current; if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last); s.current.last = t;
      const st = s.current;

      if (!over) {
        st.timeAlive += dt;
        st.speed = Math.min(0.026, 0.012 + st.timeAlive * 0.0000015);
        // smooth lane
        st.lane += (st.targetLane - st.lane) * 0.25;
        // spawn
        if (t > st.spawnAt) {
          // spawn a row of obstacles with at least one safe lane
          const safeLane = Math.floor(Math.random() * LANES);
          for (let l = 0; l < LANES; l++) {
            if (l === safeLane) {
              if (Math.random() < 0.4) st.obstacles.push({ lane: l, z: 0, kind: "coin" });
            } else if (Math.random() < 0.7) {
              st.obstacles.push({ lane: l, z: 0, kind: "block" });
            }
          }
          st.spawnAt = t + Math.max(420, 900 - st.timeAlive * 0.04);
        }
        // move obstacles
        for (const o of st.obstacles) o.z += st.speed * (dt / 16) * 60;
        // collisions / coin pickup at z=~0.92
        for (let i = st.obstacles.length - 1; i >= 0; i--) {
          const o = st.obstacles[i];
          if (o.z > 0.88 && o.z < 1.05 && Math.round(st.lane) === o.lane) {
            if (o.kind === "block") {
              setOver(true); play("lose"); vibrate(180);
              const ok = setHighScore("cube-runner", score + coins * 10); if (ok) setBest(score + coins * 10);
              updateStats("cube-runner", { plays: 1, losses: 1, bestScore: score });
              break;
            } else {
              setCoins((c) => c + 1);
              play("ding"); vibrate(15);
              st.obstacles.splice(i, 1);
            }
          } else if (o.z > 1.2) {
            st.obstacles.splice(i, 1);
          }
        }
        // score by survival
        if (Math.floor(st.timeAlive / 100) > score) setScore(Math.floor(st.timeAlive / 100));
      }

      // render — neon grid horizon
      ctx.fillStyle = "#0a0a14"; ctx.fillRect(0, 0, W, H);
      // horizon
      const horizonY = H * 0.22;
      const horizonGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      horizonGrad.addColorStop(0, "#1d1338"); horizonGrad.addColorStop(1, "#22d3ee22");
      ctx.fillStyle = horizonGrad; ctx.fillRect(0, 0, W, horizonY);
      // floor grid
      ctx.strokeStyle = "rgba(177,74,237,0.35)"; ctx.lineWidth = 1;
      // lane lines
      for (let l = 0; l <= LANES; l++) {
        ctx.beginPath();
        ctx.moveTo(laneX(l - 0.5, 0), projectY(0));
        ctx.lineTo(laneX(l - 0.5, 1), projectY(1));
        ctx.stroke();
      }
      // horizontal grid lines (moving)
      const gridSpeed = (t / 600) % 1;
      for (let i = 0; i < 12; i++) {
        const z = ((i / 12) + gridSpeed) % 1;
        ctx.globalAlpha = z * 0.8;
        ctx.beginPath();
        ctx.moveTo(laneX(-0.5, z), projectY(z));
        ctx.lineTo(laneX(LANES - 0.5, z), projectY(z));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // obstacles & coins (sorted by z so near draws last)
      const sorted = [...st.obstacles].sort((a, b) => a.z - b.z);
      for (const o of sorted) {
        const z = o.z;
        const x = laneX(o.lane, z), y = projectY(z);
        const sizeF = 14 + (1 - z) * 8;
        const sizeN = 20 + z * 30;
        const size = z * sizeN + (1 - z) * sizeF;
        if (o.kind === "block") {
          ctx.fillStyle = `rgba(236,72,153,${0.4 + z * 0.6})`;
          ctx.shadowColor = "#ec4899"; ctx.shadowBlur = 12 * z;
          ctx.fillRect(x - size / 2, y - size, size, size);
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 * z;
          ctx.strokeRect(x - size / 2, y - size, size, size);
        } else {
          ctx.fillStyle = `rgba(253,224,71,${0.4 + z * 0.6})`;
          ctx.shadowColor = "#fde047"; ctx.shadowBlur = 14 * z;
          ctx.beginPath(); ctx.arc(x, y - size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
      // player cube at z=1
      const px = laneX(st.lane, 1), py = projectY(1);
      ctx.fillStyle = "#22d3ee"; ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 18;
      ctx.fillRect(px - 22, py - 44, 44, 44);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(px - 22, py - 44, 44, 8);
      ctx.shadowBlur = 0;
      // HUD
      ctx.fillStyle = "white"; ctx.font = "bold 22px 'Press Start 2P', monospace"; ctx.textAlign = "left";
      ctx.fillText(String(score), 14, 36);
      ctx.font = "16px Inter"; ctx.textAlign = "right";
      ctx.fillStyle = "#fde047"; ctx.fillText(`× ${coins}`, W - 14, 28);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [over, score, coins, play, vibrate]);

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)} rightExtra={<span className="text-xs text-neon-yellow">× {coins}</span>}>
      <div ref={wrapRef} className="no-scroll">
        <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,720px)] h-auto aspect-[720/540]" />
      </div>
      <div className="mt-3 flex justify-center gap-4 sm:hidden">
        <button onPointerDown={() => move(-1)} className="w-20 h-14 rounded-xl bg-white/10 border border-white/20 text-2xl">◀</button>
        <button onPointerDown={() => move(1)} className="w-20 h-14 rounded-xl bg-white/10 border border-white/20 text-2xl">▶</button>
      </div>
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} extra={<div className="text-xs text-white/60">Coins: {coins}</div>} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Swipe / ← → / A D to switch lanes (5 lanes).</li>
          <li>Pink blocks kill you. Yellow coins add to your score.</li>
          <li>Speed ramps up the longer you survive.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
