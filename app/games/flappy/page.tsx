"use client";

import { useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { unlock } from "@/lib/achievements";

const W = 480, H = 720;
const GAP = 160, PIPE_W = 70, PIPE_SPACING = 220;
const GRAVITY = 0.5, FLAP = -8.5;

type Pipe = { x: number; gapY: number; passed: boolean };

export default function FlappyGame() {
  const game = getGame("flappy")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [over, setOver] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const s = useRef({
    y: H / 2,
    v: 0,
    pipes: [] as Pipe[],
    bgX: 0,
    last: performance.now(),
    started: false,
    rot: 0,
  });

  const reset = () => {
    s.current.y = H / 2;
    s.current.v = 0;
    s.current.pipes = [];
    s.current.started = false;
    s.current.rot = 0;
    setScore(0);
    setOver(false);
  };

  useEffect(() => {
    pushRecent("flappy");
    setBest(getHighScore("flappy"));
  }, []);

  const flap = () => {
    if (over) return;
    s.current.started = true;
    s.current.v = FLAP;
    play("blip");
    vibrate(10);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === "ArrowUp" || e.key.toLowerCase() === "w") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [over]); // eslint-disable-line

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current;
      if (!c) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last);
      s.current.last = t;
      const st = s.current;

      if (!over) {
        if (st.started) {
          st.v += GRAVITY * (dt / 16);
          st.y += st.v * (dt / 16);
          st.rot = Math.max(-0.5, Math.min(1.2, st.v / 10));
          // spawn pipes
          const lastPipe = st.pipes[st.pipes.length - 1];
          if (!lastPipe || W - lastPipe.x > PIPE_SPACING) {
            const gapY = 80 + Math.random() * (H - 160 - GAP);
            st.pipes.push({ x: W, gapY, passed: false });
          }
          for (const p of st.pipes) {
            p.x -= 3 * (dt / 16);
            if (!p.passed && p.x + PIPE_W < 80) {
              p.passed = true;
              setScore((sc) => sc + 1);
              play("ding");
            }
          }
          st.pipes = st.pipes.filter((p) => p.x > -PIPE_W);
          // collisions
          if (st.y < 0 || st.y > H - 50) crash();
          for (const p of st.pipes) {
            if (80 + 22 > p.x && 80 - 22 < p.x + PIPE_W && (st.y < p.gapY || st.y > p.gapY + GAP)) {
              crash();
              break;
            }
          }
        } else {
          st.y = H / 2 + Math.sin(t / 200) * 8;
        }
        st.bgX = (st.bgX - 0.5 * (dt / 16)) % W;
      }

      function crash() {
        if (over) return;
        setOver(true);
        const ok = setHighScore("flappy", score);
        if (ok) setBest(score);
        updateStats("flappy", { plays: 1, losses: 1, bestScore: score });
        if (score >= 7) unlock("flappy-bronze");
        if (score >= 40) unlock("flappy-platinum");
        play("lose");
        vibrate(180);
      }

      // background
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#11142a");
      grad.addColorStop(1, "#070716");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      // distant stars
      for (let i = 0; i < 40; i++) {
        const sx = (i * 37 + st.bgX * 0.3) % W;
        const sy = (i * 53) % H;
        ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 3) * 0.15})`;
        ctx.fillRect(sx, sy, 2, 2);
      }
      // ground
      ctx.fillStyle = "#1f1f33";
      ctx.fillRect(0, H - 50, W, 50);
      ctx.fillStyle = "#22ee9c";
      ctx.fillRect(0, H - 50, W, 4);
      // pipes
      for (const p of st.pipes) {
        ctx.fillStyle = "#22ee9c";
        ctx.shadowColor = "#22ee9c";
        ctx.shadowBlur = 8;
        ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
        ctx.fillRect(p.x, p.gapY + GAP, PIPE_W, H - p.gapY - GAP - 50);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(p.x, p.gapY - 8, PIPE_W, 8);
        ctx.fillRect(p.x, p.gapY + GAP, PIPE_W, 8);
      }
      // bird
      ctx.save();
      ctx.translate(80, st.y);
      ctx.rotate(st.rot);
      ctx.fillStyle = "#fde047";
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(5, -4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(10, 2, 10, 4);
      ctx.restore();
      // score
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "bold 56px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(score), W / 2, 90);
      if (!st.started && !over) {
        ctx.font = "16px Inter";
        ctx.fillText("Tap / Space to flap", W / 2, H / 2 + 80);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, over, play, vibrate]);

  const medal = score >= 40 ? "🏆 Platinum" : score >= 25 ? "🥇 Gold" : score >= 15 ? "🥈 Silver" : score >= 7 ? "🥉 Bronze" : "";

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={flap}
        onTouchStart={(e) => { e.preventDefault(); flap(); }}
        className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(92vw,480px)] h-auto aspect-[480/720] cursor-pointer touch-none"
      />
      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        score={score}
        best={best}
        isNewBest={score === best && score > 0}
        extra={medal ? <div className="text-xl mt-1">{medal}</div> : null}
        onRestart={reset}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Tap, click, or press Space to flap.</li>
          <li>Don't hit the pipes or the ground.</li>
          <li>Medals: 🥉 7+ · 🥈 15+ · 🥇 25+ · 🏆 40+.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
