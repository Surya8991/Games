"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, storage, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { makeScene } from "@/lib/three-helpers";
import { Layers } from "lucide-react";
import { cn } from "@/lib/cn";

const TOTAL_LEVELS = 10;

const RAW_LEVELS: string[][] = [
  // 9 columns × 9 rows. S=start, G=goal, #=wall, .=floor, H=hole(fail), C=coin
  [
    "S........",
    "..##...##",
    "....C....",
    "##..##...",
    "...C..H..",
    ".##......",
    "..C..####",
    "....C....",
    "#######.G",
  ],
  [
    "S....C...",
    "##.#####.",
    "..C....#.",
    ".####.##.",
    ".....H...",
    "#####.#.C",
    "C....#...",
    ".###.####",
    "...C....G",
  ],
  [
    "S..#.....",
    ".C.#.###.",
    "##.#.#.#.",
    "...#.#.#.",
    "###..#.#.",
    "...#.H.#C",
    "C..#.###.",
    ".###.....",
    ".....####G".slice(0, 9),
  ],
  [
    "S..H..C..",
    "##.##.##.",
    "...C.....",
    ".####.##.",
    ".....HH..",
    "#####.##.",
    "C......C.",
    ".####.##.",
    "....HC..G",
  ],
  [
    "S.....C..",
    ".########",
    "C....H...",
    "#####..##",
    "..C.##...",
    ".####.HH.",
    ".....#...",
    "######.##",
    "C..H...CG",
  ],
];

function makeLevel(lvl: number): string[] {
  const idx = (lvl - 1) % RAW_LEVELS.length;
  const rows = RAW_LEVELS[idx];
  // Pad / verify 9-wide
  return rows.map((r) => r.padEnd(9, ".").slice(0, 9));
}

