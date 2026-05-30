"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";

const W = 400, H = 600;
const BASE_W = 220, BLOCK_H = 22;

type Block = { x: number; w: number; color: string };

export default function StackTowerGame() {
  const game = getGame("stack-tower")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const s = useRef({
    stack: [] as Block[],
    movingX: 0, movingDir: 1, movingSpeed: 3,
    movingW: BASE_W,
    cameraY: 0,
    color: 200,
    last: performance.now(),
    falling: [] as { x: number; y: number; w: number; vy: number; color: string }[],
  });

  const reset = useCallback(() => {
    s.current.stack = [{ x: W / 2 - BASE_W / 2, w: BASE_W, color: "hsl(200,70%,55%)" }];
    s.current.movingX = 0;
    s.current.movingDir = 1;
    s.current.movingSpeed = 3;
    s.current.movingW = BASE_W;
    s.current.cameraY = 0;
    s.current.color = 200;
    s.current.falling = [];
    setScore(0); setOver(false);
  }, []);

  useEffect(() => { pushRecent("stack-tower"); setBest(getHighScore("stack-tower")); reset(); }, [reset]);

  const drop = useCallback(() => {
    if (over) return;
    const st = s.current;
    const top = st.stack[st.stack.length - 1];
    const px = st.movingX;
    const pw = st.movingW;
    // overlap with top
    const overlapL = Math.max(px, top.x);
    const overlapR = Math.min(px + pw, top.x + top.w);
    const overlap = overlapR - overlapL;
    if (overlap <= 0) {
      // miss
      setOver(true);
      const ok = setHighScore("stack-tower", score); if (ok) setBest(score);
      updateStats("stack-tower", { plays: 1, losses: 1, bestScore: score });
      play("lose"); vibrate(150);
      // make all blocks fall visually
      for (let i = 0; i < st.stack.length; i++) {
        const b = st.stack[i];
        st.falling.push({ x: b.x, y: (st.stack.length - 1 - i) * BLOCK_H, w: b.w, vy: 4 + i * 0.4, color: b.color });
      }
      return;
    }
    // overhang on left/right falls
    if (px < top.x) {
      st.falling.push({ x: px, y: 0, w: top.x - px, vy: 3, color: `hsl(${st.color},70%,55%)` });
    }
    if (px + pw > top.x + top.w) {
      st.falling.push({ x: top.x + top.w, y: 0, w: (px + pw) - (top.x + top.w), vy: 3, color: `hsl(${st.color},70%,55%)` });
    }
    // place block at overlap
    st.stack.push({ x: overlapL, w: overlap, color: `hsl(${st.color},70%,55%)` });
    setScore((sc) => sc + 1);
    play(overlap > pw - 4 ? "ding" : "pop"); vibrate(15);
    st.color = (st.color + 12) % 360;
    st.movingW = overlap;
    st.movingSpeed = Math.min(8, 3 + st.stack.length * 0.18);
    st.movingDir = Math.random() < 0.5 ? -1 : 1;
    st.movingX = st.movingDir > 0 ? 0 - overlap : W;
  }, [over, score, play, vibrate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); drop(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drop]);

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current; if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last); s.current.last = t;
      const st = s.current;

      if (!over) {
        // moving block
        st.movingX += st.movingDir * st.movingSpeed * (dt / 16);
        if (st.movingX + st.movingW > W) { st.movingX = W - st.movingW; st.movingDir = -1; }
        if (st.movingX < 0) { st.movingX = 0; st.movingDir = 1; }
        // camera follow
        const targetCam = Math.max(0, (st.stack.length - 8) * BLOCK_H);
        st.cameraY += (targetCam - st.cameraY) * 0.12;
      }
      // falling pieces
      for (const f of st.falling) { f.vy += 0.5; f.y += f.vy; }
      st.falling = st.falling.filter((f) => f.y < H + 200);

      // render
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#1a0f30"); grad.addColorStop(1, "#04020c");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      // stack
      for (let i = 0; i < st.stack.length; i++) {
        const b = st.stack[i];
        const y = H - 100 - i * BLOCK_H + st.cameraY;
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color; ctx.shadowBlur = 10;
        ctx.fillRect(b.x, y, b.w, BLOCK_H);
        // top highlight
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(b.x, y, b.w, 4);
      }
      // moving block
      if (!over) {
        const y = H - 100 - st.stack.length * BLOCK_H + st.cameraY;
        ctx.fillStyle = `hsl(${st.color},70%,55%)`;
        ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = 14;
        ctx.fillRect(st.movingX, y, st.movingW, BLOCK_H);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(st.movingX, y, st.movingW, 4);
      }
      // falling
      for (const f of st.falling) {
        ctx.fillStyle = f.color;
        ctx.fillRect(f.x, H - 100 - st.stack.length * BLOCK_H + st.cameraY + f.y, f.w, BLOCK_H);
      }
      // hud
      ctx.fillStyle = "white"; ctx.font = "bold 48px 'Press Start 2P', monospace"; ctx.textAlign = "center";
      ctx.fillText(String(score), W / 2, 80);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [over, score]);

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)}>
      <canvas ref={canvasRef} width={W} height={H} onClick={drop} onTouchStart={(e) => { e.preventDefault(); drop(); }} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(92vw,400px)] h-auto aspect-[400/600] cursor-pointer touch-none" />
      <p className="mt-2 text-xs text-white/40">Tap / click / Space to drop the block.</p>
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>A block slides side-to-side. Tap to drop it.</li>
          <li>Anything overhanging gets sliced off. Block shrinks.</li>
          <li>Miss completely = tower collapses. How tall can you go?</li>
          <li>Perfect drops are extra satisfying.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
