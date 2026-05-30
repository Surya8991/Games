"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, storage, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { Layers } from "lucide-react";
import { cn } from "@/lib/cn";

const W = 480, H = 640;
const R = 18;
const COLORS = ["#ec4899", "#22d3ee", "#fde047", "#22ee9c", "#a855f7"];
const COLS = Math.floor(W / (R * 2));
const TOTAL_LEVELS = 20;
type Bubble = { gx: number; gy: number; color: number; alive: boolean } | null;
type Flying = { x: number; y: number; vx: number; vy: number; color: number };

function levelDef(lvl: number) {
  // rows of bubbles, color palette size, shots allowed
  const rows = Math.min(12, 5 + Math.floor(lvl / 2));
  const colorCount = Math.min(5, 3 + Math.floor(lvl / 5));
  const shots = Math.max(18, 36 - lvl);
  return { rows, colorCount, shots };
}

function gridX(gx: number, gy: number) {
  return gx * R * 2 + (gy % 2 === 1 ? R : 0) + R;
}
function gridY(gy: number) {
  return gy * (R * 2 - 4) + R + 20;
}

function neighbors(gx: number, gy: number): [number, number][] {
  const odd = gy % 2 === 1;
  return [
    [gx - 1, gy], [gx + 1, gy],
    [gx + (odd ? 0 : -1), gy - 1], [gx + (odd ? 1 : 0), gy - 1],
    [gx + (odd ? 0 : -1), gy + 1], [gx + (odd ? 1 : 0), gy + 1],
  ];
}