export default function MarbleMaze() {
  const game = getGame("marble-maze")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [level, setLevel] = useState(1);
  const [unlocked, setUnlocked] = useState(1);
  const [coins, setCoins] = useState(0);
  const [time, setTime] = useState(0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [running, setRunning] = useState(false);
  const [best, setBest] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const { play, vibrate } = useSound();

  const sRef = useRef({
    ball: { x: 0, y: 0.6, z: 0, vx: 0, vz: 0 } as { x: number; y: number; z: number; vx: number; vz: number },
    boardTiltX: 0, boardTiltZ: 0,
    targetTiltX: 0, targetTiltZ: 0,
    cells: [] as string[],
    last: 0,
    keys: {} as Record<string, boolean>,
    coinsLeft: 0,
  });

  useEffect(() => { pushRecent("marble-maze"); setUnlocked(storage.get<number>("marble-maze:unlocked", 1)); }, []);
  useEffect(() => { setBest(getHighScore("marble-maze", `t-${level}`)); }, [level]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const sceneHolder = useRef<{ scene: THREE.Scene; group: THREE.Group; ball: THREE.Mesh; coinMeshes: THREE.Mesh[] } | null>(null);

  const buildLevel = useCallback((lvl: number) => {
    const holder = sceneHolder.current; if (!holder) return;
    const { scene, group } = holder;
    // clear group children
    while (group.children.length > 0) {
      const c = group.children[0];
      group.remove(c);
      if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
    }
    const rows = makeLevel(lvl);
    sRef.current.cells = rows;
    let startX = 0, startZ = 0;
    const coinMeshes: THREE.Mesh[] = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const ch = rows[r][c];
      const x = (c - 4) * 1.2;
      const z = (r - 4) * 1.2;
      if (ch === "#") {
        const wallGeom = new THREE.BoxGeometry(1.2, 0.6, 1.2);
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0xa855f7, emissiveIntensity: 0.4, roughness: 0.6 });
        const m = new THREE.Mesh(wallGeom, wallMat);
        m.position.set(x, 0.3, z);
        m.castShadow = true; m.receiveShadow = true;
        group.add(m);
      } else if (ch === "H") {
        const holeGeom = new THREE.CircleGeometry(0.5, 24);
        const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const m = new THREE.Mesh(holeGeom, holeMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.01, z);
        group.add(m);
      } else if (ch === "C") {
        const cg = new THREE.SphereGeometry(0.18, 16, 12);
        const cm = new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xfde047, emissiveIntensity: 1.2 });
        const m = new THREE.Mesh(cg, cm);
        m.position.set(x, 0.4, z);
        (m as any).cell = { r, c };
        group.add(m); coinMeshes.push(m);
      } else if (ch === "G") {
        const goalGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.15, 24);
        const goalMat = new THREE.MeshStandardMaterial({ color: 0x22ee9c, emissive: 0x22ee9c, emissiveIntensity: 1.0 });
        const m = new THREE.Mesh(goalGeom, goalMat);
        m.position.set(x, 0.08, z);
        m.userData.goal = true;
        group.add(m);
        (group as any).goalX = x; (group as any).goalZ = z;
      } else if (ch === "S") {
        startX = x; startZ = z;
      }
    }
    // Floor base
    const floorGeom = new THREE.BoxGeometry(11, 0.2, 11);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x161628, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.position.y = -0.1; floor.receiveShadow = true;
    group.add(floor);
    sRef.current.ball.x = startX; sRef.current.ball.z = startZ; sRef.current.ball.y = 0.6;
    sRef.current.ball.vx = 0; sRef.current.ball.vz = 0;
    sRef.current.coinsLeft = coinMeshes.length;
    holder.coinMeshes = coinMeshes;
  }, []);

  const startLevel = useCallback((lvl: number) => {
    setLevel(lvl); setCoins(0); setTime(0); setRunning(true); setOver(false); setWon(false);
    if (sceneHolder.current) buildLevel(lvl);
  }, [buildLevel]);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => { sRef.current.keys[e.key.toLowerCase()] = true; };
    const up = (e: KeyboardEvent) => { sRef.current.keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  // device orientation for tilt
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      if (e.beta != null && e.gamma != null) {
        sRef.current.targetTiltX = Math.max(-0.4, Math.min(0.4, e.beta / 60));
        sRef.current.targetTiltZ = Math.max(-0.4, Math.min(0.4, -e.gamma / 60));
      }
    };
    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { renderer, scene, camera, dispose } = makeScene(canvas, { bgColor: 0x06061a });
    const group = new THREE.Group();
    scene.add(group);
    // ball
    const ballGeom = new THREE.SphereGeometry(0.3, 24, 16);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.85 });
    const ball = new THREE.Mesh(ballGeom, ballMat);
    ball.castShadow = true;
    scene.add(ball);
    sceneHolder.current = { scene, group, ball, coinMeshes: [] };
    buildLevel(level);

    camera.position.set(0, 9, 9);
    camera.lookAt(0, 0, 0);

    let raf = 0;
    const tick = (t: number) => {
      const dt = sRef.current.last ? Math.min(48, t - sRef.current.last) : 16;
      sRef.current.last = t;

      const st = sRef.current;
      // keyboard tilt
      let kx = 0, kz = 0;
      if (st.keys["a"] || st.keys["arrowleft"]) kx -= 0.35;
      if (st.keys["d"] || st.keys["arrowright"]) kx += 0.35;
      if (st.keys["w"] || st.keys["arrowup"]) kz -= 0.35;
      if (st.keys["s"] || st.keys["arrowdown"]) kz += 0.35;
      if (kx || kz) { st.targetTiltZ = kx; st.targetTiltX = kz; }
      else { st.targetTiltZ *= 0.7; st.targetTiltX *= 0.7; }

      st.boardTiltX += (st.targetTiltX - st.boardTiltX) * 0.15;
      st.boardTiltZ += (st.targetTiltZ - st.boardTiltZ) * 0.15;
      group.rotation.x = st.boardTiltX;
      group.rotation.z = -st.boardTiltZ;

      if (!over && running) {
        // ball physics — gravity along tilted plane
        const accel = 8;
        st.ball.vx += st.boardTiltZ * accel * (dt / 1000);
        st.ball.vz += st.boardTiltX * accel * (dt / 1000);
        st.ball.vx *= 0.985; st.ball.vz *= 0.985;
        const nx = st.ball.x + st.ball.vx * (dt / 50);
        const nz = st.ball.z + st.ball.vz * (dt / 50);

        // Collision with walls — check cell at nx,nz
        const rows = st.cells;
        const cellX = Math.round(nx / 1.2 + 4);
        const cellZ = Math.round(nz / 1.2 + 4);
        const inBounds = cellX >= 0 && cellX < 9 && cellZ >= 0 && cellZ < 9;
        const blocked = inBounds && rows[cellZ][cellX] === "#";
        if (!blocked) { st.ball.x = nx; st.ball.z = nz; }
        else { st.ball.vx *= -0.4; st.ball.vz *= -0.4; }

        // hole?
        if (inBounds && rows[cellZ][cellX] === "H") {
          setOver(true); setWon(false); setRunning(false);
          play("lose"); vibrate(150);
          updateStats("marble-maze", { plays: 1, losses: 1 });
        }
        // goal?
        const gx = (group as any).goalX, gz = (group as any).goalZ;
        if (gx !== undefined && Math.abs(st.ball.x - gx) < 0.4 && Math.abs(st.ball.z - gz) < 0.4) {
          setOver(true); setWon(true); setRunning(false);
          play("win"); vibrate([40, 30, 60]);
          const prev = getHighScore("marble-maze", `t-${level}`);
          if (prev === 0 || time < prev) { setHighScore("marble-maze", time, `t-${level}`); setBest(time); }
          const next = level + 1;
          if (next > unlocked && next <= TOTAL_LEVELS) { setUnlocked(next); storage.set("marble-maze:unlocked", next); }
          updateStats("marble-maze", { plays: 1, wins: 1 });
        }
        // coin pickup
        const holder = sceneHolder.current!;
        for (let i = holder.coinMeshes.length - 1; i >= 0; i--) {
          const cm = holder.coinMeshes[i];
          const cw = new THREE.Vector3();
          cm.getWorldPosition(cw);
          const bw = ball.position;
          const dx = bw.x - cw.x, dz = bw.z - cw.z;
          if (dx * dx + dz * dz < 0.25) {
            cm.parent?.remove(cm);
            holder.coinMeshes.splice(i, 1);
            setCoins((c) => c + 1);
            play("ding"); vibrate(10);
          }
        }
      }
      // sync ball mesh with local coordinates inside tilted group
      const localBall = new THREE.Vector3(st.ball.x, 0.3, st.ball.z);
      const worldBall = localBall.applyEuler(group.rotation).add(group.position);
      ball.position.copy(worldBall);
      ball.position.y += 0.3;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); dispose(); };
  }, [level, over, running, time, unlocked, buildLevel, play, vibrate]); // eslint-disable-line

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <GameShell game={game} score={`⏱ ${fmt(time)} · ${coins}🪙`} best={best ? fmt(best) : "—"} onRestart={() => startLevel(level)} onOpenHowTo={() => setShowHow(true)} rightExtra={<button onClick={() => setShowLevels(true)} className="btn-ghost"><Layers size={16} /> <span className="hidden sm:inline">Lvl {level}/{TOTAL_LEVELS}</span></button>}>
      <canvas ref={canvasRef} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,640px)] aspect-square" />
      <p className="mt-2 text-xs text-white/40">WASD / arrows to tilt · Tilt your phone on mobile (after granting permission)</p>
      <GameOverModal open={over} onClose={() => setOver(false)} title={won ? `Level ${level} cleared!` : "Hole!"} score={fmt(time)} extra={won && level < TOTAL_LEVELS ? <button onClick={() => startLevel(Math.min(TOTAL_LEVELS, level + 1))} className="btn-primary mt-2">Next level →</button> : null} onRestart={() => startLevel(level)} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Tilt the board to roll the marble to the green goal.</li>
          <li>Avoid black holes. Pick up yellow coins on the way.</li>
          <li>5 base levels cycled with more obstacles each lap.</li>
        </ul>
      </Modal>
      <Modal open={showLevels} onClose={() => setShowLevels(false)} title="Select Level">
        <div className="text-xs text-white/60 mb-2">Unlocked: {unlocked}/{TOTAL_LEVELS}</div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map((n) => {
            const locked = n > unlocked;
            return (
              <button key={n} disabled={locked} onClick={() => { startLevel(n); setShowLevels(false); }}
                className={cn("aspect-square rounded-xl text-lg font-bold border",
                  locked ? "bg-white/3 border-white/5 text-white/20" :
                  n === level ? "bg-neon-purple/40 border-neon-purple shadow-neon" :
                  "bg-white/5 border-white/10 hover:bg-neon-purple/20")}>
                {locked ? "🔒" : n}
              </button>
            );
          })}
        </div>
      </Modal>
    </GameShell>
  );
}
