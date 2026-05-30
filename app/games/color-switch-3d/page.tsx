"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { makeScene, addStarfield } from "@/lib/three-helpers";

const COLORS = [0xec4899, 0x22d3ee, 0xfde047, 0x22ee9c];

export default function ColorSwitch3D() {
  const game = getGame("color-switch-3d")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const sRef = useRef({
    ballY: 0, vy: 0,
    ballColor: 0,
    rings: [] as { group: THREE.Group; segments: { mesh: THREE.Mesh; color: number }[]; y: number; cleared: boolean }[],
    last: 0,
    pickups: [] as THREE.Mesh[],
    over: false,
    score: 0,
  });
  useEffect(() => { sRef.current.over = over; }, [over]);
  useEffect(() => { sRef.current.score = score; }, [score]);

  useEffect(() => { pushRecent("color-switch-3d"); setBest(getHighScore("color-switch-3d")); }, []);
  const sceneHolder = useRef<THREE.Scene | null>(null);

  const makeRing = useCallback((y: number): { group: THREE.Group; segments: { mesh: THREE.Mesh; color: number }[]; y: number; cleared: boolean } => {
    const group = new THREE.Group();
    const segments: { mesh: THREE.Mesh; color: number }[] = [];
    const segCount = 4;
    for (let i = 0; i < segCount; i++) {
      const startA = (i / segCount) * Math.PI * 2;
      const endA = ((i + 1) / segCount) * Math.PI * 2;
      const geom = new THREE.RingGeometry(1.4, 1.7, 16, 1, startA, endA - startA);
      const color = COLORS[i];
      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = Math.PI / 2;
      group.add(mesh);
      segments.push({ mesh, color });
    }
    group.position.y = y;
    group.rotation.y = Math.random() * Math.PI * 2;
    return { group, segments, y, cleared: false };
  }, []);

  const jump = useCallback(() => {
    if (over) return;
    sRef.current.vy = 0.32;
    play("blip"); vibrate(15);
  }, [over, play, vibrate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space" || e.key === "ArrowUp" || e.key.toLowerCase() === "w") { e.preventDefault(); jump(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  const reset = useCallback(() => {
    const scene = sceneHolder.current; if (!scene) return;
    for (const r of sRef.current.rings) scene.remove(r.group);
    for (const p of sRef.current.pickups) scene.remove(p);
    sRef.current.rings = [];
    sRef.current.pickups = [];
    sRef.current.ballY = 0;
    sRef.current.vy = 0;
    sRef.current.ballColor = 0;
    setScore(0); setOver(false);
    // initial rings going up
    for (let i = 0; i < 6; i++) {
      const r = makeRing(4 + i * 4);
      scene.add(r.group);
      sRef.current.rings.push(r);
      // color pickup between rings
      const pg = new THREE.OctahedronGeometry(0.3, 0);
      const pickupColor = COLORS[Math.floor(Math.random() * COLORS.length)];
      const pm = new THREE.MeshStandardMaterial({ color: pickupColor, emissive: pickupColor, emissiveIntensity: 1 });
      const p = new THREE.Mesh(pg, pm);
      p.position.set(0, 4 + i * 4 + 2, 0);
      (p as any).pickupColor = pickupColor;
      scene.add(p);
      sRef.current.pickups.push(p);
    }
  }, [makeRing]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { renderer, scene, camera, dispose } = makeScene(canvas, { bgColor: 0x05071a });
    addStarfield(scene, 250);
    sceneHolder.current = scene;

    // Ball
    const ballGeom = new THREE.SphereGeometry(0.3, 24, 16);
    const ballMat = new THREE.MeshStandardMaterial({ color: COLORS[0], emissive: COLORS[0], emissiveIntensity: 1 });
    const ball = new THREE.Mesh(ballGeom, ballMat);
    scene.add(ball);
    const ballLight = new THREE.PointLight(COLORS[0], 2, 6);
    scene.add(ballLight);

    camera.position.set(0, 1, 6);
    reset();

    let raf = 0;
    const tick = (t: number) => {
      const st = sRef.current;
      const dt = st.last ? Math.min(48, t - st.last) : 16;
      st.last = t;

      if (!sRef.current.over) {
        st.vy -= 0.012;
        st.vy = Math.max(-0.5, st.vy);
        st.ballY += st.vy;

        // update ball color
        const c = COLORS[st.ballColor];
        (ballMat as THREE.MeshStandardMaterial).color.setHex(c);
        (ballMat as THREE.MeshStandardMaterial).emissive.setHex(c);
        ballLight.color.setHex(c);

        // rotate all rings
        for (const r of st.rings) r.group.rotation.y += 0.008;

        // ring collisions — check segment crossed
        for (const r of st.rings) {
          if (r.cleared) continue;
          if (Math.abs(st.ballY - r.y) < 0.2 && st.vy < 0) {
            // find ball's angle relative to ring
            const ringRotation = r.group.rotation.y;
            const ballAngle = 0; // ball is on Y axis, so its world angle around ring is 0
            // figure out which segment is at ball position
            // each segment occupies a quarter; with ring rotation, segment i covers (i/4 + rot, (i+1)/4 + rot)
            const segCount = 4;
            const normalize = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const segIdx = Math.floor(normalize(-ringRotation) / (Math.PI * 2 / segCount)) % segCount;
            const segColor = r.segments[segIdx].color;
            if (segColor === c) {
              r.cleared = true;
              for (const seg of r.segments) (seg.mesh.material as THREE.MeshBasicMaterial).opacity = 0.2;
              setScore((s) => s + 10);
              play("ding"); vibrate(15);
            } else {
              setOver(true); sRef.current.over = true;
              const fs = sRef.current.score;
              const ok = setHighScore("color-switch-3d", fs); if (ok) setBest(fs);
              updateStats("color-switch-3d", { plays: 1, losses: 1, bestScore: fs });
              play("lose"); vibrate(180);
              break;
            }
          }
        }
        // pickup collisions
        for (let i = st.pickups.length - 1; i >= 0; i--) {
          const p = st.pickups[i];
          p.rotation.x += 0.05; p.rotation.y += 0.05;
          if (Math.abs(p.position.y - st.ballY) < 0.4) {
            const newColor = (p as any).pickupColor;
            st.ballColor = COLORS.indexOf(newColor);
            scene.remove(p);
            st.pickups.splice(i, 1);
            play("pop"); vibrate(10);
          }
        }
        // fall off bottom
        if (st.ballY < -3) {
          setOver(true);
          const ok = setHighScore("color-switch-3d", score); if (ok) setBest(score);
          updateStats("color-switch-3d", { plays: 1, losses: 1, bestScore: score });
          play("lose"); vibrate(180);
        }
        // generate ahead
        while (st.rings.length > 0 && st.rings[0].cleared && st.ballY > st.rings[0].y + 4) {
          const old = st.rings.shift()!;
          scene.remove(old.group);
          // remove matching pickup
          const idx = st.pickups.findIndex((p) => Math.abs(p.position.y - old.y) < 3);
          if (idx >= 0) { scene.remove(st.pickups[idx]); st.pickups.splice(idx, 1); }
          // add new
          const lastY = st.rings.length > 0 ? st.rings[st.rings.length - 1].y : st.ballY + 8;
          const newR = makeRing(lastY + 4);
          scene.add(newR.group);
          st.rings.push(newR);
          const pg = new THREE.OctahedronGeometry(0.3, 0);
          const pColor = COLORS[Math.floor(Math.random() * COLORS.length)];
          const pmat = new THREE.MeshStandardMaterial({ color: pColor, emissive: pColor, emissiveIntensity: 1 });
          const p = new THREE.Mesh(pg, pmat);
          p.position.set(0, lastY + 4 + 2, 0);
          (p as any).pickupColor = pColor;
          scene.add(p);
          st.pickups.push(p);
        }
      }
      ball.position.set(0, st.ballY, 0);
      ballLight.position.set(0, st.ballY, 0);
      // camera follow up
      camera.position.y = st.ballY + 1;
      camera.lookAt(0, st.ballY, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); dispose(); };
  }, []); // scene initialized once

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)}>
      <canvas ref={canvasRef} onClick={jump} onTouchStart={(e) => { e.preventDefault(); jump(); }} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(92vw,480px)] aspect-[480/640] cursor-pointer touch-none" />
      <p className="mt-2 text-xs text-white/40">Click / tap / Space to jump</p>
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Bouncing ball passes through rotating rings.</li>
          <li>The ring segment beneath the ball must match the ball's color.</li>
          <li>Grab the octahedron between rings to change color.</li>
          <li>10 points per ring. Speed scales naturally with rotation timing.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