export default function BubbleShooterGame() {
  const game = getGame("bubble-shooter")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [level, setLevel] = useState(1);
  const [unlocked, setUnlocked] = useState(1);
  const [showHow, setShowHow] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const { play, vibrate } = useSound();

  const s = useRef({
    grid: [] as Bubble[][],
    rows: 12,
    angle: -Math.PI / 2,
    nextColor: 0,
    flying: null as Flying | null,
    mouseX: W / 2,
    mouseY: H - 60,
    isPointing: false,
    shotsLeft: 30,
  });

  const initGrid = (lvl = level) => {
    const { rows: startRows, colorCount } = levelDef(lvl);
    const g: Bubble[][] = [];
    for (let r = 0; r < startRows; r++) {
      const row: Bubble[] = [];
      const cols = r % 2 === 1 ? COLS - 1 : COLS;
      for (let c = 0; c < cols; c++) {
        row.push({ gx: c, gy: r, color: Math.floor(Math.random() * colorCount), alive: true });
      }
      g.push(row);
    }
    return g;
  };

  const pickNext = (grid: Bubble[][]): number => {
    const colors = new Set<number>();
    for (const row of grid) for (const b of row) if (b?.alive) colors.add(b.color);
    if (!colors.size) return Math.floor(Math.random() * COLORS.length);
    const arr = Array.from(colors);
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const reset = useCallback((lvl = level) => {
    s.current.grid = initGrid(lvl);
    s.current.nextColor = pickNext(s.current.grid);
    s.current.flying = null;
    s.current.shotsLeft = levelDef(lvl).shots;
    setLevel(lvl);
    setScore(0); setOver(false); setWon(false);
    setBest(getHighScore("bubble-shooter", `lvl-${lvl}`));
  }, [level]); // eslint-disable-line

  useEffect(() => {
    pushRecent("bubble-shooter");
    setUnlocked(storage.get<number>("bubble-shooter:unlocked", 1));
    reset(1);
  }, []); // eslint-disable-line

  // Pointer
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const upd = (clientX: number, clientY: number) => {
      const rect = c.getBoundingClientRect();
      s.current.mouseX = ((clientX - rect.left) / rect.width) * W;
      s.current.mouseY = ((clientY - rect.top) / rect.height) * H;
    };
    const mm = (e: MouseEvent) => upd(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => { if (e.touches[0]) upd(e.touches[0].clientX, e.touches[0].clientY); };
    c.addEventListener("mousemove", mm);
    c.addEventListener("touchmove", tm, { passive: true });
    c.addEventListener("click", shoot);
    c.addEventListener("touchstart", (e) => { tm(e); });
    c.addEventListener("touchend", (e) => { shoot(); });
    return () => {
      c.removeEventListener("mousemove", mm);
      c.removeEventListener("touchmove", tm);
      c.removeEventListener("click", shoot);
    };
    // eslint-disable-next-line
  }, []);

  const shoot = () => {
    if (s.current.flying || over) return;
    const cx = W / 2, cy = H - 30;
    const dx = s.current.mouseX - cx, dy = s.current.mouseY - cy;
    const angle = Math.atan2(dy, dx);
    if (angle >= -0.1) return; // can't shoot down
    const speed = 14;
    s.current.flying = { x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: s.current.nextColor };
    s.current.nextColor = pickNext(s.current.grid);
    play("blip"); vibrate(8);
  };

  function findCluster(grid: Bubble[][], startGx: number, startGy: number, sameColor = true): [number, number][] {
    const target = grid[startGy]?.[startGx];
    if (!target?.alive) return [];
    const seen = new Set<string>([`${startGx},${startGy}`]);
    const cluster: [number, number][] = [[startGx, startGy]];
    const stack: [number, number][] = [[startGx, startGy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [nx, ny] of neighbors(x, y)) {
        if (seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        const nb = grid[ny]?.[nx];
        if (!nb?.alive) continue;
        if (sameColor && nb.color !== target.color) continue;
        cluster.push([nx, ny]);
        stack.push([nx, ny]);
      }
    }
    return cluster;
  }

  function detachFloating(grid: Bubble[][]): [number, number][] {
    const seen = new Set<string>();
    const stack: [number, number][] = [];
    for (let c = 0; c < (grid[0]?.length ?? 0); c++) {
      if (grid[0]?.[c]?.alive) { stack.push([c, 0]); seen.add(`${c},0`); }
    }
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [nx, ny] of neighbors(x, y)) {
        if (seen.has(`${nx},${ny}`)) continue;
        if (grid[ny]?.[nx]?.alive) { seen.add(`${nx},${ny}`); stack.push([nx, ny]); }
      }
    }
    const floating: [number, number][] = [];
    for (let y = 0; y < grid.length; y++) for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
      if (grid[y][x]?.alive && !seen.has(`${x},${y}`)) floating.push([x, y]);
    }
    return floating;
  }

  function snapToGrid(x: number, y: number, color: number, grid: Bubble[][]) {
    // find closest grid spot near this point that's adjacent to existing or top
    let bestGx = 0, bestGy = 0, bestD = Infinity;
    const maxRow = Math.max(grid.length, Math.ceil((y - 20) / (R * 2 - 4)) + 1);
    for (let gy = 0; gy <= maxRow; gy++) {
      const cols = gy % 2 === 1 ? COLS - 1 : COLS;
      for (let gx = 0; gx < cols; gx++) {
        if (grid[gy]?.[gx]?.alive) continue;
        const gxC = gridX(gx, gy), gyC = gridY(gy);
        const d = (gxC - x) ** 2 + (gyC - y) ** 2;
        if (d < bestD) { bestD = d; bestGx = gx; bestGy = gy; }
      }
    }
    while (grid.length <= bestGy) {
      const cols = grid.length % 2 === 1 ? COLS - 1 : COLS;
      grid.push(Array.from({ length: cols }, () => null));
    }
    grid[bestGy][bestGx] = { gx: bestGx, gy: bestGy, color, alive: true };
    return { gx: bestGx, gy: bestGy };
  }

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current; if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const st = s.current;
      // angle to mouse
      st.angle = Math.atan2(st.mouseY - (H - 30), st.mouseX - W / 2);

      // move flying
      if (st.flying && !over) {
        st.flying.x += st.flying.vx;
        st.flying.y += st.flying.vy;
        if (st.flying.x < R) { st.flying.x = R; st.flying.vx *= -1; }
        if (st.flying.x > W - R) { st.flying.x = W - R; st.flying.vx *= -1; }
        // collide with existing or top
        let collided = false;
        if (st.flying.y < R + 4) collided = true;
        for (const row of st.grid) for (const b of row) {
          if (!b?.alive) continue;
          const bx = gridX(b.gx, b.gy), by = gridY(b.gy);
          const dx = st.flying.x - bx, dy = st.flying.y - by;
          if (dx * dx + dy * dy < (R * 2 - 4) * (R * 2 - 4)) { collided = true; break; }
          if (collided) break;
        }
        if (collided) {
          const { gx, gy } = snapToGrid(st.flying.x, st.flying.y, st.flying.color, st.grid);
          const cluster = findCluster(st.grid, gx, gy);
          if (cluster.length >= 3) {
            for (const [x, y] of cluster) st.grid[y][x] = null;
            const floating = detachFloating(st.grid);
            for (const [x, y] of floating) st.grid[y][x] = null;
            const gained = cluster.length * 10 + floating.length * 20;
            setScore((sc) => sc + gained);
            play("pop"); vibrate(20);
          } else { play("thud"); }
          st.flying = null;
          st.shotsLeft--;
          // win?
          const alive = st.grid.flat().some((b) => b?.alive);
          if (!alive) {
            setOver(true); setWon(true);
            play("win"); vibrate([40, 30, 60]);
            updateStats("bubble-shooter", { plays: 1, wins: 1, bestScore: score });
            const ok = setHighScore("bubble-shooter", score, `lvl-${level}`); if (ok) setBest(score);
            const next = level + 1;
            if (next > unlocked && next <= TOTAL_LEVELS) { setUnlocked(next); storage.set("bubble-shooter:unlocked", next); }
          }
          if (st.shotsLeft <= 0 && alive) {
            setOver(true); play("lose"); vibrate(150);
            const ok = setHighScore("bubble-shooter", score, `lvl-${level}`); if (ok) setBest(score);
            updateStats("bubble-shooter", { plays: 1, losses: 1 });
          }
        }
      }

      // draw
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, 0, W, H);
      // bubbles
      for (const row of st.grid) for (const b of row) {
        if (!b?.alive) continue;
        const bx = gridX(b.gx, b.gy), by = gridY(b.gy);
        ctx.fillStyle = COLORS[b.color];
        ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(bx, by, R - 1, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath(); ctx.arc(bx - 5, by - 5, 4, 0, Math.PI * 2); ctx.fill();
      }
      // shooter
      const sx = W / 2, sy = H - 30;
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(st.angle) * 80, sy + Math.sin(st.angle) * 80);
      ctx.stroke();
      // current bubble
      ctx.fillStyle = COLORS[st.nextColor]; ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // flying
      if (st.flying) {
        ctx.fillStyle = COLORS[st.flying.color]; ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(st.flying.x, st.flying.y, R, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      // HUD
      ctx.fillStyle = "white"; ctx.font = "14px Inter"; ctx.textAlign = "left";
      ctx.fillText(`Shots: ${st.shotsLeft}`, 10, 18);
      ctx.textAlign = "right";
      ctx.fillText(`Score: ${score}`, W - 10, 18);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [over, score, play, vibrate]);

  const nextLevel = () => reset(Math.min(TOTAL_LEVELS, level + 1));

  return (
    <GameShell
      game={game}
      score={score}
      best={best}
      onRestart={() => reset(level)}
      onOpenHowTo={() => setShowHow(true)}
      rightExtra={
        <button onClick={() => setShowLevels(true)} className="btn-ghost">
          <Layers size={16} /> <span className="hidden sm:inline">Lvl {level}/{TOTAL_LEVELS}</span>
        </button>
      }
    >
      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-[min(95vw,480px)] h-auto aspect-[480/640] cursor-crosshair touch-none" />
      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        title={won ? `Level ${level} cleared!` : "Out of shots"}
        score={score}
        best={best}
        isNewBest={score === best && score > 0}
        extra={
          won && level < TOTAL_LEVELS ? <button onClick={nextLevel} className="btn-primary mt-2">Next level →</button>
          : won && level >= TOTAL_LEVELS ? <div className="text-neon-yellow">🏆 ALL 20 LEVELS CLEARED!</div>
          : null
        }
        onRestart={() => reset(level)}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Aim with mouse/touch. Click/tap to shoot.</li>
          <li>Match 3+ same-color bubbles to pop them.</li>
          <li>Disconnected groups fall for bonus points.</li>
          <li>Clear the board within the shot limit to advance.</li>
          <li>20 levels — more rows, more colors, fewer shots each time.</li>
        </ul>
      </Modal>
      <Modal open={showLevels} onClose={() => setShowLevels(false)} title="Select Level">
        <div className="text-xs text-white/60 mb-2">Unlocked: {unlocked}/{TOTAL_LEVELS}</div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map((n) => {
            const locked = n > unlocked;
            return (
              <button key={n} disabled={locked} onClick={() => { reset(n); setShowLevels(false); }}
                className={cn("aspect-square rounded-xl text-lg font-bold border",
                  locked ? "bg-white/3 border-white/5 text-white/20" :
                  n === level ? "bg-neon-cyan/30 border-neon-cyan shadow-neon-cyan" :
                  "bg-white/5 border-white/10 hover:bg-neon-cyan/20")}>
                {locked ? "🔒" : n}
              </button>
            );
          })}
        </div>
      </Modal>
    </GameShell>
  );
}
