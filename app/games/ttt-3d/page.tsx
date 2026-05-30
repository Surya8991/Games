"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { pushRecent, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { makeScene, addStarfield } from "@/lib/three-helpers";
import { cn } from "@/lib/cn";

// 4x4x4 = 64 cells. Player = 1, AI = 2.
const N = 4;
type Cell = 0 | 1 | 2;

function idx(x: number, y: number, z: number) { return x * N * N + y * N + z; }
function fromIdx(i: number) { return [Math.floor(i / (N * N)), Math.floor((i / N) % N), i % N]; }

// Pre-compute all winning lines
function allLines(): number[][] {
  const lines: number[][] = [];
  const dirs = [
    [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1],
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  ];
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) {
    for (const [dx, dy, dz] of dirs) {
      const ex = x + dx * (N - 1), ey = y + dy * (N - 1), ez = z + dz * (N - 1);
      if (ex < 0 || ex >= N || ey < 0 || ey >= N || ez < 0 || ez >= N) continue;
      const ln: number[] = [];
      for (let k = 0; k < N; k++) ln.push(idx(x + dx * k, y + dy * k, z + dz * k));
      lines.push(ln);
    }
  }
  return lines;
}
const LINES = allLines();

function winner(board: Cell[]): { who: Cell; line: number[] } | null {
  for (const ln of LINES) {
    const v = board[ln[0]];
    if (!v) continue;
    if (ln.every((i) => board[i] === v)) return { who: v, line: ln };
  }
  return null;
}

function aiPick(board: Cell[]): number {
  // Score each empty cell: prefer creating threats / blocking opponent
  let bestScore = -Infinity, bestCell = -1;
  for (let i = 0; i < 64; i++) {
    if (board[i]) continue;
    let s = 0;
    for (const ln of LINES) {
      if (!ln.includes(i)) continue;
      const ai = ln.filter((j) => board[j] === 2).length;
      const me = ln.filter((j) => board[j] === 1).length;
      if (ai && me) continue;
      if (ai === 3) s += 1000; // win
      if (me === 3) s += 500;  // block
      if (ai === 2) s += 30;
      if (me === 2) s += 25;
      if (ai === 1) s += 3;
      if (me === 1) s += 2;
    }
    // center bias
    const [x, y, z] = fromIdx(i);
    const center = Math.abs(x - 1.5) + Math.abs(y - 1.5) + Math.abs(z - 1.5);
    s += (6 - center) * 1.5;
    if (s > bestScore) { bestScore = s; bestCell = i; }
  }
  return bestCell;
}

