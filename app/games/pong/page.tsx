"use client";

import { useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { pushRecent, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { useIsTouch } from "@/lib/useTouchControls";
import { unlock } from "@/lib/achievements";
import { cn } from "@/lib/cn";

type Mode = "1p-easy" | "1p-med" | "1p-hard" | "2p";

export default function PongGame() {
  const game = getGame("pong")!;
  const [mode, setMode] = useState<Mode>("1p-med");
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [scoreL, setScoreL] = useState(0);
  const [scoreR, setScoreR] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [targetScore, setTargetScore] = useState(7);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const touch = useIsTouch();
  const { play, vibrate } = useSound();

  const W = 800, H = 480;
  const PAD_H = 90, PAD_W = 12, BALL_R = 8;

  const s = useRef({
    leftY: H / 2 - PAD_H / 2,
    rightY: H / 2 - PAD_H / 2,
    bx: W / 2,
    by: H / 2,
    vx: 0,
    vy: 0,
    keys: {} as Record<string, boolean>,
    leftTouchY: null as number | null,
    rightTouchY: null as number | null,
    last: performance.now(),
  });

  const serve = (dir: 1 | -1) => {
    const angle = (Math.random() - 0.5) * 0.6;
    const speed = 5.5;
    s.current.bx = W / 2;
    s.current.by = H / 2;
    s.current.vx = Math.cos(angle) * speed * dir;
    s.current.vy = Math.sin(angle) * speed;
  };

  const reset = () => {
    setScoreL(0);
    setScoreR(0);
    setOver(false);
    setPaused(false);
    s.current.leftY = H / 2 - PAD_H / 2;
    s.current.rightY = H / 2 - PAD_H / 2;
    serve(Math.random() < 0.5 ? 1 : -1);
  };

  useEffect(() => {
    pushRecent("pong");
    serve(1);
  }, []); // eslint-disable-line

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      s.current.keys[e.key.toLowerCase()] = true;
      if (e.key === " ") setPaused((p) => !p);
    };
    const up = (e: KeyboardEvent) => (s.current.keys[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      const rect = el.getBoundingClientRect();
      const scale = H / rect.height;
      for (const t of Array.from(e.touches)) {
        const y = (t.clientY - rect.top) * scale;
        const isLeft = t.clientX - rect.left < rect.width / 2;
        if (isLeft) s.current.leftTouchY = y;
        else if (mode === "2p") s.current.rightTouchY = y;
        else s.current.leftTouchY = y; // single player drags left
      }
    };
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchstart", onMove, { passive: true });
    return () => {
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchstart", onMove);
    };
  }, [mode]);

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
      if (!paused && !over) {
        const st = s.current;
        const speed = 7;
        // Left paddle: human in 1P or 2P (W/S)
        if (st.keys["w"]) st.leftY -= speed;
        if (st.keys["s"]) st.leftY += speed;
        if (st.leftTouchY != null) st.leftY = Math.max(0, Math.min(H - PAD_H, st.leftTouchY - PAD_H / 2));
        // Right paddle
        if (mode === "2p") {
          if (st.keys["arrowup"]) st.rightY -= speed;
          if (st.keys["arrowdown"]) st.rightY += speed;
          if (st.rightTouchY != null) st.rightY = Math.max(0, Math.min(H - PAD_H, st.rightTouchY - PAD_H / 2));
        } else {
          const tracking = mode === "1p-hard" ? 0.14 : mode === "1p-med" ? 0.09 : 0.05;
          const targetY = st.by - PAD_H / 2;
          st.rightY += (targetY - st.rightY) * tracking;
        }
        st.leftY = Math.max(0, Math.min(H - PAD_H, st.leftY));
        st.rightY = Math.max(0, Math.min(H - PAD_H, st.rightY));
        // ball
        st.bx += st.vx * (dt / 16);
        st.by += st.vy * (dt / 16);
        if (st.by < BALL_R) { st.by = BALL_R; st.vy *= -1; play("tick"); }
        if (st.by > H - BALL_R) { st.by = H - BALL_R; st.vy *= -1; play("tick"); }
        // paddle collisions with spin
        if (st.bx - BALL_R < PAD_W + 6 && st.by > st.leftY && st.by < st.leftY + PAD_H && st.vx < 0) {
          st.vx = Math.abs(st.vx) * 1.06;
          const off = (st.by - (st.leftY + PAD_H / 2)) / (PAD_H / 2);
          st.vy = off * 6;
          play("blip"); vibrate(15);
        }
        if (st.bx + BALL_R > W - PAD_W - 6 && st.by > st.rightY && st.by < st.rightY + PAD_H && st.vx > 0) {
          st.vx = -Math.abs(st.vx) * 1.06;
          const off = (st.by - (st.rightY + PAD_H / 2)) / (PAD_H / 2);
          st.vy = off * 6;
          play("blip"); vibrate(15);
        }
        // scoring (only once per serve — guard with bx position)
        if (st.bx < -20) {
          st.bx = W / 2; st.by = H / 2; st.vx = 0; st.vy = 0;
          setScoreR((r) => {
            const next = r + 1;
            if (next >= targetScore) {
              setOver(true);
              play("lose");
              updateStats("pong", { plays: 1, losses: 1 });
            } else {
              setTimeout(() => serve(1), 600);
            }
            return next;
          });
        } else if (st.bx > W + 20) {
          st.bx = W / 2; st.by = H / 2; st.vx = 0; st.vy = 0;
          setScoreL((l) => {
            const next = l + 1;
            if (next >= targetScore) {
              setOver(true);
              play("win");
              updateStats("pong", { plays: 1, wins: 1 });
              if (mode === "1p-hard") unlock("pong-win-hard");
            } else {
              setTimeout(() => serve(-1), 600);
            }
            return next;
          });
        }
      }
      // draw
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, 0, W, H);
      ctx.setLineDash([10, 12]);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#22d3ee";
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(6, s.current.leftY, PAD_W, PAD_H);
      ctx.shadowColor = "#ec4899";
      ctx.fillStyle = "#ec4899";
      ctx.fillRect(W - PAD_W - 6, s.current.rightY, PAD_W, PAD_H);
      ctx.shadowColor = "#fde047";
      ctx.fillStyle = "#fde047";
      ctx.beginPath(); ctx.arc(s.current.bx, s.current.by, BALL_R, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // scores
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 56px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(scoreL), W / 2 - 80, 70);
      ctx.fillText(String(scoreR), W / 2 + 80, 70);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, paused, over, targetScore, scoreL, scoreR, play, vibrate]);

  return (
    <GameShell
      game={game}
      score={`${scoreL} : ${scoreR}`}
      paused={paused}
      onTogglePause={() => setPaused((p) => !p)}
      onRestart={reset}
      onOpenHowTo={() => setShowHow(true)}
      onOpenSettings={() => setShowSettings(true)}
    >
      <div ref={wrapRef} className="no-scroll">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,800px)] h-auto aspect-[800/480]"
        />
      </div>
      {touch && <p className="mt-3 text-xs text-white/50">Drag on each half of the board to move that paddle.</p>}

      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        title={scoreL > scoreR ? "You win!" : "AI wins"}
        score={`${scoreL} : ${scoreR}`}
        onRestart={reset}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Left paddle: W/S or drag left half. Right paddle: ↑/↓ or drag right half (2P only).</li>
          <li>First to {targetScore} wins. Ball speeds up on each hit.</li>
          <li>Where you hit on the paddle adds spin.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings" footer={<button onClick={reset} className="btn-primary w-full justify-center">Restart</button>}>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-white/60 mb-2">Mode</p>
            <div className="grid grid-cols-2 gap-2">
              {([["1p-easy","1P Easy"],["1p-med","1P Medium"],["1p-hard","1P Hard"],["2p","2 Player"]] as [Mode,string][]).map(([k,l]) => (
                <button key={k} onClick={() => setMode(k)} className={cn("px-3 py-2 rounded-lg border text-sm", mode === k ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-white/60 mb-2">First to</p>
            <div className="flex gap-2">
              {[5, 7, 11, 21].map((n) => (
                <button key={n} onClick={() => setTargetScore(n)} className={cn("flex-1 px-3 py-2 rounded-lg border text-sm", targetScore === n ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>{n}</button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </GameShell>
  );
}
