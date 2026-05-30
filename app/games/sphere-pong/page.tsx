"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { pushRecent, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { makeScene, addStarfield, neonMat } from "@/lib/three-helpers";

const ARENA_W = 8, ARENA_H = 5, ARENA_D = 14;
const PAD_W = 2, PAD_H = 1.4, PAD_T = 0.2;
const BALL_R = 0.3;

export default function SpherePong() {
  const game = getGame("sphere-pong")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState({ p: 0, a: 0 });
  const [over, setOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();
  const target = 7;

  const sRef = useRef({
    ball: new THREE.Vector3(0, 0, 0),
    vel: new THREE.Vector3(0.06, 0.05, 0.12),
    playerX: 0, playerY: 0,
    aiX: 0, aiY: 0,
    last: 0,
    mouseX: 0, mouseY: 0,
    paused: false,
    over: false,
  });
  useEffect(() => { sRef.current.paused = paused; }, [paused]);
  useEffect(() => { sRef.current.over = over; }, [over]);

  useEffect(() => { pushRecent("sphere-pong"); }, []);

  const serve = (dir: 1 | -1) => {
    sRef.current.ball.set(0, 0, 0);
    sRef.current.vel.set((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, 0.12 * dir);
  };

  const reset = () => { setScore({ p: 0, a: 0 }); setOver(false); setPaused(false); serve(1); };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { renderer, scene, camera, dispose } = makeScene(canvas, { bgColor: 0x05050d, fog: { color: 0x05050d, near: 8, far: 40 } });
    addStarfield(scene, 300);

    // Arena box (wireframe)
    const wallMat = new THREE.LineBasicMaterial({ color: 0xb14aed, transparent: true, opacity: 0.5 });
    const wallsGeom = new THREE.BoxGeometry(ARENA_W, ARENA_H, ARENA_D);
    const edges = new THREE.EdgesGeometry(wallsGeom);
    const wireframe = new THREE.LineSegments(edges, wallMat);
    scene.add(wireframe);

    // Player paddle
    const padGeom = new THREE.BoxGeometry(PAD_W, PAD_H, PAD_T);
    const pPadMat = neonMat(0x22d3ee, 1.0);
    const pPad = new THREE.Mesh(padGeom, pPadMat);
    pPad.position.z = ARENA_D / 2 - 0.5;
    scene.add(pPad);

    const aPadMat = neonMat(0xec4899, 1.0);
    const aPad = new THREE.Mesh(padGeom, aPadMat);
    aPad.position.z = -ARENA_D / 2 + 0.5;
    scene.add(aPad);

    // Ball
    const ballGeom = new THREE.SphereGeometry(BALL_R, 24, 16);
    const ballMat = neonMat(0xfde047, 1.6);
    const ball = new THREE.Mesh(ballGeom, ballMat);
    scene.add(ball);
    const ballLight = new THREE.PointLight(0xfde047, 2, 6);
    scene.add(ballLight);

    camera.position.set(0, 1.8, ARENA_D / 2 + 4);
    camera.lookAt(0, 0, 0);

    serve(1);

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      sRef.current.mouseX = (((e.clientX - rect.left) / rect.width) - 0.5) * 2;
      sRef.current.mouseY = (((e.clientY - rect.top) / rect.height) - 0.5) * 2;
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("touchmove", (e) => {
      if (e.touches[0]) {
        const rect = canvas.getBoundingClientRect();
        sRef.current.mouseX = (((e.touches[0].clientX - rect.left) / rect.width) - 0.5) * 2;
        sRef.current.mouseY = (((e.touches[0].clientY - rect.top) / rect.height) - 0.5) * 2;
      }
    }, { passive: true });
    const keys: Record<string, boolean> = {};
    const dn = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
    const up = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);

    let raf = 0;
    const tick = (t: number) => {
      const dt = sRef.current.last ? Math.min(48, t - sRef.current.last) : 16;
      sRef.current.last = t;

      // Player paddle from mouse
      const halfW = ARENA_W / 2 - PAD_W / 2;
      const halfH = ARENA_H / 2 - PAD_H / 2;
      sRef.current.playerX = sRef.current.mouseX * halfW;
      sRef.current.playerY = -sRef.current.mouseY * halfH;
      // keyboard override
      if (keys["a"] || keys["arrowleft"]) sRef.current.playerX = Math.max(-halfW, sRef.current.playerX - 0.2);
      if (keys["d"] || keys["arrowright"]) sRef.current.playerX = Math.min(halfW, sRef.current.playerX + 0.2);
      if (keys["w"] || keys["arrowup"]) sRef.current.playerY = Math.min(halfH, sRef.current.playerY + 0.2);
      if (keys["s"] || keys["arrowdown"]) sRef.current.playerY = Math.max(-halfH, sRef.current.playerY - 0.2);
      pPad.position.x = sRef.current.playerX;
      pPad.position.y = sRef.current.playerY;
      // AI paddle tracks ball
      sRef.current.aiX += (sRef.current.ball.x - sRef.current.aiX) * 0.08;
      sRef.current.aiY += (sRef.current.ball.y - sRef.current.aiY) * 0.08;
      aPad.position.x = Math.max(-halfW, Math.min(halfW, sRef.current.aiX));
      aPad.position.y = Math.max(-halfH, Math.min(halfH, sRef.current.aiY));

      if (!sRef.current.paused && !sRef.current.over) {
        sRef.current.ball.add(sRef.current.vel);
        // walls
        if (Math.abs(sRef.current.ball.x) > ARENA_W / 2 - BALL_R) { sRef.current.vel.x *= -1; play("tick"); }
        if (Math.abs(sRef.current.ball.y) > ARENA_H / 2 - BALL_R) { sRef.current.vel.y *= -1; play("tick"); }
        // paddle collisions
        if (sRef.current.ball.z > pPad.position.z - PAD_T && sRef.current.vel.z > 0) {
          if (Math.abs(sRef.current.ball.x - pPad.position.x) < PAD_W / 2 && Math.abs(sRef.current.ball.y - pPad.position.y) < PAD_H / 2) {
            sRef.current.vel.z = -Math.abs(sRef.current.vel.z) * 1.04;
            sRef.current.vel.x += (sRef.current.ball.x - pPad.position.x) * 0.04;
            sRef.current.vel.y += (sRef.current.ball.y - pPad.position.y) * 0.04;
            play("blip"); vibrate(15);
          }
        }
        if (sRef.current.ball.z < aPad.position.z + PAD_T && sRef.current.vel.z < 0) {
          if (Math.abs(sRef.current.ball.x - aPad.position.x) < PAD_W / 2 && Math.abs(sRef.current.ball.y - aPad.position.y) < PAD_H / 2) {
            sRef.current.vel.z = Math.abs(sRef.current.vel.z) * 1.04;
            sRef.current.vel.x += (sRef.current.ball.x - aPad.position.x) * 0.04;
            sRef.current.vel.y += (sRef.current.ball.y - aPad.position.y) * 0.04;
            play("blip");
          }
        }
        // Scoring
        if (sRef.current.ball.z > ARENA_D / 2) {
          setScore((s) => {
            const ns = { ...s, a: s.a + 1 };
            if (ns.a >= target) { setOver(true); play("lose"); updateStats("sphere-pong", { plays: 1, losses: 1 }); }
            else { setTimeout(() => serve(1), 600); }
            return ns;
          });
          sRef.current.vel.set(0, 0, 0);
        } else if (sRef.current.ball.z < -ARENA_D / 2) {
          setScore((s) => {
            const ns = { ...s, p: s.p + 1 };
            if (ns.p >= target) { setOver(true); play("win"); updateStats("sphere-pong", { plays: 1, wins: 1 }); }
            else { setTimeout(() => serve(-1), 600); }
            return ns;
          });
          sRef.current.vel.set(0, 0, 0);
        }
      }
      ball.position.copy(sRef.current.ball);
      ballLight.position.copy(sRef.current.ball);

      // gentle camera drift
      camera.position.x = Math.sin(t / 4000) * 0.7;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up);
      dispose();
    };
  }, []); // scene initialized once

  return (
    <GameShell game={game} score={`${score.p} : ${score.a}`} paused={paused} onTogglePause={() => setPaused((p) => !p)} onRestart={reset} onOpenHowTo={() => setShowHow(true)}>
      <canvas ref={canvasRef} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,800px)] aspect-[800/520] cursor-none" />
      <GameOverModal open={over} onClose={() => setOver(false)} title={score.p > score.a ? "You win!" : "AI wins"} score={`${score.p} : ${score.a}`} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Move your paddle with mouse / touch / WASD. AI plays the back wall.</li>
          <li>Ball bounces off the arena walls. First to {target} wins.</li>
          <li>Hit the ball off-center to add spin.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
