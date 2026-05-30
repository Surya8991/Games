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

type LaneKind = "grass" | "road" | "river" | "rail";
type Lane = { kind: LaneKind; z: number; mesh: THREE.Mesh; vehicles: { mesh: THREE.Mesh; x: number; vx: number; w: number }[]; trees: number[] };

const LANE_W = 14;
const LANE_D = 1.6;

export default function CrossyHop() {
  const game = getGame("crossy-3d")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const sRef = useRef({
    chickenX: 0, chickenZ: 0,
    chickenY: 0,
    targetX: 0, targetZ: 0,
    last: 0,
    lanes: [] as Lane[],
    maxZ: 0,
    hopAnim: 0,
    over: false,
  });
  useEffect(() => { sRef.current.over = over; }, [over]);

  useEffect(() => { pushRecent("crossy-3d"); setBest(getHighScore("crossy-3d")); }, []);

  const sceneHolder = useRef<THREE.Scene | null>(null);

  const generateLane = useCallback((scene: THREE.Scene, z: number, force?: LaneKind): Lane => {
    const r = Math.random();
    const kind = force ?? (z === 0 ? "grass" : r < 0.4 ? "grass" : r < 0.75 ? "road" : r < 0.92 ? "river" : "rail");
    const colors: Record<LaneKind, number> = { grass: 0x22ee9c, road: 0x222233, river: 0x3b82f6, rail: 0x444455 };
    const geom = new THREE.BoxGeometry(LANE_W, 0.2, LANE_D);
    const mat = new THREE.MeshStandardMaterial({ color: colors[kind], roughness: 0.8 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, 0, -z * LANE_D);
    mesh.receiveShadow = true;
    scene.add(mesh);

    const vehicles: Lane["vehicles"] = [];
    const trees: number[] = [];

    if (kind === "road" || kind === "rail") {
      const count = kind === "rail" ? 1 : 1 + Math.floor(Math.random() * 3);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const speed = kind === "rail" ? 0.18 + Math.random() * 0.06 : 0.05 + Math.random() * 0.05;
      const w = kind === "rail" ? 4 : 1.2;
      for (let i = 0; i < count; i++) {
        const vg = new THREE.BoxGeometry(w, 0.8, 1.2);
        const vColor = kind === "rail" ? 0xfde047 : [0xec4899, 0x22d3ee, 0xa855f7, 0xf97316][Math.floor(Math.random() * 4)];
        const vm = new THREE.MeshStandardMaterial({ color: vColor, emissive: vColor, emissiveIntensity: 0.4 });
        const vmesh = new THREE.Mesh(vg, vm);
        vmesh.castShadow = true;
        const startX = -LANE_W / 2 + Math.random() * LANE_W;
        vmesh.position.set(startX, 0.6, -z * LANE_D);
        scene.add(vmesh);
        vehicles.push({ mesh: vmesh, x: startX, vx: dir * speed, w });
      }
      if (kind === "rail") {
        // rail tracks visual
        for (let tx = -LANE_W / 2; tx < LANE_W / 2; tx += 0.5) {
          const tg = new THREE.BoxGeometry(0.05, 0.1, LANE_D * 0.6);
          const tm = new THREE.MeshBasicMaterial({ color: 0x888888 });
          const tmesh = new THREE.Mesh(tg, tm);
          tmesh.position.set(tx, 0.15, -z * LANE_D);
          scene.add(tmesh);
        }
      }
    } else if (kind === "river") {
      // log spawns are vehicles too
      const dir = Math.random() < 0.5 ? 1 : -1;
      const speed = 0.04 + Math.random() * 0.03;
      const w = 2 + Math.random() * 2;
      for (let i = 0; i < 3; i++) {
        const vg = new THREE.BoxGeometry(w, 0.3, 1);
        const vm = new THREE.MeshStandardMaterial({ color: 0x7c4a1f, roughness: 0.9 });
        const vmesh = new THREE.Mesh(vg, vm);
        const startX = -LANE_W / 2 + (i + Math.random()) * (LANE_W / 3);
        vmesh.position.set(startX, 0.25, -z * LANE_D);
        scene.add(vmesh);
        vehicles.push({ mesh: vmesh, x: startX, vx: dir * speed, w });
      }
    } else if (kind === "grass") {
      // trees as obstacles
      const treeCount = Math.floor(Math.random() * 4);
      for (let i = 0; i < treeCount; i++) {
        const tx = Math.floor((Math.random() - 0.5) * (LANE_W / LANE_D)) * LANE_D;
        if (z === 0 && Math.abs(tx) < LANE_D) continue;
        trees.push(tx);
        const trunkGeom = new THREE.BoxGeometry(0.4, 0.6, 0.4);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7c4a1f });
        const trunk = new THREE.Mesh(trunkGeom, trunkMat);
        trunk.position.set(tx, 0.4, -z * LANE_D);
        trunk.castShadow = true;
        scene.add(trunk);
        const leafGeom = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x22ee9c, emissive: 0x22ee9c, emissiveIntensity: 0.2 });
        const leaf = new THREE.Mesh(leafGeom, leafMat);
        leaf.position.set(tx, 1.4, -z * LANE_D);
        leaf.castShadow = true;
        scene.add(leaf);
      }
    }
    return { kind, z, mesh, vehicles, trees };
  }, []);

  const hop = (dx: number, dz: number) => {
    if (over) return;
    const newX = sRef.current.targetX + dx * LANE_D;
    if (Math.abs(newX) > LANE_W / 2 - LANE_D / 2) return;
    sRef.current.targetX = newX;
    sRef.current.targetZ += dz;
    sRef.current.hopAnim = 1;
    if (dz > 0 && sRef.current.targetZ > sRef.current.maxZ) {
      sRef.current.maxZ = sRef.current.targetZ;
      setScore(sRef.current.maxZ);
    }
    play("blip"); vibrate(10);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w") { e.preventDefault(); hop(0, 1); }
      if (k === "arrowdown" || k === "s") { e.preventDefault(); hop(0, -1); }
      if (k === "arrowleft" || k === "a") { e.preventDefault(); hop(-1, 0); }
      if (k === "arrowright" || k === "d") { e.preventDefault(); hop(1, 0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { renderer, scene, camera, dispose } = makeScene(canvas, { bgColor: 0x88ccff, fog: { color: 0x88ccff, near: 18, far: 35 } });
    sceneHolder.current = scene;

    // Chicken
    const chickenGroup = new THREE.Group();
    const bodyGeom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    chickenGroup.add(body);
    const beakGeom = new THREE.ConeGeometry(0.1, 0.2, 4);
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xfde047 });
    const beak = new THREE.Mesh(beakGeom, beakMat);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, 0.1, -0.4);
    chickenGroup.add(beak);
    const combGeom = new THREE.BoxGeometry(0.2, 0.2, 0.1);
    const combMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    const comb = new THREE.Mesh(combGeom, combMat);
    comb.position.set(0, 0.4, 0);
    chickenGroup.add(comb);
    chickenGroup.position.y = 0.4;
    scene.add(chickenGroup);

    // Generate initial lanes
    for (let i = 0; i <= 14; i++) sRef.current.lanes.push(generateLane(scene, i, i === 0 ? "grass" : undefined));

    camera.position.set(0, 7, 7);
    camera.lookAt(0, 0, -3);

    let raf = 0;
    const tick = (t: number) => {
      const st = sRef.current;
      const dt = st.last ? Math.min(48, t - st.last) : 16;
      st.last = t;

      // smooth chicken to target
      st.chickenX += (st.targetX - st.chickenX) * 0.3;
      st.chickenZ += (st.targetZ - st.chickenZ) * 0.3;
      // hop animation
      st.hopAnim = Math.max(0, st.hopAnim - 0.07);
      st.chickenY = 0.4 + Math.sin(st.hopAnim * Math.PI) * 0.5;
      chickenGroup.position.set(st.chickenX, st.chickenY, -st.chickenZ * LANE_D);

      // camera follow
      const targetCamZ = -st.chickenZ * LANE_D + 5;
      camera.position.z += (targetCamZ - camera.position.z) * 0.08;
      camera.position.x += (st.chickenX * 0.5 - camera.position.x) * 0.06;
      camera.lookAt(st.chickenX, 0, -st.chickenZ * LANE_D - 2);

      // update vehicles
      for (const lane of st.lanes) {
        for (const v of lane.vehicles) {
          v.x += v.vx * (dt / 16);
          if (v.x > LANE_W / 2 + v.w) v.x = -LANE_W / 2 - v.w;
          if (v.x < -LANE_W / 2 - v.w) v.x = LANE_W / 2 + v.w;
          v.mesh.position.x = v.x;
        }
      }
      // generate ahead
      while (st.lanes[st.lanes.length - 1].z < st.chickenZ + 14) {
        const newZ = st.lanes[st.lanes.length - 1].z + 1;
        st.lanes.push(generateLane(scene, newZ));
      }
      // remove behind
      while (st.lanes.length > 0 && st.lanes[0].z < st.chickenZ - 4) {
        const old = st.lanes.shift()!;
        scene.remove(old.mesh);
        for (const v of old.vehicles) scene.remove(v.mesh);
      }
      // collision
      if (!sRef.current.over) {
        const currLane = st.lanes.find((l) => l.z === st.targetZ);
        if (currLane) {
          if (currLane.kind === "road" || currLane.kind === "rail") {
            for (const v of currLane.vehicles) {
              if (Math.abs(v.x - st.targetX) < v.w / 2 + 0.3) {
                setOver(true); sRef.current.over = true;
                const ok = setHighScore("crossy-3d", st.maxZ); if (ok) setBest(st.maxZ);
                updateStats("crossy-3d", { plays: 1, losses: 1, bestScore: st.maxZ });
                play("lose"); vibrate(180);
                break;
              }
            }
          } else if (currLane.kind === "river") {
            const onLog = currLane.vehicles.some((v) => Math.abs(v.x - st.targetX) < v.w / 2);
            if (!onLog && st.hopAnim < 0.2) {
              setOver(true);
              const ok = setHighScore("crossy-3d", st.maxZ); if (ok) setBest(st.maxZ);
              updateStats("crossy-3d", { plays: 1, losses: 1, bestScore: st.maxZ });
              play("lose"); vibrate(180);
            }
          }
          // tree check
          if (currLane.trees.some((tx) => Math.abs(tx - st.targetX) < 0.6)) {
            // step back
            sRef.current.targetX -= (sRef.current.targetX - sRef.current.chickenX) > 0 ? LANE_D : -LANE_D;
          }
        }
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // touch controls
    let tStart = { x: 0, y: 0 };
    canvas.addEventListener("touchstart", (e) => { tStart.x = e.touches[0].clientX; tStart.y = e.touches[0].clientY; }, { passive: true });
    canvas.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - tStart.x;
      const dy = e.changedTouches[0].clientY - tStart.y;
      if (Math.abs(dx) < 30 && Math.abs(dy) < 30) { hop(0, 1); return; }
      if (Math.abs(dx) > Math.abs(dy)) hop(dx > 0 ? 1 : -1, 0);
      else hop(0, dy < 0 ? 1 : -1);
    });

    return () => { cancelAnimationFrame(raf); dispose(); };
  }, []); // scene initialized once

  const reset = () => {
    const scene = sceneHolder.current;
    if (scene) {
      for (const lane of sRef.current.lanes) {
        scene.remove(lane.mesh);
        for (const v of lane.vehicles) scene.remove(v.mesh);
      }
    }
    sRef.current.lanes = [];
    sRef.current.chickenX = 0; sRef.current.chickenZ = 0;
    sRef.current.targetX = 0; sRef.current.targetZ = 0;
    sRef.current.maxZ = 0;
    setScore(0); setOver(false);
    if (scene) for (let i = 0; i <= 14; i++) sRef.current.lanes.push(generateLane(scene, i, i === 0 ? "grass" : undefined));
  };

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)}>
      <canvas ref={canvasRef} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,800px)] aspect-[800/520] touch-none" />
      <div className="mt-3 grid grid-cols-3 gap-2 w-[min(80vw,260px)] sm:hidden">
        <div></div><button onPointerDown={() => hop(0, 1)} className="h-12 rounded-xl bg-white/10 border border-white/20 text-xl">▲</button><div></div>
        <button onPointerDown={() => hop(-1, 0)} className="h-12 rounded-xl bg-white/10 border border-white/20 text-xl">◀</button>
        <button onPointerDown={() => hop(0, -1)} className="h-12 rounded-xl bg-white/10 border border-white/20 text-xl">▼</button>
        <button onPointerDown={() => hop(1, 0)} className="h-12 rounded-xl bg-white/10 border border-white/20 text-xl">▶</button>
      </div>
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>WASD / arrows or swipe / tap to hop one square.</li>
          <li>Don't get hit by cars or fall in the river (ride logs).</li>
          <li>Score = furthest row reached.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