export default function TTT3D() {
  const game = getGame("ttt-3d")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [board, setBoard] = useState<Cell[]>(() => Array(64).fill(0));
  const [turn, setTurn] = useState<Cell>(1);
  const [over, setOver] = useState<{ who: Cell; line: number[] } | "draw" | null>(null);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  useEffect(() => { pushRecent("ttt-3d"); }, []);

  // AI move
  useEffect(() => {
    if (over || turn !== 2) return;
    const id = setTimeout(() => {
      const next = aiPick(board);
      if (next >= 0) {
        const nb = board.slice() as Cell[];
        nb[next] = 2;
        setBoard(nb);
        play("click"); vibrate(15);
        const w = winner(nb);
        if (w) { setOver(w); play("lose"); updateStats("ttt-3d", { plays: 1, losses: 1 }); }
        else if (nb.every((v) => v)) { setOver("draw"); }
        else setTurn(1);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [turn, over, board, play, vibrate]);

  const click = (i: number) => {
    if (over || turn !== 1 || board[i]) return;
    const nb = board.slice() as Cell[];
    nb[i] = 1;
    setBoard(nb);
    play("click"); vibrate(15);
    const w = winner(nb);
    if (w) { setOver(w); play("win"); updateStats("ttt-3d", { plays: 1, wins: 1 }); }
    else if (nb.every((v) => v)) { setOver("draw"); }
    else setTurn(2);
  };

  const reset = () => { setBoard(Array(64).fill(0) as Cell[]); setTurn(1); setOver(null); };

  // 3D scene
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { renderer, scene, camera, dispose } = makeScene(canvas, { bgColor: 0x05071a });
    addStarfield(scene, 200);

    const group = new THREE.Group();
    scene.add(group);

    // Render 64 cells
    const cellMeshes: THREE.Mesh[] = [];
    const winLineIds = new Set<number>(over && typeof over === "object" ? over.line : []);
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) {
      const i = idx(x, y, z);
      const v = board[i];
      const inWin = winLineIds.has(i);
      let mesh: THREE.Mesh;
      if (v === 0) {
        const g = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const m = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.1, wireframe: true });
        mesh = new THREE.Mesh(g, m);
      } else if (v === 1) {
        const g = new THREE.SphereGeometry(0.32, 20, 14);
        const m = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: inWin ? 2 : 0.8, roughness: 0.3 });
        mesh = new THREE.Mesh(g, m);
      } else {
        const g = new THREE.TorusKnotGeometry(0.22, 0.08, 32, 6);
        const m = new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xec4899, emissiveIntensity: inWin ? 2 : 0.8, roughness: 0.3 });
        mesh = new THREE.Mesh(g, m);
      }
      mesh.position.set(x - 1.5, y - 1.5, z - 1.5);
      mesh.userData.cellIdx = i;
      group.add(mesh);
      cellMeshes.push(mesh);
    }
    // grid lines
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x - 1.5, y - 1.5, -1.5), new THREE.Vector3(x - 1.5, y - 1.5, 1.5)]);
      group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x444466, transparent: true, opacity: 0.4 })));
    }

    camera.position.set(4, 3, 5);
    camera.lookAt(0, 0, 0);

    // pointer rotate + click pick
    let isDragging = false, startX = 0, startRot = 0, hadDrag = false;
    let rotation = 0.4, targetRotation = 0.4;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    canvas.addEventListener("pointerdown", (e) => { isDragging = true; startX = e.clientX; startRot = targetRotation; hadDrag = false; });
    canvas.addEventListener("pointermove", (e) => {
      if (isDragging) {
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 5) hadDrag = true;
        targetRotation = startRot + dx * 0.01;
      }
    });
    canvas.addEventListener("pointerup", (e) => {
      isDragging = false;
      if (hadDrag) return;
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(cellMeshes);
      if (hits.length > 0) {
        const idxClicked = (hits[0].object as THREE.Mesh).userData.cellIdx as number;
        if (board[idxClicked] === 0) click(idxClicked);
      }
    });

    let raf = 0;
    const tick = () => {
      rotation += (targetRotation - rotation) * 0.15;
      group.rotation.y = rotation;
      group.rotation.x = Math.sin(rotation * 0.5) * 0.1;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); dispose(); };
  }, [board, over, click]); // eslint-disable-line

  return (
    <GameShell game={game} onRestart={reset} onOpenHowTo={() => setShowHow(true)} rightExtra={<span className="text-xs text-white/60">{over ? (over === "draw" ? "Draw" : over.who === 1 ? "You win" : "AI wins") : turn === 1 ? "Your move (cyan)" : "AI…"}</span>}>
      <canvas ref={canvasRef} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,640px)] aspect-square touch-none" />
      <p className="mt-2 text-xs text-white/40">Drag to rotate · Click an empty cell to place</p>
      <GameOverModal
        open={!!over}
        onClose={() => setOver(null)}
        title={
          over === "draw"
            ? "Draw"
            : over && typeof over === "object"
            ? (over.who === 1 ? "You win!" : "AI wins")
            : ""
        }
        onRestart={reset}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>4×4×4 cube. Get 4 in a row in any direction — including diagonals across layers.</li>
          <li>You play cyan spheres, AI plays pink torus knots.</li>
          <li>Drag the cube to see all sides before placing.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
