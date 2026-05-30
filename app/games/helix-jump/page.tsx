"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";

const W = 420, H = 640;
const R = 110; // helix radius

type Ring = { y: number; segments: { start: number; end: number; bad: boolean }[] };

function makeRing(y: number, level: number): Ring {
  const segCount = 4 + Math.floor(Math.random() * 3); // 4-6 segments
  const segs: Ring["segments"] = [];
  const gapAngle = 0.5 + Math.random() * 0.4; // gap opening
  const totalAngle = 2 * Math.PI - gapAngle;
  const segAngle = totalAngle / segCount;
  const gapStart = Math.random() * 2 * Math.PI;
  let a = gapStart + gapAngle;
  for (let i = 0; i < segCount; i++) {
    const bad = Math.random() < Math.min(0.4, 0.1 + level * 0.01);
    segs.push({ start: a, end: a + segAngle, bad });
    a += segAngle;
  }
  return { y, segments: segs };
}

function angleInSegment(a: number, start: number, end: number): boolean {
  // normalize
  const tau = Math.PI * 2;
  const A = ((a % tau) + tau) % tau;
  const S = ((start % tau) + tau) % tau;
  const E = ((end % tau) + tau) % tau;
  if (S <= E) return A >= S && A <= E;
  return A >= S || A <= E;
}

export default function HelixJumpGame() {
  const game = getGame("helix-jump")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [combo, setCombo] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const s = useRef({
    rings: [] as Ring[],
    by: 200, vy: 0, // ball y/vy
    rotation: 0,
    last: performance.now(),
    keys: { left: false, right: false },
    touchX: null as number | null,
    dropDist: 0,
    perfectChain: 0,
  });

  const reset = useCallback(() => {
    const rings: Ring[] = [];
    for (let i = 1; i <= 12; i++) rings.push(makeRing(160 + i * 90, 1));
    s.current = { rings, by: 100, vy: 0, rotation: 0, last: performance.now(), keys: { left: false, right: false }, touchX: null, dropDist: 0, perfectChain: 0 };
    setScore(0); setOver(false); setCombo(0);
  }, []);

  useEffect(() => { pushRecent("helix-jump"); setBest(getHighScore("helix-jump")); reset(); }, [reset]);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") s.current.keys.left = true;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") s.current.keys.right = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") s.current.keys.left = false;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") s.current.keys.right = false;
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    let lastX = 0;
    const start = (e: TouchEvent) => { lastX = e.touches[0].clientX; };
    const mv = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      const dx = x - lastX;
      s.current.rotation += dx * 0.012;
      lastX = x;
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", mv, { passive: true });
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", mv); };
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current; if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last); s.current.last = t;
      const st = s.current;

      if (!over) {
        if (st.keys.left) st.rotation -= 0.06 * (dt / 16);
        if (st.keys.right) st.rotation += 0.06 * (dt / 16);
        // ball falls
        st.vy += 0.55;
        st.vy = Math.min(11, st.vy);
        const oldY = st.by;
        st.by += st.vy;
        st.dropDist += st.by - oldY;
        // shift rings down (camera follow)
        if (st.by > H / 2) {
          const dy = st.by - H / 2;
          st.by = H / 2;
          for (const r of st.rings) r.y -= dy;
          setScore((sc) => sc + Math.floor(dy / 10));
        }
        // remove off-screen, add new
        while (st.rings[0] && st.rings[0].y < -100) {
          st.rings.shift();
          const lastY = st.rings[st.rings.length - 1].y;
          st.rings.push(makeRing(lastY + 90, Math.floor(score / 200) + 1));
        }
        // collisions
        const ballAngleAtTop = ((st.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        for (const r of st.rings) {
          if (st.by + 12 >= r.y - 6 && st.by + 12 <= r.y + 14) {
            const hitSeg = r.segments.find((s2) => angleInSegment(ballAngleAtTop, s2.start, s2.end));
            if (hitSeg) {
              if (hitSeg.bad) {
                setOver(true);
                play("lose"); vibrate(180);
                const ok = setHighScore("helix-jump", score); if (ok) setBest(score);
                updateStats("helix-jump", { plays: 1, losses: 1, bestScore: score });
              } else {
                // bounce
                st.by = r.y - 12;
                st.vy = -10;
                play("blip"); vibrate(10);
              }
              break;
            } else {
              // passed through gap
              if (st.vy > 8) {
                st.perfectChain++;
                setCombo(st.perfectChain);
                if (st.perfectChain >= 3) { setScore((sc) => sc + 30); play("ding"); vibrate(20); }
              }
            }
          }
        }
        if (st.vy < 0) st.perfectChain = 0;
      }

      // render
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#1d1338"); grad.addColorStop(1, "#06061a");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      // central pillar
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(W / 2 - 8, 0, 16, H);
      // rings
      const ballA = ((st.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      for (const r of st.rings) {
        if (r.y < -40 || r.y > H + 40) continue;
        // draw ring (top-down ellipse)
        for (const seg of r.segments) {
          ctx.strokeStyle = seg.bad ? "#ef4444" : "#22d3ee";
          ctx.shadowColor = ctx.strokeStyle as string; ctx.shadowBlur = 8;
          ctx.lineWidth = 18;
          ctx.beginPath();
          ctx.ellipse(W / 2, r.y, R, 16, 0, seg.start + st.rotation * 0, seg.end + st.rotation * 0);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
      // ball — show its projection in front
      const bx = W / 2 + Math.cos(ballA) * 0;
      ctx.fillStyle = "#fde047"; ctx.shadowColor = "#fde047"; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(W / 2, st.by, 12, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // angle marker (top of helix shows where you'll land)
      ctx.fillStyle = "rgba(34,211,238,0.4)";
      ctx.beginPath(); ctx.arc(W / 2 + Math.cos(ballA) * R, st.by + Math.sin(ballA) * 16, 8, 0, Math.PI * 2); ctx.fill();
      // HUD
      ctx.fillStyle = "white"; ctx.font = "bold 26px 'Press Start 2P', monospace"; ctx.textAlign = "left";
      ctx.fillText(String(score), 14, 36);
      if (combo >= 3) { ctx.fillStyle = "#fde047"; ctx.font = "16px Inter"; ctx.textAlign = "right"; ctx.fillText(`combo x${combo}`, W - 14, 36); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [over, score, combo, play, vibrate]);

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)}>
      <div ref={wrapRef} className="no-scroll">
        <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(92vw,420px)] h-auto aspect-[420/640] touch-none" />
      </div>
      <p className="mt-2 text-xs text-white/40">← → / A D or drag to rotate · Falls through cyan, dies on red.</p>
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>A ball falls down a helix tower. Rotate the helix to land in gaps.</li>
          <li>Cyan = safe. Red = death.</li>
          <li>3+ rings in a row without bouncing = combo bonus.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
