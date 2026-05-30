"use client";

import { useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { DPad } from "@/components/TouchPad";
import { useIsTouch } from "@/lib/useTouchControls";
import { unlock } from "@/lib/achievements";
import { cn } from "@/lib/cn";

const COLS = 10, ROWS = 20;
const CELL = 28;
const W = COLS * CELL, H = ROWS * CELL;

type PieceKey = "I" | "O" | "T" | "S" | "Z" | "L" | "J";
const COLORS: Record<PieceKey, string> = {
  I: "#22d3ee",
  O: "#fde047",
  T: "#a855f7",
  S: "#22ee9c",
  Z: "#ef4444",
  L: "#f59e0b",
  J: "#3b82f6",
};

// Standard rotation states (SRS-ish; using simple rotation matrices)
const SHAPES: Record<PieceKey, number[][][]> = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
  ],
  T: [
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,1],[0,1,0]],
    [[0,1,0],[1,1,0],[0,1,0]],
  ],
  S: [
    [[0,1,1],[1,1,0],[0,0,0]],
    [[0,1,0],[0,1,1],[0,0,1]],
    [[0,0,0],[0,1,1],[1,1,0]],
    [[1,0,0],[1,1,0],[0,1,0]],
  ],
  Z: [
    [[1,1,0],[0,1,1],[0,0,0]],
    [[0,0,1],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,0],[0,1,1]],
    [[0,1,0],[1,1,0],[1,0,0]],
  ],
  L: [
    [[0,0,1],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,0],[0,1,1]],
    [[0,0,0],[1,1,1],[1,0,0]],
    [[1,1,0],[0,1,0],[0,1,0]],
  ],
  J: [
    [[1,0,0],[1,1,1],[0,0,0]],
    [[0,1,1],[0,1,0],[0,1,0]],
    [[0,0,0],[1,1,1],[0,0,1]],
    [[0,1,0],[0,1,0],[1,1,0]],
  ],
};

type Active = { kind: PieceKey; rot: number; x: number; y: number };
type Board = (PieceKey | null)[][];

const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

function bag(): PieceKey[] {
  const ks: PieceKey[] = ["I","O","T","S","Z","L","J"];
  for (let i = ks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ks[i], ks[j]] = [ks[j], ks[i]];
  }
  return ks;
}

function collides(board: Board, p: Active): boolean {
  const sh = SHAPES[p.kind][p.rot];
  for (let r = 0; r < sh.length; r++)
    for (let c = 0; c < sh[r].length; c++) {
      if (!sh[r][c]) continue;
      const x = p.x + c, y = p.y + r;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true;
    }
  return false;
}

function merge(board: Board, p: Active): Board {
  const nb = board.map((r) => r.slice());
  const sh = SHAPES[p.kind][p.rot];
  for (let r = 0; r < sh.length; r++)
    for (let c = 0; c < sh[r].length; c++) {
      if (!sh[r][c]) continue;
      const x = p.x + c, y = p.y + r;
      if (y >= 0) nb[y][x] = p.kind;
    }
  return nb;
}

function clearLines(b: Board): { board: Board; cleared: number } {
  let cleared = 0;
  const kept = b.filter((row) => {
    if (row.every((c) => c)) { cleared++; return false; }
    return true;
  });
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(null));
  return { board: kept, cleared };
}

function spawn(kind: PieceKey): Active {
  return { kind, rot: 0, x: kind === "O" ? 4 : 3, y: kind === "I" ? -1 : 0 };
}

