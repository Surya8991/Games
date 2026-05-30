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

const BLOCK_H = 0.4;
const BASE_W = 3;

export default function Stack3D() {
  const game = getGame("stack-3d")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const sRef = useRef({
    stack: [] as { mesh: THREE.Mesh; x: number; z: number; w: number; d: number }[],
    moving: null as null | { mesh: THREE.Mesh; axis: "x" | "z"; speed: number; w: number; d: number },
    falling: [] as THREE.Mesh[],
    color: 200,
    last: 0,
    cameraY: 0,
    over: false,
  });
  useEffect(() => { sRef.current.over = over; }, [over]);

  useEffect(() => { pushRecent("stack-3d"); setBest(getHighScore("stack-3d")); }, []);

  const reset = useCallback((sceneRef: { current: THREE.Scene | null }) => {
    const scene = sceneRef.current; if (!scene) return;
    [...sRef.current.stack, ...sRef.current.falling].forEach((b) => {
      const mesh = (b as any).mesh ?? b;
      if (mesh.parent) mesh.parent.remove(mesh);
    });
    sRef.current.stack = [];
    sRef.current.falling = [];
    sRef.current.moving = null;
    sRef.current.color = 200;
    sRef.current.cameraY = 0;
    // base block
    const baseGeom = new THREE.BoxGeometry(BASE_W, BLOCK_H, BASE_W);
    const baseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(200/360, 0.7, 0.55), emissive: new THREE.Color().setHSL(200/360, 0.7, 0.25), roughness: 0.4 });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.set(0, BLOCK_H / 2, 0);
    base.castShadow = true; base.receiveShadow = true;
    scene.add(base);
    sRef.current.stack.push({ mesh: base, x: 0, z: 0, w: BASE_W, d: BASE_W });
    setScore(0); setOver(false);
    spawnMoving(scene);
  }, []);

  const spawnMoving = (scene: THREE.Scene) => {
    const top = sRef.current.stack[sRef.current.stack.length - 1];
    sRef.current.color = (sRef.current.color + 12) % 360;
    const axis: "x" | "z" = sRef.current.stack.length % 2 === 0 ? "x" : "z";
    const geom = new THREE.BoxGeometry(top.w, BLOCK_H, top.d);
    const col = new THREE.Color().setHSL(sRef.current.color / 360, 0.75, 0.6);
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.6), roughness: 0.35 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const startSide = Math.random() < 0.5 ? -1 : 1;
    const y = top.mesh.position.y + BLOCK_H;
    if (axis === "x") mesh.position.set(startSide * 5, y, top.z);
    else mesh.position.set(top.x, y, startSide * 5);
    scene.add(mesh);
    sRef.current.moving = { mesh, axis, speed: -startSide * Math.min(0.18, 0.06 + sRef.current.stack.length * 0.003), w: top.w, d: top.d };
  };

  const drop = (scene: THREE.Scene) => {
    const st = sRef.current;
    const mv = st.moving;
    if (!mv || st.over) return; // read over from ref (always fresh)
    const top = st.stack[st.stack.length - 1];
    const pos = mv.axis === "x" ? mv.mesh.position.x : mv.mesh.position.z;
    const topPos = mv.axis === "x" ? top.x : top.z;
    const sizeMv = mv.axis === "x" ? mv.w : mv.d;
    const sizeTop = mv.axis === "x" ? top.w : top.d;
    const left = Math.max(pos - sizeMv / 2, topPos - sizeTop / 2);
    const right = Math.min(pos + sizeMv / 2, topPos + sizeTop / 2);
    const overlap = right - left;
    if (overlap <= 0) {
      // miss — game over, drop tower
      let finalScore = 0;
      setScore((sc) => { finalScore = sc; return sc; });
      setOver(true);
      st.over = true;
      st.falling.push(mv.mesh);
      const ok = setHighScore("stack-3d", finalScore); if (ok) setBest(finalScore);
      updateStats("stack-3d", { plays: 1, losses: 1, bestScore: finalScore });
      play("lose"); vibrate(150);
      st.moving = null;
      return;
    }
    // shrink to overlap
    const center = (left + right) / 2;
    const newW = mv.axis === "x" ? overlap : mv.w;
    const newD = mv.axis === "z" ? overlap : mv.d;
    const newGeom = new THREE.BoxGeometry(newW, BLOCK_H, newD);
    mv.mesh.geometry.dispose();
    mv.mesh.geometry = newGeom;
    if (mv.axis === "x") mv.mesh.position.x = center;
    else mv.mesh.position.z = center;
    st.stack.push({ mesh: mv.mesh, x: mv.mesh.position.x, z: mv.mesh.position.z, w: newW, d: newD });
    // sliced piece falls
    if (Math.abs(pos - topPos) > 0.02) {
      const slicedSize = sizeMv - overlap;
      if (slicedSize > 0.04) {
        const sliceGeom = new THREE.BoxGeometry(mv.axis === "x" ? slicedSize : newW, BLOCK_H, mv.axis === "z" ? slicedSize : newD);
        const sliceMesh = new THREE.Mesh(sliceGeom, mv.mesh.material as THREE.Material);
        const slicePos = pos > topPos ? right + slicedSize / 2 : left - slicedSize / 2;
        if (mv.axis === "x") sliceMesh.position.set(slicePos, mv.mesh.position.y, mv.mesh.position.z);
        else sliceMesh.position.set(mv.mesh.position.x, mv.mesh.position.y, slicePos);
        sliceMesh.castShadow = true;
        scene.add(sliceMesh);
        st.falling.push(sliceMesh);
      }
    }
    setScore((s) => s + 1);
    play(Math.abs(pos - topPos) < 0.05 ? "ding" : "pop"); vibrate(15);
    spawnMoving(scene);
  };

  // Click / Space / Tap to drop
  const sceneHolder = useRef<{ current: THREE.Scene | null }>({ current: null });

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { renderer, scene, camera, dispose } = makeScene(canvas, {
      bgColor: 0x070716,
      fog: { color: 0x070716, near: 8, far: 30 },
    });
    addStarfield(scene, 300);
    sceneHolder.current.current = scene;

    // ground reflective plane
    const groundGeom = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x0a0a18, roughness: 0.7, metalness: 0.4 });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    camera.position.set(5, 4, 5);
    camera.lookAt(0, 1, 0);

    reset(sceneHolder.current);

    let raf = 0;
    const tick = (t: number) => {
      const st = sRef.current;
      const dt = st.last ? Math.min(48, t - st.last) : 16;
      st.last = t;

      // move moving block
      if (st.moving && !st.over) {
        const m = st.moving;
        if (m.axis === "x") {
          m.mesh.position.x += m.speed * (dt / 16);
          if (m.mesh.position.x > 5 || m.mesh.position.x < -5) m.speed *= -1;
        } else {
          m.mesh.position.z += m.speed * (dt / 16);
          if (m.mesh.position.z > 5 || m.mesh.position.z < -5) m.speed *= -1;
        }
      }
      // falling pieces
      for (let i = st.falling.length - 1; i >= 0; i--) {
        const f = st.falling[i];
        (f as any).vy = ((f as any).vy ?? 0) + 0.04;
        f.position.y -= (f as any).vy;
        f.rotation.x += 0.05; f.rotation.z += 0.03;
        if (f.position.y < -20) { scene.remove(f); st.falling.splice(i, 1); }
      }
      // camera follow stack height
      const topY = (st.stack.length - 1) * BLOCK_H + 2;
      st.cameraY += (topY - st.cameraY) * 0.05;
      camera.position.y = st.cameraY + 2.5;
      camera.lookAt(0, st.cameraY, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onDrop = () => {
      if (sceneHolder.current.current) drop(sceneHolder.current.current);
    };
    canvas.addEventListener("click", onDrop);
    canvas.addEventListener("touchstart", (e) => { e.preventDefault(); onDrop(); });
    const onKey = (e: KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onDrop(); } };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("click", onDrop);
      window.removeEventListener("keydown", onKey);
      dispose();
    };
  }, []); // scene initialized once

  return (
    <GameShell game={game} score={score} best={best} onRestart={() => { if (sceneHolder.current.current) reset(sceneHolder.current); }} onOpenHowTo={() => setShowHow(true)}>
      <canvas ref={canvasRef} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(92vw,520px)] aspect-[520/640] cursor-pointer touch-none" />
      <p className="mt-2 text-xs text-white/40">Click / tap / Space to drop the block.</p>
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} onRestart={() => { if (sceneHolder.current.current) reset(sceneHolder.current); }} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>A block slides side-to-side. Tap to drop it.</li>
          <li>Anything overhanging gets sliced off — block shrinks.</li>
          <li>Real 3D camera follows the tower up.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
