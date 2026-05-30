"use client";

import { useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { unlock } from "@/lib/achievements";
import { DPad } from "@/components/TouchPad";
import { useIsTouch, useSwipe } from "@/lib/useTouchControls";

// 21x21 maze. 1=wall, 0=dot, 2=power, 3=empty (no pellet)
// Ghost house is the empty box in the middle (rows 9-11, cols 8-12).
const MAZE_RAW = [
  "111111111111111111111",
  "120000000010000000021",
  "101110110010110111101",
  "100000000000000000001",
  "101011010101010110101",
  "100010000010000010001",
  "111010111111111010111",
  "300010000000000010003",
  "111010111333111010111",
  "300000013333310000003",
  "111010111333111010111",
  "300010000000000010003",
  "111010111111111010111",
  "100000010000010000001",
  "101110010111010111101",
  "120000000010000000021",
  "101010111111111010101",
  "100010000010000010001",
  "100000000010000000001",
  "111111111111111111111",
  "333333333333333333333",
];
const COLS = MAZE_RAW[0].length;
const ROWS = MAZE_RAW.length;
const CELL = 24;
const W = COLS * CELL, H = ROWS * CELL;

type Cell = 0 | 1 | 2 | 3 | 9; // 9=eaten
type Dir = [number, number];
const DIRS: Record<string, Dir> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

type Actor = { x: number; y: number; dir: Dir; nextDir: Dir; speed: number };
type Ghost = Actor & { name: "blinky" | "pinky" | "inky" | "clyde"; color: string; mode: "scatter" | "chase" | "frightened" | "eaten"; spawn: { x: number; y: number } };

function buildMaze(): Cell[][] {
  return MAZE_RAW.map((row) => row.split("").map((c) => parseInt(c, 10) as Cell));
}
function isWall(maze: Cell[][], gx: number, gy: number) {
  if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return true;
  return maze[gy][gx] === 1;
}
function gridOf(a: Actor) { return { gx: Math.round(a.x / CELL), gy: Math.round(a.y / CELL) }; }

export default function PacManGame() {
  const game = getGame("pacman")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();
  const touch = useIsTouch();

  const s = useRef({
    maze: buildMaze(),
    pac: { x: 10 * CELL, y: 15 * CELL, dir: [0, 0] as Dir, nextDir: [0, 0] as Dir, speed: 1.6 } as Actor,
    ghosts: [] as Ghost[],
    last: performance.now(),
    frightenedUntil: 0,
    chaseUntil: 0,
    dotsLeft: 0,
    eatChain: 0,
  });

  const initGhosts = (): Ghost[] => {
    const cx = 10 * CELL, cy = 9 * CELL;
    return [
      { name: "blinky", color: "#ef4444", x: cx, y: cy, dir: [-1, 0], nextDir: [-1, 0], speed: 1.4, mode: "scatter", spawn: { x: cx, y: cy } },
      { name: "pinky", color: "#ec4899", x: cx, y: cy + CELL, dir: [-1, 0], nextDir: [-1, 0], speed: 1.4, mode: "scatter", spawn: { x: cx, y: cy + CELL } },
      { name: "inky", color: "#22d3ee", x: cx - CELL, y: cy + CELL, dir: [-1, 0], nextDir: [-1, 0], speed: 1.3, mode: "scatter", spawn: { x: cx - CELL, y: cy + CELL } },
      { name: "clyde", color: "#fde047", x: cx + CELL, y: cy + CELL, dir: [1, 0], nextDir: [1, 0], speed: 1.3, mode: "scatter", spawn: { x: cx + CELL, y: cy + CELL } },
    ];
  };

  const reset = (preserveScore = false) => {
    s.current.maze = buildMaze();
    s.current.dotsLeft = s.current.maze.flat().filter((c) => c === 0 || c === 2).length;
    s.current.pac = { x: 10 * CELL, y: 15 * CELL, dir: [0, 0], nextDir: [0, 0], speed: 1.6 };
    s.current.ghosts = initGhosts();
    s.current.frightenedUntil = 0;
    s.current.chaseUntil = performance.now() + 7000;
    s.current.eatChain = 0;
    if (!preserveScore) { setScore(0); setLives(3); setLevel(1); setOver(false); }
  };

  useEffect(() => { pushRecent("pacman"); setBest(getHighScore("pacman")); reset(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") s.current.pac.nextDir = DIRS.left;
      else if (k === "arrowright" || k === "d") s.current.pac.nextDir = DIRS.right;
      else if (k === "arrowup" || k === "w") s.current.pac.nextDir = DIRS.up;
      else if (k === "arrowdown" || k === "x" || k === "s") s.current.pac.nextDir = DIRS.down;
      else if (k === " " || k === "p") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useSwipe(wrapRef, (d) => {
    if (d === "left") s.current.pac.nextDir = DIRS.left;
    if (d === "right") s.current.pac.nextDir = DIRS.right;
    if (d === "up") s.current.pac.nextDir = DIRS.up;
    if (d === "down") s.current.pac.nextDir = DIRS.down;
  });

  // Ghost AI targeting
  const targetFor = (g: Ghost, pac: Actor, blinky: Actor): { x: number; y: number } => {
    const { gx: pgx, gy: pgy } = gridOf(pac);
    const pdir = pac.dir;
    if (g.mode === "scatter") {
      // corners
      if (g.name === "blinky") return { x: COLS - 2, y: 1 };
      if (g.name === "pinky") return { x: 1, y: 1 };
      if (g.name === "inky") return { x: COLS - 2, y: ROWS - 5 };
      return { x: 1, y: ROWS - 5 };
    }
    if (g.mode === "frightened") {
      return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    }
    if (g.mode === "eaten") return { x: 10, y: 9 };
    // chase
    if (g.name === "blinky") return { x: pgx, y: pgy };
    if (g.name === "pinky") return { x: pgx + pdir[0] * 4, y: pgy + pdir[1] * 4 };
    if (g.name === "inky") {
      const bx = Math.round(blinky.x / CELL), by = Math.round(blinky.y / CELL);
      const px = pgx + pdir[0] * 2, py = pgy + pdir[1] * 2;
      return { x: px + (px - bx), y: py + (py - by) };
    }
    // clyde: chase if far, scatter if close
    const dx = pgx - Math.round(g.x / CELL), dy = pgy - Math.round(g.y / CELL);
    if (dx * dx + dy * dy > 64) return { x: pgx, y: pgy };
    return { x: 1, y: ROWS - 5 };
  };

  // Move actor one step (tile-aligned turning)
  const stepActor = (a: Actor, maze: Cell[][], allowReverse: boolean, target?: { x: number; y: number }) => {
    const { gx, gy } = gridOf(a);
    const atGrid = Math.abs(a.x - gx * CELL) < 1 && Math.abs(a.y - gy * CELL) < 1;
    if (atGrid) {
      a.x = gx * CELL; a.y = gy * CELL;
      // ghost: decide direction at intersection
      if (target) {
        const opts: Dir[] = [];
        const allDirs: Dir[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const d of allDirs) {
          if (!allowReverse && d[0] === -a.dir[0] && d[1] === -a.dir[1]) continue;
          if (!isWall(maze, gx + d[0], gy + d[1])) opts.push(d);
        }
        if (opts.length) {
          let bestD = opts[0]; let bestDist = Infinity;
          for (const d of opts) {
            const nx = gx + d[0], ny = gy + d[1];
            const dist = (nx - target.x) ** 2 + (ny - target.y) ** 2;
            if (dist < bestDist) { bestDist = dist; bestD = d; }
          }
          a.dir = bestD;
        }
      } else {
        // pac: apply nextDir if not blocked
        const nd = a.nextDir;
        if ((nd[0] || nd[1]) && !isWall(maze, gx + nd[0], gy + nd[1])) a.dir = nd;
        if (isWall(maze, gx + a.dir[0], gy + a.dir[1])) a.dir = [0, 0];
      }
    }
    a.x += a.dir[0] * a.speed;
    a.y += a.dir[1] * a.speed;
    // tunnels (left-right wrap on middle row)
    if (a.x < -CELL) a.x = W;
    if (a.x > W) a.x = -CELL;
  };

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current;
      if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last); s.current.last = t;
      const st = s.current;
      if (!paused && !over) {
        // mode switching
        if (t > st.frightenedUntil) {
          // toggle scatter/chase
          const phase = t % 27000;
          const mode = phase < 7000 || (phase > 14000 && phase < 21000) ? "scatter" : "chase";
          for (const g of st.ghosts) if (g.mode !== "frightened" && g.mode !== "eaten") g.mode = mode;
        }
        // pac
        stepActor(st.pac, st.maze, true);
        const pg = gridOf(st.pac);
        const cell = st.maze[pg.gy]?.[pg.gx];
        if (cell === 0) { st.maze[pg.gy][pg.gx] = 9 as Cell; setScore((sc) => sc + 10); st.dotsLeft--; play("tick"); }
        else if (cell === 2) {
          st.maze[pg.gy][pg.gx] = 9 as Cell;
          setScore((sc) => sc + 50); st.dotsLeft--;
          st.frightenedUntil = t + 7000;
          st.eatChain = 0;
          for (const g of st.ghosts) if (g.mode !== "eaten") { g.mode = "frightened"; g.dir = [-g.dir[0], -g.dir[1]] as Dir; }
          play("ding");
        }
        const blinky = st.ghosts.find((g) => g.name === "blinky")!;
        // ghosts
        for (const g of st.ghosts) {
          g.speed = g.mode === "frightened" ? 0.9 : g.mode === "eaten" ? 2.4 : 1.4 + level * 0.05;
          const target = targetFor(g, st.pac, blinky);
          stepActor(g, st.maze, false, target);
          // catch player
          const dx = g.x - st.pac.x, dy = g.y - st.pac.y;
          if (dx * dx + dy * dy < (CELL * 0.7) ** 2) {
            if (g.mode === "frightened") {
              g.mode = "eaten";
              st.eatChain++;
              setScore((sc) => sc + 200 * (1 << (st.eatChain - 1)));
              play("ding"); vibrate(40);
            } else if (g.mode !== "eaten") {
              let isOver = false;
              setLives((l) => {
                const n = l - 1;
                if (n <= 0) isOver = true;
                return Math.max(0, n);
              });
              if (isOver) {
                setOver(true);
                const ok = setHighScore("pacman", score); if (ok) setBest(score);
                updateStats("pacman", { plays: 1, losses: 1, bestScore: score });
                play("lose"); vibrate(200);
                return; // stop ghost iteration this frame
              } else {
                st.pac.x = 10 * CELL; st.pac.y = 15 * CELL; st.pac.dir = [0, 0]; st.pac.nextDir = [0, 0];
                st.ghosts = initGhosts();
                play("thud"); vibrate(120);
                break; // restart ghost loop with reset positions
              }
            }
          }
          // eaten ghost reaches spawn
          if (g.mode === "eaten") {
            const gg = gridOf(g);
            if (gg.gx === 10 && gg.gy === 9) g.mode = "chase";
          }
        }
        // level cleared
        if (st.dotsLeft === 0) {
          setLevel((l) => {
            const nl = l + 1;
            if (nl >= 3) unlock("pacman-lvl-3");
            return nl;
          });
          reset(true);
        }
      }
      // render
      ctx.fillStyle = "#0a0a14"; ctx.fillRect(0, 0, W, H);
      // maze
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const v = st.maze[y][x];
        if (v === 1) {
          ctx.fillStyle = "#1d4ed8";
          ctx.shadowColor = "#3b82f6"; ctx.shadowBlur = 8;
          ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
        } else if (v === 0) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#fde047";
          ctx.beginPath(); ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 2.5, 0, Math.PI * 2); ctx.fill();
        } else if (v === 2) {
          ctx.shadowBlur = 8; ctx.shadowColor = "#fde047";
          ctx.fillStyle = "#fde047";
          ctx.beginPath(); ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
      // pac
      const pa = Math.sin(t / 80) * 0.4 + 0.5; // mouth open amount
      const angle = st.pac.dir[0] === -1 ? Math.PI : st.pac.dir[1] === -1 ? -Math.PI / 2 : st.pac.dir[1] === 1 ? Math.PI / 2 : 0;
      ctx.save(); ctx.translate(st.pac.x + CELL / 2, st.pac.y + CELL / 2); ctx.rotate(angle);
      ctx.fillStyle = "#fde047"; ctx.shadowColor = "#fde047"; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, CELL / 2 - 2, pa * 0.6, Math.PI * 2 - pa * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // ghosts
      for (const g of st.ghosts) {
        const cx = g.x + CELL / 2, cy = g.y + CELL / 2;
        ctx.fillStyle = g.mode === "frightened" ? "#3b82f6" : g.mode === "eaten" ? "rgba(255,255,255,0.3)" : g.color;
        ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx, cy - 2, CELL / 2 - 3, Math.PI, 0);
        ctx.lineTo(cx + CELL / 2 - 3, cy + CELL / 2 - 4);
        for (let i = 0; i < 3; i++) ctx.lineTo(cx + CELL / 2 - 3 - (i * 2 + 2) * (CELL - 6) / 12, cy + CELL / 2 - 8 + (i % 2 ? 4 : 0));
        ctx.lineTo(cx - CELL / 2 + 3, cy + CELL / 2 - 4);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "white"; ctx.beginPath();
        ctx.arc(cx - 4, cy - 2, 3, 0, Math.PI * 2);
        ctx.arc(cx + 4, cy - 2, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "black"; ctx.beginPath();
        ctx.arc(cx - 4 + g.dir[0] * 1.5, cy - 2 + g.dir[1] * 1.5, 1.5, 0, Math.PI * 2);
        ctx.arc(cx + 4 + g.dir[0] * 1.5, cy - 2 + g.dir[1] * 1.5, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      // hud
      ctx.fillStyle = "white"; ctx.font = "14px Inter"; ctx.textAlign = "left";
      ctx.fillText(`Lives: ${"●".repeat(lives)}  Lvl ${level}`, 8, H - 6);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, level, lives, score, play, vibrate]);

  return (
    <GameShell
      game={game} score={score} best={best} paused={paused}
      onTogglePause={() => setPaused((p) => !p)} onRestart={() => reset()}
      onOpenHowTo={() => setShowHow(true)}
    >
      <div ref={wrapRef} className="no-scroll">
        <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(96vw,560px)] h-auto" style={{ aspectRatio: `${W}/${H}` }} />
      </div>
      {touch && (
        <div className="mt-6 flex justify-center">
          <DPad onPress={(d) => { if (d === "up") s.current.pac.nextDir = DIRS.up; if (d === "down") s.current.pac.nextDir = DIRS.down; if (d === "left") s.current.pac.nextDir = DIRS.left; if (d === "right") s.current.pac.nextDir = DIRS.right; }} />
        </div>
      )}
      <GameOverModal open={over} onClose={() => setOver(false)} score={score} best={best} isNewBest={score === best && score > 0} onRestart={() => reset()} extra={<div className="text-xs text-white/60">Level {level}</div>} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Eat all the dots while dodging four ghosts.</li>
          <li>Power pellets turn ghosts blue — eat them for big points.</li>
          <li>Ghost personalities: Blinky chases directly, Pinky aims ahead of you, Inky uses Blinky's position, Clyde alternates chase/scatter.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
