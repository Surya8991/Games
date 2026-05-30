"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { makeScene, addStarfield, neonMat } from "@/lib/three-helpers";

export default function GalaxyShooter() {
  const game = getGame("galaxy-shooter")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const sRef = useRef({
    ship: new THREE.Vector3(0, 0, 0),
    target: new THREE.Vector3(0, 0, 0),
    bullets: [] as { mesh: THREE.Mesh; v: THREE.Vector3 }[],
    asteroids: [] as { mesh: THREE.Mesh; v: THREE.Vector3 }[],
    last: 0,
    keys: {} as Record<string, boolean>,
    fireCool: 0,
    spawnAt: 0,
  });

  useEffect(() => { pushRecent("galaxy-shooter"); setBest(getHighScore("galaxy-shooter")); }, []);

  const sceneHolder = useRef<{ scene: THREE.Scene; ship: THREE.Object3D } | null>(null);
  const fire = useCallback(() => {
    if (!sceneHolder.current || sRef.current.fireCool > 0 || over) return;
    const { scene, ship } = sceneHolder.current;
    const bGeom = new THREE.SphereGeometry(0.12, 8, 8);
    const bMat = neonMat(0xfde047, 2);
    const b = new THREE.Mesh(bGeom, bMat);
    b.position.copy(ship.position);
    scene.add(b);
    sRef.current.bullets.push({ mesh: b, v: new THREE.Vector3(0, 0, -0.6) });
    sRef.current.fireCool = 8;
    play("tick");
  }, [over, play]);

  const reset = useCallback(() => {
    if (!sceneHolder.current) return;
    const scene = sceneHolder.current.scene;
    sRef.current.bullets.forEach((b) => scene.remove(b.mesh));
    sRef.current.asteroids.forEach((a) => scene.remove(a.mesh));
    sRef.current.bullets = [];
    sRef.current.asteroids = [];
    sRef.current.ship.set(0, 0, 0);
    setScore(0); setOver(false);
  }, []);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => { sRef.current.keys[e.key.toLowerCase()] = true; if (e.code === "Space") { e.preventDefault(); fire(); } };
    const up = (e: KeyboardEvent) => { sRef.current.keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [fire]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { renderer, scene, camera, dispose } = makeScene(canvas, { bgColor: 0x020210, fog: { color: 0x020210, near: 20, far: 70 } });
    addStarfield(scene, 800);

    // Ship — simple cone with neon engine
    const shipGroup = new THREE.Group();
    const bodyGeom = new THREE.ConeGeometry(0.4, 1.4, 6);
    bodyGeom.rotateX(-Math.PI / 2);
    const bodyMat = neonMat(0x22d3ee, 0.9);
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    shipGroup.add(body);
    const wingGeom = new THREE.BoxGeometry(1.2, 0.08, 0.4);
    const wing = new THREE.Mesh(wingGeom, bodyMat);
    wing.position.z = 0.2;
    shipGroup.add(wing);
    const engine = new THREE.PointLight(0xec4899, 2, 4);
    engine.position.z = 0.5;
    shipGroup.add(engine);
    scene.add(shipGroup);
    sceneHolder.current = { scene, ship: shipGroup };

    camera.position.set(0, 1.5, 5);

    let raf = 0;
    const asteroidGeom = new THREE.IcosahedronGeometry(0.6, 0);
    const asteroidMat = new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xec4899, emissiveIntensity: 0.6, roughness: 0.6, flatShading: true });

    const tick = (t: number) => {
      const st = sRef.current;
      const dt = st.last ? Math.min(48, t - st.last) : 16;
      st.last = t;

      if (!over) {
        const accel = 0.04;
        if (st.keys["a"] || st.keys["arrowleft"]) st.target.x -= accel;
        if (st.keys["d"] || st.keys["arrowright"]) st.target.x += accel;
        if (st.keys["w"] || st.keys["arrowup"]) st.target.y += accel;
        if (st.keys["s"] || st.keys["arrowdown"]) st.target.y -= accel;
        st.target.x = Math.max(-4, Math.min(4, st.target.x));
        st.target.y = Math.max(-2.5, Math.min(2.5, st.target.y));
        st.ship.lerp(st.target, 0.18);
        shipGroup.position.copy(st.ship);
        shipGroup.rotation.z = -(st.target.x - st.ship.x) * 0.4;
        shipGroup.rotation.x = (st.target.y - st.ship.y) * 0.4;
        st.fireCool = Math.max(0, st.fireCool - 1);

        // bullets
        for (let i = st.bullets.length - 1; i >= 0; i--) {
          const b = st.bullets[i];
          b.mesh.position.add(b.v);
          if (b.mesh.position.z < -30) { scene.remove(b.mesh); st.bullets.splice(i, 1); }
        }
        // spawn asteroids
        if (t > st.spawnAt) {
          const m = new THREE.Mesh(asteroidGeom, asteroidMat);
          m.position.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 5, -25);
          (m as any).rotV = { x: Math.random() * 0.04, y: Math.random() * 0.04 };
          scene.add(m);
          st.asteroids.push({ mesh: m, v: new THREE.Vector3(0, 0, 0.12 + Math.random() * 0.06) });
          st.spawnAt = t + Math.max(280, 700 - score * 4);
        }
        // move asteroids
        for (let i = st.asteroids.length - 1; i >= 0; i--) {
          const a = st.asteroids[i];
          a.mesh.position.add(a.v);
          a.mesh.rotation.x += (a.mesh as any).rotV?.x ?? 0.02;
          a.mesh.rotation.y += (a.mesh as any).rotV?.y ?? 0.02;
          if (a.mesh.position.z > 6) { scene.remove(a.mesh); st.asteroids.splice(i, 1); continue; }
          // collide ship
          if (a.mesh.position.distanceTo(st.ship) < 0.9) {
            setOver(true);
            const ok = setHighScore("galaxy-shooter", score); if (ok) setBest(score);
            updateStats("galaxy-shooter", { plays: 1, losses: 1, bestScore: score });
            play("lose"); vibrate(180);
            break;
          }
          // collide bullets
          for (let j = st.bullets.length - 1; j >= 0; j--) {
            const b = st.bullets[j];
            if (a.mesh.position.distanceTo(b.mesh.position) < 0.8) {
              scene.remove(a.mesh); scene.remove(b.mesh);
              st.asteroids.splice(i, 1); st.bullets.splice(j, 1);
              setScore((s) => s + 100);
              play("zap"); vibrate(20);
              break;
            }
          }
        }
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); dispose(); };
  }, [over, score, play, vibrate]);

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)}>
      <canvas ref={canvasRef} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,800px)] aspect-[800/520]" />
      <div className="mt-3 flex justify-center gap-3 sm:hidden">
        <button onPointerDown={() => (sRef.current.keys["a"] = true)} onPointerUp={() => (sRef.current.keys["a"] = false)} className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-2xl">◀</button>
        <button onPointerDown={() => (sRef.current.keys["d"] = true)} onPointerUp={() => (sRef.current.keys["d"] = false)} className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-2xl">▶</button>
        <button onPointerDown={() => (sRef.current.keys["w"] = true)} onPointerUp={() => (sRef.current.keys["w"] = false)} className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-2xl">▲</button>
        <button onPointerDown={() => (sRef.current.keys["s"] = true)} onPointerUp={() => (sRef.current.keys["s"] = false)} className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-2xl">▼</button>
        <button onPointerDown={fire} className="w-16 h-14 rounded-xl bg-neon-pink/20 border-2 border-neon-pink/50 text-neon-pink font-bold">FIRE</button>
      </div>
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>WASD / arrows to fly. Space to fire.</li>
          <li>Pink asteroids = +100. Dodge or destroy.</li>
          <li>Spawn rate ramps with score.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
