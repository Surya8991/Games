"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GameShell } from "@/components/GameShell";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { pushRecent } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { makeScene } from "@/lib/three-helpers";
import { Eraser } from "lucide-react";

const PALETTE = ["#22d3ee", "#ec4899", "#fde047", "#22ee9c", "#a855f7", "#f97316", "#ef4444", "#ffffff"];

export default function VoxelBuilder() {
  const game = getGame("voxel-builder")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState(PALETTE[0]);
  const [eraser, setEraser] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [blockCount, setBlockCount] = useState(0);
  const { play, vibrate } = useSound();

  useEffect(() => { pushRecent("voxel-builder"); }, []);

  const sRef = useRef({
    voxels: new Map<string, THREE.Mesh>(),
    rotation: 0,
    targetRotation: 0,
    cameraDist: 14,
    targetDist: 14,
  });

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { renderer, scene, camera, dispose } = makeScene(canvas, { bgColor: 0x05071a, fog: { color: 0x05071a, near: 18, far: 50 } });

    // base plane
    const baseGeom = new THREE.PlaneGeometry(20, 20);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x0a0a18, roughness: 0.8 });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.rotation.x = -Math.PI / 2;
    base.receiveShadow = true;
    scene.add(base);
    // grid
    const grid = new THREE.GridHelper(20, 20, 0xb14aed, 0x222244);
    (grid.material as THREE.Material).opacity = 0.5;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // ghost block (preview)
    const ghostGeom = new THREE.BoxGeometry(1, 1, 1);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, wireframe: true });
    const ghost = new THREE.Mesh(ghostGeom, ghostMat);
    ghost.visible = false;
    scene.add(ghost);

    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const updateHover = (clientX: number, clientY: number): { intersect: THREE.Intersection | null; isVoxel: boolean } => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const voxelMeshes = Array.from(sRef.current.voxels.values());
      const hitsVoxel = raycaster.intersectObjects(voxelMeshes);
      if (hitsVoxel.length > 0) return { intersect: hitsVoxel[0], isVoxel: true };
      const hitsBase = raycaster.intersectObject(base);
      if (hitsBase.length > 0) return { intersect: hitsBase[0], isVoxel: false };
      return { intersect: null, isVoxel: false };
    };

    const place = () => {
      ghost.visible = false;
      const { intersect, isVoxel } = updateHover(lastPointer.x, lastPointer.y);
      if (!intersect) return;
      if (eraser) {
        if (isVoxel) {
          const mesh = intersect.object as THREE.Mesh;
          const key = `${Math.round(mesh.position.x)},${Math.round(mesh.position.y)},${Math.round(mesh.position.z)}`;
          sRef.current.voxels.delete(key);
          scene.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
          setBlockCount(sRef.current.voxels.size);
          play("thud"); vibrate(20);
        }
        return;
      }
      // determine new voxel position
      let nx: number, ny: number, nz: number;
      if (isVoxel) {
        const normal = intersect.face!.normal.clone().applyMatrix4(new THREE.Matrix4().extractRotation(intersect.object.matrixWorld));
        const p = intersect.object.position;
        nx = Math.round(p.x + normal.x);
        ny = Math.round(p.y + normal.y);
        nz = Math.round(p.z + normal.z);
      } else {
        nx = Math.round(intersect.point.x);
        ny = 0;
        nz = Math.round(intersect.point.z);
      }
      if (Math.abs(nx) > 10 || Math.abs(nz) > 10 || ny < 0 || ny > 15) return;
      const key = `${nx},${ny},${nz}`;
      if (sRef.current.voxels.has(key)) return;
      const g = new THREE.BoxGeometry(1, 1, 1);
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const cube = new THREE.Mesh(g, m);
      cube.position.set(nx, ny + 0.5, nz);
      cube.castShadow = true; cube.receiveShadow = true;
      scene.add(cube);
      sRef.current.voxels.set(key, cube);
      setBlockCount(sRef.current.voxels.size);
      play("pop"); vibrate(8);
    };

    const lastPointer = { x: 0, y: 0 };

    const onPointerMove = (e: PointerEvent) => {
      lastPointer.x = e.clientX; lastPointer.y = e.clientY;
      const { intersect, isVoxel } = updateHover(e.clientX, e.clientY);
      if (intersect && !eraser) {
        let nx: number, ny: number, nz: number;
        if (isVoxel) {
          const normal = intersect.face!.normal.clone().applyMatrix4(new THREE.Matrix4().extractRotation(intersect.object.matrixWorld));
          const p = intersect.object.position;
          nx = Math.round(p.x + normal.x);
          ny = Math.round(p.y + normal.y);
          nz = Math.round(p.z + normal.z);
        } else {
          nx = Math.round(intersect.point.x);
          ny = 0;
          nz = Math.round(intersect.point.z);
        }
        if (Math.abs(nx) <= 10 && Math.abs(nz) <= 10 && ny >= 0 && ny <= 15) {
          ghost.position.set(nx, ny + 0.5, nz);
          ghost.visible = true;
        } else ghost.visible = false;
      } else { ghost.visible = false; }
    };

    let isDragging = false;
    let startDrag = { x: 0, y: 0, rotation: 0 };
    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      startDrag = { x: e.clientX, y: e.clientY, rotation: sRef.current.targetRotation };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (isDragging) {
        const dx = e.clientX - startDrag.x;
        const dy = e.clientY - startDrag.y;
        if (Math.hypot(dx, dy) < 5) {
          // click — place/remove
          place();
        }
      }
      isDragging = false;
    };
    const onDrag = (e: PointerEvent) => {
      if (isDragging) {
        const dx = e.clientX - startDrag.x;
        sRef.current.targetRotation = startDrag.rotation + dx * 0.01;
      }
    };
    canvas.addEventListener("pointermove", (e) => { onPointerMove(e); onDrag(e); });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", () => { isDragging = false; ghost.visible = false; });

    // wheel zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sRef.current.targetDist = Math.max(6, Math.min(24, sRef.current.targetDist + e.deltaY * 0.01));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0;
    const tick = () => {
      sRef.current.rotation += (sRef.current.targetRotation - sRef.current.rotation) * 0.15;
      sRef.current.cameraDist += (sRef.current.targetDist - sRef.current.cameraDist) * 0.1;
      const r = sRef.current.cameraDist;
      camera.position.x = Math.sin(sRef.current.rotation) * r;
      camera.position.z = Math.cos(sRef.current.rotation) * r;
      camera.position.y = r * 0.7;
      camera.lookAt(0, 1, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("wheel", onWheel);
      dispose();
    };
  }, [color, eraser, play, vibrate]);

  return (
    <GameShell game={game} score={`${blockCount} blocks`} onOpenHowTo={() => setShowHow(true)} rightExtra={<button onClick={() => setEraser((e) => !e)} className={"btn-ghost " + (eraser ? "text-neon-pink" : "")}><Eraser size={16} /></button>}>
      <div ref={wrapRef} className="no-scroll">
        <canvas ref={canvasRef} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,800px)] aspect-[800/520] cursor-crosshair touch-none" />
      </div>
      <div className="mt-4 flex gap-2 flex-wrap justify-center">
        {PALETTE.map((c) => (
          <button key={c} onClick={() => { setColor(c); setEraser(false); }} className={"w-10 h-10 rounded-lg border-2 " + (color === c && !eraser ? "ring-2 ring-neon-cyan scale-110" : "border-white/10")} style={{ background: c }} />
        ))}
        <button onClick={() => setEraser(true)} className={"w-10 h-10 rounded-lg border-2 grid place-items-center " + (eraser ? "ring-2 ring-neon-pink scale-110" : "border-white/10 bg-bg-card")}>
          <Eraser size={16} />
        </button>
      </div>
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Click an empty spot to place a block.</li>
          <li>Click a block face to add the next block on that side.</li>
          <li>Toggle the eraser to remove blocks instead.</li>
          <li>Drag with mouse/finger to rotate. Mouse wheel to zoom.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
