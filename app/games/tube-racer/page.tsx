"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { makeScene } from "@/lib/three-helpers";

export default function TubeRacer() {
  const game = getGame("tube-racer")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const sRef = useRef({
    angle: 0, // ship angle around tube center
    targetAngle: 0,
    speed: 0.5,
    obstacles: [] as { mesh: THREE.Mesh; angle: number; z: number }[],
    timeAlive: 0,
    last: 0,
    tubeProgress: 0,
    over: false,
  });
  useEffect(() => { sRef.current.over = over; }, [over]);

  useEffect(() => { pushRecent("tube-racer"); setBest(getHighScore("tube-racer")); }, []);

  const reset = useCallback((scene: THREE.Scene | null) => {
    if (!scene) return;
    sRef.current.obstacles.forEach((o) => scene.remove(o.mesh));
    sRef.current.obstacles = [];
    sRef.current.timeAlive = 0;
    sRef.current.angle = 0;
    sRef.current.targetAngle = 0;
    sRef.current.speed = 0.5;
    setScore(0); setOver(false);
  }, []);

  const sceneHolder = useRef<THREE.Scene | null>(null);
  const move = (delta: number) => {
    sRef.current.targetAngle += delta;
    play("tick");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") move(-0.4);
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") move(0.4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line

  // touch drag
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    let lastX = 0; let dragging = false;
    const start = (e: TouchEvent) => { lastX = e.touches[0].clientX; dragging = true; };
    const mv = (e: TouchEvent) => {
      if (!dragging) return;
      const x = e.touches[0].clientX; const dx = x - lastX;
      sRef.current.targetAngle += dx * 0.012; lastX = x;
    };
    const end = () => { dragging = false; };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", mv, { passive: true });
    el.addEventListener("touchend", end);
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", mv); el.removeEventListener("touchend", end); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { renderer, scene, camera, dispose } = makeScene(canvas, {
      bgColor: 0x02020a,
      fog: { color: 0x06061a, near: 5, far: 35 },
      shadows: false,
    });
    sceneHolder.current = scene;

    // Tube — long cylinder, looking inward, wireframe-style
    const tubeRadius = 4;
    const tubeLen = 200;
    const tubeGeom = new THREE.CylinderGeometry(tubeRadius, tubeRadius, tubeLen, 16, 60, true);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xb14aed, wireframe: true, transparent: true, opacity: 0.6 });
    const tube = new THREE.Mesh(tubeGeom, tubeMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = -tubeLen / 2;
    scene.add(tube);

    // Inner glow rings — emissive
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.TorusGeometry(tubeRadius * 0.98, 0.06, 6, 32);
      const c = i % 2 === 0 ? 0x22d3ee : 0xec4899;
      const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8 });
      const r = new THREE.Mesh(g, m);
      r.position.z = -i * (tubeLen / 12);
      scene.add(r);
      rings.push(r);
    }

    // Ship — a small triangular thing oriented toward camera
    const shipGeom = new THREE.ConeGeometry(0.3, 0.8, 4);
    const shipMat = new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xfde047, emissiveIntensity: 1.2 });
    const ship = new THREE.Mesh(shipGeom, shipMat);
    ship.rotation.x = -Math.PI / 2;
    scene.add(ship);

    const shipLight = new THREE.PointLight(0xfde047, 2, 5);
    scene.add(shipLight);

    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, -10);

    const obstGeom = new THREE.BoxGeometry(0.8, 0.8, 0.4);
    const obstMat = new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xec4899, emissiveIntensity: 1.2 });

    let raf = 0;
    let nextSpawn = 0;
    const tick = (t: number) => {
      const st = sRef.current;
      const dt = st.last ? Math.min(48, t - st.last) : 16;
      st.last = t;

      if (!st.over) {
        st.timeAlive += dt;
        st.speed = Math.min(1.1, 0.5 + st.timeAlive * 0.00005);
        st.angle += (st.targetAngle - st.angle) * 0.2;

        // ship orbits inside tube radius
        const r = tubeRadius - 0.6;
        ship.position.set(Math.cos(st.angle) * r, Math.sin(st.angle) * r, 0);
        shipLight.position.copy(ship.position);
        // rings + tube scroll towards camera
        for (const ring of rings) {
          ring.position.z += st.speed * (dt / 16) * 0.5;
          if (ring.position.z > 5) ring.position.z -= tubeLen;
        }
        tube.rotation.y += 0.003;

        // spawn obstacles
        if (t > nextSpawn) {
          const a = Math.random() * Math.PI * 2;
          const m = new THREE.Mesh(obstGeom, obstMat);
          m.position.set(Math.cos(a) * r, Math.sin(a) * r, -30);
          m.lookAt(0, 0, m.position.z);
          scene.add(m);
          st.obstacles.push({ mesh: m, angle: a, z: -30 });
          nextSpawn = t + Math.max(280, 700 - st.timeAlive * 0.04);
        }

        // move obstacles + collide
        for (let i = st.obstacles.length - 1; i >= 0; i--) {
          const o = st.obstacles[i];
          o.mesh.position.z += st.speed * (dt / 16) * 0.5;
          if (o.mesh.position.z > 6) { scene.remove(o.mesh); st.obstacles.splice(i, 1); continue; }
          if (o.mesh.position.z > -0.6 && o.mesh.position.z < 0.6) {
            // angle diff
            let diff = Math.abs(o.angle - st.angle);
            diff = Math.min(diff, Math.PI * 2 - diff);
            if (diff < 0.45) {
              setOver(true);
              st.over = true;
              const fs = Math.floor(st.timeAlive / 100);
              const ok = setHighScore("tube-racer", fs); if (ok) setBest(fs);
              updateStats("tube-racer", { plays: 1, losses: 1, bestScore: fs });
              play("lose"); vibrate(180);
              break;
            }
          }
        }
        setScore((prev) => Math.max(prev, Math.floor(st.timeAlive / 100)));
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); dispose(); };
  }, []); // scene initialized once

  return (
    <GameShell game={game} score={score} best={best} onRestart={() => reset(sceneHolder.current)} onOpenHowTo={() => setShowHow(true)}>
      <div ref={wrapRef} className="no-scroll">
        <canvas ref={canvasRef} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,800px)] aspect-[800/520]" />
      </div>
      <p className="mt-2 text-xs text-white/40">← → / A D / drag to rotate the ship around the tube.</p>
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} onRestart={() => reset(sceneHolder.current)} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Pink boxes rush at you. Rotate around the tube to dodge.</li>
          <li>Speed ramps up the longer you survive.</li>
          <li>Score = milliseconds survived / 100.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