export default function TetrisGame() {
  const game = getGame("tetris")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sideRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const [mode, setMode] = useState<"marathon" | "sprint" | "ultra">("marathon");
  const [showSettings, setShowSettings] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [modeDone, setModeDone] = useState(false);
  const { play, vibrate } = useSound();
  const touch = useIsTouch();

  const s = useRef<{
    board: Board; queue: PieceKey[]; active: Active; hold: PieceKey | null; usedHold: boolean;
    dropAcc: number; last: number; combo: number;
  }>({
    board: emptyBoard(),
    queue: [],
    active: spawn("I"),
    hold: null,
    usedHold: false,
    dropAcc: 0,
    last: performance.now(),
    combo: -1,
  });

  const fillQueue = () => { while (s.current.queue.length < 7) s.current.queue.push(...bag()); };

  const reset = () => {
    s.current.board = emptyBoard();
    s.current.queue = [];
    fillQueue();
    s.current.active = spawn(s.current.queue.shift()!);
    s.current.hold = null;
    s.current.usedHold = false;
    s.current.dropAcc = 0;
    s.current.combo = -1;
    setScore(0);
    setLines(0);
    setLevel(1);
    setElapsed(0);
    setModeDone(false);
    setOver(false);
    setPaused(false);
  };

  useEffect(() => {
    pushRecent("tetris");
    setBest(getHighScore("tetris"));
    fillQueue();
    s.current.active = spawn(s.current.queue.shift()!);
  }, []); // eslint-disable-line

  // Mode timer
  useEffect(() => {
    if (over || paused || modeDone) return;
    const id = setInterval(() => setElapsed((e) => {
      const ne = e + 100;
      if (mode === "ultra" && ne >= 120000 && !modeDone) {
        setModeDone(true); setOver(true);
        setHighScore("tetris", score, "ultra-score");
        play("win");
      }
      return ne;
    }), 100);
    return () => clearInterval(id);
  }, [over, paused, modeDone, mode, score, play]);

  const tryMove = (dx: number, dy: number) => {
    const np = { ...s.current.active, x: s.current.active.x + dx, y: s.current.active.y + dy };
    if (!collides(s.current.board, np)) { s.current.active = np; return true; }
    return false;
  };
  const tryRotate = (dir: 1 | -1) => {
    const rot = (s.current.active.rot + (dir === 1 ? 1 : 3)) % 4;
    const np = { ...s.current.active, rot };
    // wall kicks: try -1, +1, -2, +2 x offsets
    for (const k of [0, -1, 1, -2, 2]) {
      const cand = { ...np, x: np.x + k };
      if (!collides(s.current.board, cand)) { s.current.active = cand; return true; }
    }
    return false;
  };
  const hardDrop = () => {
    let drops = 0;
    while (tryMove(0, 1)) drops++;
    lockPiece();
    setScore((sc) => sc + drops * 2);
  };
  const holdSwap = () => {
    if (s.current.usedHold) return;
    s.current.usedHold = true;
    const cur = s.current.active.kind;
    if (s.current.hold) {
      s.current.active = spawn(s.current.hold);
      s.current.hold = cur;
    } else {
      s.current.hold = cur;
      s.current.active = spawn(s.current.queue.shift()!);
      fillQueue();
    }
    play("click");
  };

  const lockPiece = () => {
    const merged = merge(s.current.board, s.current.active);
    const { board, cleared } = clearLines(merged);
    s.current.board = board;
    if (cleared > 0) {
      const pts = [0, 100, 300, 500, 800][cleared] * level;
      setScore((sc) => sc + pts);
      setLines((ln) => {
        const nl = ln + cleared;
        const lvl = Math.floor(nl / 10) + 1;
        if (lvl !== level) setLevel(lvl);
        // Sprint: finish at 40 lines
        if (mode === "sprint" && nl >= 40 && !modeDone) {
          setModeDone(true);
          setOver(true);
          unlock("tetris-sprint");
          const prev = getHighScore("tetris", "sprint-time");
          if (prev === 0 || elapsed < prev) setHighScore("tetris", elapsed, "sprint-time");
          play("win");
        }
        return nl;
      });
      unlock("tetris-first-line");
      if (cleared >= 4) unlock("tetris-tetris");
      s.current.combo++;
      play(cleared >= 4 ? "win" : "ding");
      vibrate(cleared >= 4 ? [40, 30, 40, 30, 40] : 25);
    } else {
      s.current.combo = -1;
      play("thud");
      vibrate(15);
    }
    s.current.active = spawn(s.current.queue.shift()!);
    fillQueue();
    s.current.usedHold = false;
    if (collides(s.current.board, s.current.active)) {
      setOver(true);
      const ok = setHighScore("tetris", score);
      if (ok) setBest(score);
      updateStats("tetris", { plays: 1, losses: 1, bestScore: score });
      play("lose");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (over) return;
      const k = e.key.toLowerCase();
      if (paused && k !== "p" && k !== " ") return;
      if (k === "arrowleft" || k === "a") { e.preventDefault(); tryMove(-1, 0); }
      else if (k === "arrowright" || k === "d") { e.preventDefault(); tryMove(1, 0); }
      else if (k === "arrowdown" || k === "s") { e.preventDefault(); if (tryMove(0, 1)) setScore((sc) => sc + 1); }
      else if (k === "arrowup" || k === "x") { e.preventDefault(); tryRotate(1); }
      else if (k === "z") tryRotate(-1);
      else if (k === " ") { e.preventDefault(); hardDrop(); }
      else if (k === "c" || k === "shift") holdSwap();
      else if (k === "p") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, over]); // eslint-disable-line

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current, side = sideRef.current;
      if (!c || !side) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last);
      s.current.last = t;
      const dropInterval = Math.max(50, 800 - (level - 1) * 60);
      if (!paused && !over && !modeDone) {
        s.current.dropAcc += dt;
        if (s.current.dropAcc >= dropInterval) {
          s.current.dropAcc = 0;
          if (!tryMove(0, 1)) lockPiece();
        }
      }
      // render board
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, 0, W, H);
      // grid
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      for (let i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke(); }
      for (let j = 1; j < ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(W, j * CELL); ctx.stroke(); }
      // settled
      for (let r = 0; r < ROWS; r++) for (let c2 = 0; c2 < COLS; c2++) {
        const v = s.current.board[r][c2];
        if (v) drawCell(ctx, c2 * CELL, r * CELL, COLORS[v]);
      }
      // ghost
      const ghost = { ...s.current.active };
      while (!collides(s.current.board, { ...ghost, y: ghost.y + 1 })) ghost.y++;
      drawShape(ctx, ghost, COLORS[ghost.kind], 0.18);
      // active
      drawShape(ctx, s.current.active, COLORS[s.current.active.kind], 1);

      // side panel: next + hold
      const sctx = side.getContext("2d")!;
      sctx.fillStyle = "#0a0a14";
      sctx.fillRect(0, 0, side.width, side.height);
      sctx.fillStyle = "rgba(255,255,255,0.7)";
      sctx.font = "bold 14px Inter";
      sctx.fillText("HOLD", 12, 20);
      if (s.current.hold) drawMini(sctx, s.current.hold, 10, 30);
      sctx.fillText("NEXT", 12, 130);
      s.current.queue.slice(0, 5).forEach((k, i) => drawMini(sctx, k, 10, 140 + i * 75));

      if (paused) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "white";
        ctx.font = "bold 24px 'Press Start 2P'";
        ctx.textAlign = "center";
        ctx.fillText("PAUSED", W / 2, H / 2);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level, paused, over, modeDone]);

  function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x + 2, y + 2, CELL - 4, 4);
    ctx.restore();
  }
  function drawShape(ctx: CanvasRenderingContext2D, p: Active, color: string, alpha = 1) {
    const sh = SHAPES[p.kind][p.rot];
    for (let r = 0; r < sh.length; r++)
      for (let c = 0; c < sh[r].length; c++) {
        if (!sh[r][c]) continue;
        drawCell(ctx, (p.x + c) * CELL, (p.y + r) * CELL, color, alpha);
      }
  }
  function drawMini(ctx: CanvasRenderingContext2D, k: PieceKey, x: number, y: number) {
    const sh = SHAPES[k][0];
    const cs = 14;
    for (let r = 0; r < sh.length; r++)
      for (let c = 0; c < sh[r].length; c++) {
        if (!sh[r][c]) continue;
        ctx.fillStyle = COLORS[k];
        ctx.shadowColor = COLORS[k];
        ctx.shadowBlur = 6;
        ctx.fillRect(x + c * cs, y + r * cs, cs - 1, cs - 1);
      }
    ctx.shadowBlur = 0;
  }

  return (
    <GameShell
      game={game}
      score={score}
      best={best}
      paused={paused}
      onTogglePause={() => setPaused((p) => !p)}
      onRestart={reset}
      onOpenHowTo={() => setShowHow(true)}
      onOpenSettings={() => setShowSettings(true)}
      rightExtra={
        <div className="hidden md:flex gap-1 text-xs">
          <span className="px-2 py-1 rounded bg-white/5 capitalize">{mode}</span>
          <span className="px-2 py-1 rounded bg-white/5">Lvl {level}</span>
          <span className="px-2 py-1 rounded bg-white/5">Lines {lines}{mode === "sprint" ? "/40" : ""}</span>
          {(mode === "sprint" || mode === "ultra") && (
            <span className="px-2 py-1 rounded bg-white/5 tabular-nums">⏱ {Math.floor(elapsed / 1000)}.{Math.floor((elapsed % 1000) / 100)}s</span>
          )}
        </div>
      }
    >
      <div className="flex gap-3 items-start">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-2xl border border-white/10 shadow-neon bg-bg-soft w-auto h-[min(80vh,560px)]"
          style={{ aspectRatio: `${W}/${H}` }}
        />
        <canvas
          ref={sideRef}
          width={110}
          height={H}
          className="rounded-2xl border border-white/10 bg-bg-soft hidden sm:block h-[min(80vh,560px)]"
        />
      </div>
      {touch && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <DPad
            onPress={(d) => {
              if (d === "left") tryMove(-1, 0);
              if (d === "right") tryMove(1, 0);
              if (d === "down") tryMove(0, 1);
              if (d === "up") tryRotate(1);
            }}
          />
          <div className="flex flex-col gap-2">
            <button onPointerDown={(e) => { e.preventDefault(); hardDrop(); }} className="px-4 py-3 rounded-xl bg-neon-cyan/20 border border-neon-cyan/40 text-neon-cyan font-bold">DROP</button>
            <button onPointerDown={(e) => { e.preventDefault(); holdSwap(); }} className="px-4 py-3 rounded-xl bg-white/10 border border-white/20">HOLD</button>
          </div>
        </div>
      )}

      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        title={mode === "sprint" && modeDone ? "Sprint cleared!" : mode === "ultra" && modeDone ? "Time's up!" : "Game Over"}
        score={mode === "sprint" && modeDone ? `${(elapsed / 1000).toFixed(2)}s` : score}
        best={best}
        isNewBest={score === best && score > 0}
        onRestart={reset}
        extra={<div className="text-xs text-white/60">Level {level} · Lines {lines} · Mode: {mode}</div>}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>← → move · ↓ soft drop · ↑ / X rotate CW · Z rotate CCW · Space hard drop · C / Shift hold</li>
          <li>P to pause.</li>
          <li>Clear 1/2/3/4 lines for 100/300/500/800 × level. Tetris (4) = jackpot.</li>
          <li><b>Marathon</b>: endless. <b>Sprint</b>: clear 40 lines as fast as possible. <b>Ultra</b>: max score in 2 minutes.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Mode" footer={<button onClick={() => { setShowSettings(false); reset(); }} className="btn-primary w-full justify-center">Apply & restart</button>}>
        <div className="grid grid-cols-3 gap-2">
          {(["marathon","sprint","ultra"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn("px-3 py-2 rounded-lg border text-sm capitalize",
                mode === m ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}
            >
              {m}
              <div className="text-[10px] text-white/50">{m === "sprint" ? "40 lines" : m === "ultra" ? "2 minutes" : "endless"}</div>
            </button>
          ))}
        </div>
      </Modal>
    </GameShell>
  );
}
