"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { useSwipe } from "@/lib/useTouchControls";
import { makeScene, addStarfield, neonMat } from "@/lib/three-helpers";
import { cn } from "@/lib/cn";

const LANES = 5;
const LANE_WIDTH = 1.2;

export default function CubeRunner3D() {
  const game = getGame("cube-runner-3d")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [speedMode, setSpeedMode] = useState<"chill" | "normal" | "extreme">("normal");
  const { play, vibrate } = useSound();

  const stateRef = useRef({
    targetLane: 2,
    currentLane: 2,
    obstacles: [] as { mesh: THREE.Mesh; lane: number; kind: "block" | "coin" }[],
    speed: 0.18,
    spawnZ: -60,
    nextSpawn: 0,
    timeAlive: 0,
    last: 0,
    over: false,
    coinsCollected: 0,
    bestScoreLocal: 0,
  });

  // Sync React over → ref so the long-lived loop reads it
  useEffect(() => { stateRef.current.over = over; }, [over]);
  useEffect(() => { stateRef.current.coinsCollected = coins; }, [coins]);

  useEffect(() => { pushRecent("cube-runner-3d"); setBest(getHighScore("cube-runner-3d")); }, []);

  const reset = useCallback(() => {
    stateRef.current.targetLane = 2;
    stateRef.current.currentLane = 2;
    stateRef.current.obstacles.forEach((o) => o.mesh.parent?.remove(o.mesh));
    stateRef.current.obstacles = [];
    stateRef.current.speed = 0.18;
    stateRef.current.nextSpawn = 0;
    stateRef.current.timeAlive = 0;
    setScore(0); setCoins(0); setOver(false);
  }, []);

  const move = (dir: -1 | 1) => {
    stateRef.current.targetLane = Math.max(0, Math.min(LANES - 1, stateRef.current.targetLane + dir));
    play("tick"); vibrate(8);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") { e.preventDefault(); move(-1); }
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") { e.preventDefault(); move(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line

  useSwipe(wrapRef, (d) => { if (d === "left") move(-1); if (d === "right") move(1); });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { renderer, scene, camera, dispose } = makeScene(canvas, {
      bgColor: 0x05050d,
      fog: { color: 0x05050d, near: 12, far: 50 },
    });
    addStarfield(scene, 400);

    camera.position.set(0, 3, 4);
    camera.lookAt(0, 1, -10);

    // Floor grid
    const grid = new THREE.GridHelper(40, 40, 0xb14aed, 0x22d3ee);
    (grid.material as THREE.Material).opacity = 0.45;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Player cube
    const playerGeom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const playerMat = neonMat(0x22d3ee, 1.2);
    const player = new THREE.Mesh(playerGeom, playerMat);
    player.position.set(0, 0.5, 0);
    player.castShadow = true;
    scene.add(player);

    // Trailing light
    const trail = new THREE.PointLight(0x22d3ee, 2, 6);
    trail.position.set(0, 1, 0.5);
    scene.add(trail);

    let raf = 0;
    const blockGeom = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const coinGeom = new THREE.TorusGeometry(0.4, 0.12, 8, 16);
    const blockMat = neonMat(0xec4899, 1.0);
    const coinMat = neonMat(0xfde047, 1.4);

    const tick = (t: number) => {
      const st = stateRef.current;
      const dt = st.last ? Math.min(48, t - st.last) : 16;
      st.last = t;

      if (!st.over) {
        st.timeAlive += dt;
        const speedMul = speedMode === "chill" ? 0.7 : speedMode === "extreme" ? 1.6 : 1.0;
        st.speed = Math.min(0.55, (0.18 + st.timeAlive * 0.00002) * speedMul);

        // smooth lane
        st.currentLane += (st.targetLane - st.currentLane) * 0.22;
        const targetX = (st.currentLane - (LANES - 1) / 2) * LANE_WIDTH;
        player.position.x = targetX;
        // bobbing
        player.position.y = 0.5 + Math.sin(t / 130) * 0.06;
        player.rotation.x += 0.04;
        player.rotation.z += 0.02;
        trail.position.x = targetX;
        grid.position.z = (t * st.speed * 0.05) % 2;

        // Spawn obstacles
        if (t > st.nextSpawn) {
          const safeLane = Math.floor(Math.random() * LANES);
          for (let l = 0; l < LANES; l++) {
            if (l === safeLane) {
              if (Math.random() < 0.5) {
                const m = new THREE.Mesh(coinGeom, coinMat);
                m.position.set((l - (LANES - 1) / 2) * LANE_WIDTH, 0.5, st.spawnZ);
                m.rotation.x = Math.PI / 2;
                scene.add(m);
                st.obstacles.push({ mesh: m, lane: l, kind: "coin" });
              }
            } else if (Math.random() < 0.7) {
              const m = new THREE.Mesh(blockGeom, blockMat);
              m.position.set((l - (LANES - 1) / 2) * LANE_WIDTH, 0.5, st.spawnZ);
              m.castShadow = true;
              scene.add(m);
              st.obstacles.push({ mesh: m, lane: l, kind: "block" });
            }
          }
          st.nextSpawn = t + Math.max(380, 900 - st.timeAlive * 0.05);
        }

        // Move obstacles
        for (let i = st.obstacles.length - 1; i >= 0; i--) {
          const o = st.obstacles[i];
          o.mesh.position.z += st.speed * dt * 0.6;
          if (o.kind === "coin") o.mesh.rotation.z += 0.08;
          if (o.mesh.position.z > 1) {
            scene.remove(o.mesh);
            st.obstacles.splice(i, 1);
            continue;
          }
          // collision when in player z range and same lane
          if (o.mesh.position.z > -0.6 && o.mesh.position.z < 0.6 && Math.round(st.currentLane) === o.lane) {
            if (o.kind === "block") {
              setOver(true);
              const finalScore = Math.floor(st.timeAlive / 100) + st.coinsCollected * 10;
              const ok = setHighScore("cube-runner-3d", finalScore); if (ok) setBest(finalScore);
              updateStats("cube-runner-3d", { plays: 1, losses: 1, bestScore: finalScore });
              play("lose"); vibrate(180);
              break;
            } else {
              scene.remove(o.mesh);
              st.obstacles.splice(i, 1);
              setCoins((c) => c + 1);
              play("ding"); vibrate(15);
            }
          }
        }

        // score by time
        setScore((prev) => Math.max(prev, Math.floor(st.timeAlive / 100)));
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); dispose(); };
  }, []); // scene initialized once; loop reads stateRef.current.over

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)} onOpenSettings={() => setShowSettings(true)} rightExtra={<span className="text-xs text-neon-yellow">× {coins} · {speedMode}</span>}>
      <div ref={wrapRef} className="no-scroll">
        <canvas ref={canvasRef} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,800px)] aspect-[800/520]" />
      </div>
      <div className="mt-3 flex justify-center gap-4 sm:hidden">
        <button onPointerDown={() => move(-1)} className="w-20 h-14 rounded-xl bg-white/10 border border-white/20 text-2xl">◀</button>
        <button onPointerDown={() => move(1)} className="w-20 h-14 rounded-xl bg-white/10 border border-white/20 text-2xl">▶</button>
      </div>
      <GameOverModal open={over} onClose={() => setOver(false)} score={score + coins * 10} best={best} isNewBest={score + coins * 10 === best && best > 0} extra={<div className="text-xs text-white/60">Coins: {coins} · Time: {Math.floor((score / 10))}s</div>} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Swipe / A D / ← → to switch lanes (5 lanes).</li>
          <li>Pink cubes kill you. Yellow rings give coins (+10 score each).</li>
          <li>Speed ramps up over time.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Speed mode" footer={<button onClick={() => { setShowSettings(false); reset(); }} className="btn-primary w-full justify-center">Restart</button>}>
        <div className="grid grid-cols-3 gap-2">
          {(["chill", "normal", "extreme"] as const).map((m) => (
            <button key={m} onClick={() => setSpeedMode(m)} className={cn("px-3 py-2 rounded-lg border text-sm capitalize", speedMode === m ? "bg-neon-cyan/20 border-neon-cyan/50" : "bg-white/5 border-white/10")}>
              {m}
            </button>
          ))}
        </div>
      </Modal>
    </GameShell>
  );
}
