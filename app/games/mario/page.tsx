"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, storage, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { useIsTouch } from "@/lib/useTouchControls";
import { Layers } from "lucide-react";
import { cn } from "@/lib/cn";

const TILE = 32;
const VIEW_W = 800;
const VIEW_H = 480;

// Tile legend:
// . empty   # ground   = brick   ? question (coin)   c coin   p pipe   f flag   g goomba spawn   s spring  l lava
const LEVELS: string[][] = [
  [
    "................................................................................",
    "................................................................................",
    "................................................................................",
    "..........ccc.........?.........................................................",
    "................................................................................",
    "..........=?=...................?===?...........................................",
    "........................c.c.....................................f...............",
    ".....g..................c.c...g........g...........g............f...............",
    ".....................==========================================fff..............",
    "################################...########################################....",
    "################################...########################################....",
  ],
  [
    "................................................................................",
    "................................................................................",
    "...........cc..................?.?.?.........................f.................",
    "...........==..................================..............f.................",
    "...............................................c.c.c..........f.................",
    "...........................c.c.c.c..........................ff.................",
    "...?...?.................................p..................fff.................",
    ".................g.g................g....p..g..............ffff.................",
    "..........================.........==pp====================fffff.................",
    "###################...##############################################...########",
    "###################...##############################################...########",
  ],
  [
    "................................................................................",
    "............ccc.................................c.c.c.c.c.c.c.c................",
    "............===.................................................................",
    ".............................?..................................................",
    "..........................========...............................f...............",
    ".......c.c....g..g..............c.c...............................f...............",
    "......======.................?...===................g..g..........f...............",
    "...............................==pp=........=====..==pp===.......ff...............",
    "................llll.................llll.........................fff...........",
    "##############......################......##########################...########",
    "###################################################################################",
  ],
  [
    "................................................................................",
    ".cc.cc.cc....?.?.?...........cc.cc.cc..........?.?.?..............f..............",
    ".==.==.==....=====...........==.==.==..........=====..............f..............",
    "..........................................c.c.c..................f..............",
    "..............g..g..g.....p..p..p.................p..p..p.........ff..............",
    "............=========p===p===p===========c.c.c==p===p===p====....fff..............",
    ".........lll....................llll.......................lll..ffff..............",
    "................................................................fffff..............",
    "################...###############...###########################################",
    "###################################...################################...########",
    "###################################...################################...########",
  ],
  [
    "................................................................................",
    ".......?.?.?.................?.?.?.?.?..............ccccccccc........f..............",
    ".......=====.................===========............=========........f..............",
    "....c.c.c.c....p.p.p.p.....c.c.c..........p.p.p.p.................f..............",
    "..==========p==========p==========p==========p===============....ff..............",
    "...g..g..g.....s....g..g..g..g.....s..s...g..g..g..g.............fff..............",
    "...........................llll..................llll............ffff..............",
    "................................................................fffff..............",
    "###############...####################...###############################...####",
    "###################...################################################...########",
    "###################...################################################...########",
  ],
  // Level 6 — tall pipes
  [
    "................................................................................",
    "...c.c.c....p.....c.c..............p.................?.?.?...........f...........",
    "...======...p....=====.............p.................=====.c.c.c.....f...........",
    "............p..........c.c.c.c.....p.................................f...........",
    "...c.c..g...p.s..............s....pp..p..g...........c.c...........fff...........",
    "..======pppppp==================ppppppppp====================.....ffff...........",
    ".....g.....llll..g.g...llll..............g....g...g....llll......fffff...........",
    "................................................................ffffff...........",
    "##########....##############....################...##############...##########",
    "###################...################################################...########",
    "###################...################################################...########",
  ],
  // Level 7 — gauntlet of goombas
  [
    "................................................................................",
    "...?.?.?..............cccc...............?...................?.?.?....f.........",
    "...=====..............====...............=...................=====....f.........",
    "................p.p..............c.c.c.c..............s.s.s...........f.........",
    "..c.c..g.g.g....p.p..g.g.g.g.....=========..g.g.g.g...======...g.g....ff.........",
    "..===p======p==pppp==========p==============p========p========p======fff.........",
    "..ll....g.g.g.g...llll...g.g...lll...g.g.g.g..lll...g.g.g....llll....ffff.........",
    "................................................................fffff............",
    "###################...##############################################...########",
    "##############...####################################################...########",
    "##############...####################################################...########",
  ],
  // Level 8 — sky platforms
  [
    "................................................................................",
    "...ccc............ccc............ccc............ccc.............f.................",
    "...===............===............===............===.............f.................",
    "..............................................c.c.c.............f.................",
    "...?.?.?....===.....?...........?.....===....=======............ff.................",
    "..======...........====........====.........................gff..................",
    "...........llll.................llll..................llll..fff..................",
    "...g..g.....................g..g..............g..g..g......ffff..................",
    "##########...########...########...##############...##############...##########",
    "###################...################################################...########",
    "###################...################################################...########",
  ],
  // Level 9 — narrow gaps + lava
  [
    "................................................................................",
    "....cc..cc..cc............?.?.?..........cc..cc..cc...........?...?....f.........",
    "....==..==..==............=====..........==..==..==...........=...=....f.........",
    ".................pp.p.p..............................pp.p.p...........f.........",
    "...c.c.c....g.g..pp.p.p..g.g..s..s.s...c.c.c....g.g..pp.p.p..g.g.....ff.........",
    "..======p===p===ppppppp=======p====p=========p==p===ppppppp====p===fff.........",
    "..llll....llll.........llll....llll....llll......llll.........llll..ffff.........",
    "................................................................fffff............",
    "############...##############...##############...########################...####",
    "###############...####################################################...########",
    "###############...####################################################...########",
  ],
  // Level 10 — boss gauntlet finale
  [
    "................................................................................",
    "..?.?.?.?.?...cccccccccccc.......?.?.?.?.?.?..............cccccccc......f........",
    "..=========...============.......===========..............========......f........",
    "............................p.p.p.p.p.p.p.p..........................f........",
    "...c.c..g.g..s.s..g.g.g.g..p.p.p.p.p.p.p.p..g.g.g..s.s.s..g.g.g.g....ff........",
    "..====pppp====================ppppppppppppppp===p====p========p====fff........",
    ".....llll....g.g.g.g...llll.....g.g..llll..g.g.g..llll....g.g.g....ffff........",
    "................................................................fffff............",
    "##############...################################################...##########",
    "##################...################################################...########",
    "##################...################################################...########",
  ],
];

const TOTAL_LEVELS = LEVELS.length;

type Tile = "." | "#" | "=" | "?" | "c" | "p" | "f" | "l" | "s";
type Enemy = { x: number; y: number; vx: number; alive: boolean };
type Coin = { x: number; y: number; collected: boolean };

function parseLevel(raw: string[]) {
  const rows = raw.map((r) => r.padEnd(80, "."));
  const cols = Math.max(...rows.map((r) => r.length));
  const tiles: Tile[][] = [];
  const enemies: Enemy[] = [];
  const coins: Coin[] = [];
  for (let y = 0; y < rows.length; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < cols; x++) {
      const ch = rows[y][x] ?? ".";
      if (ch === "g") {
        enemies.push({ x: x * TILE, y: y * TILE, vx: -1.2, alive: true });
        row.push(".");
      } else if (ch === "c") {
        coins.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, collected: false });
        row.push(".");
      } else if (ch === "?") {
        coins.push({ x: x * TILE + TILE / 2, y: y * TILE - 4, collected: false });
        row.push("?");
      } else {
        row.push((ch as Tile) || ".");
      }
    }
    tiles.push(row);
  }
  return { tiles, enemies, coins, cols, rows: rows.length };
}

function isSolid(t: Tile) {
  return t === "#" || t === "=" || t === "?" || t === "p";
}

export default function MarioGame() {
  const game = getGame("mario")!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [allCleared, setAllCleared] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [coins, setCoins] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [unlockedLvl, setUnlockedLvl] = useState(1);
  const [time, setTime] = useState(300);
  const [showHow, setShowHow] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const touch = useIsTouch();
  const { play, vibrate } = useSound();

  const s = useRef<{
    level: ReturnType<typeof parseLevel>;
    x: number; y: number; vx: number; vy: number;
    onGround: boolean; facing: 1 | -1;
    keys: Record<string, boolean>;
    cameraX: number;
    last: number;
    spawnX: number; spawnY: number;
    invuln: number;
  }>({
    level: parseLevel(LEVELS[0]),
    x: 64, y: 6 * TILE, vx: 0, vy: 0,
    onGround: false, facing: 1,
    keys: {},
    cameraX: 0,
    last: performance.now(),
    spawnX: 64, spawnY: 6 * TILE,
    invuln: 0,
  });

  const initLevel = useCallback((lvl: number, freshLives = false) => {
    const lv = parseLevel(LEVELS[lvl - 1]);
    // Find a ground spawn near x=64
    let spawnY = 7 * TILE;
    for (let y = 0; y < lv.rows; y++) {
      if (isSolid(lv.tiles[y][2])) { spawnY = y * TILE - TILE; break; }
    }
    s.current = {
      level: lv,
      x: 64, y: spawnY, vx: 0, vy: 0,
      onGround: false, facing: 1,
      keys: {},
      cameraX: 0,
      last: performance.now(),
      spawnX: 64, spawnY,
      invuln: 30,
    };
    setLevel(lvl);
    setCoins(0);
    setTime(300);
    if (freshLives) { setLives(3); setScore(0); }
    setWon(false); setOver(false); setPaused(false); setAllCleared(false);
  }, []);

  useEffect(() => {
    pushRecent("mario");
    setBest(getHighScore("mario"));
    setUnlockedLvl(storage.get<number>("mario:unlocked", 1));
    initLevel(1, true);
  }, [initLevel]);

  // Timer
  useEffect(() => {
    if (paused || over) return;
    const id = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          die();
          return 300;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [paused, over]); // eslint-disable-line

  const die = useCallback(() => {
    const st = s.current;
    setLives((l) => {
      const next = l - 1;
      if (next <= 0) {
        setOver(true);
        const ok = setHighScore("mario", score); if (ok) setBest(score);
        updateStats("mario", { plays: 1, losses: 1, bestScore: score });
        play("lose"); vibrate(200);
      } else {
        st.x = st.spawnX; st.y = st.spawnY;
        st.vx = 0; st.vy = 0; st.invuln = 60;
        play("thud"); vibrate(120);
        setTime(300);
      }
      return Math.max(0, next);
    });
  }, [score, play, vibrate]);

  const jump = useCallback(() => {
    if (s.current.onGround) {
      s.current.vy = -11;
      s.current.onGround = false;
      play("blip");
      vibrate(15);
    }
  }, [play, vibrate]);

  // Input
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      s.current.keys[k] = true;
      if (k === " " || k === "arrowup" || k === "w") { e.preventDefault(); jump(); }
      if (k === "p") setPaused((p) => !p);
    };
    const up = (e: KeyboardEvent) => { s.current.keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [jump]);

  // Main loop
  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const c = canvasRef.current;
      if (!c) { raf = requestAnimationFrame(tick); return; }
      const ctx = c.getContext("2d")!;
      const dt = Math.min(48, t - s.current.last); s.current.last = t;
      const st = s.current;
      const lv = st.level;

      if (!paused && !over) {
        // input
        const k = st.keys;
        const accel = 0.6;
        const max = (k["shift"] ? 5 : 3.5);
        if (k["arrowleft"] || k["a"]) { st.vx = Math.max(-max, st.vx - accel); st.facing = -1; }
        else if (k["arrowright"] || k["d"]) { st.vx = Math.min(max, st.vx + accel); st.facing = 1; }
        else st.vx *= 0.78;
        // gravity
        st.vy = Math.min(13, st.vy + 0.55);
        // x movement w/ collision
        st.x += st.vx * (dt / 16);
        resolveX(st, lv);
        // y movement w/ collision
        st.y += st.vy * (dt / 16);
        resolveY(st, lv);
        // out of bounds (fall)
        if (st.y > lv.rows * TILE + 100) { die(); }
        // camera
        st.cameraX = Math.max(0, Math.min(lv.cols * TILE - VIEW_W, st.x - VIEW_W / 3));
        // enemies
        for (const e of lv.enemies) {
          if (!e.alive) continue;
          e.x += e.vx * (dt / 16);
          // gravity for enemies
          let eVy = 2;
          // collide with tiles
          const gx = Math.floor((e.x + 8) / TILE);
          const gy = Math.floor((e.y + TILE) / TILE);
          if (gy < lv.rows && gx >= 0 && gx < lv.cols) {
            if (!isSolid(lv.tiles[gy][gx])) e.y += eVy;
            // wall ahead
            const ahead = Math.floor((e.x + (e.vx < 0 ? -2 : TILE + 2)) / TILE);
            const aheadY = Math.floor((e.y + TILE - 4) / TILE);
            if (aheadY < lv.rows && ahead >= 0 && ahead < lv.cols && isSolid(lv.tiles[aheadY][ahead])) {
              e.vx = -e.vx;
            }
            // edge check (don't walk off)
            const groundCheck = Math.floor((e.x + (e.vx < 0 ? 0 : TILE)) / TILE);
            const groundY = Math.floor((e.y + TILE + 2) / TILE);
            if (groundY < lv.rows && groundCheck >= 0 && groundCheck < lv.cols && !isSolid(lv.tiles[groundY][groundCheck])) {
              e.vx = -e.vx;
            }
          }
          // collide with player
          if (st.invuln === 0 && Math.abs(e.x - st.x) < 24 && Math.abs(e.y - st.y) < 28) {
            if (st.vy > 0 && st.y < e.y - 8) {
              // stomp
              e.alive = false;
              st.vy = -7;
              setScore((sc) => sc + 100);
              play("pop"); vibrate(20);
            } else {
              die();
            }
          }
        }
        st.invuln = Math.max(0, st.invuln - 1);
        // coins
        for (const co of lv.coins) {
          if (co.collected) continue;
          if (Math.abs(co.x - (st.x + TILE / 2)) < 18 && Math.abs(co.y - (st.y + TILE / 2)) < 22) {
            co.collected = true;
            setCoins((c) => c + 1);
            setScore((sc) => sc + 50);
            play("ding"); vibrate(10);
          }
        }
        // tile interactions: lava, flag, spring
        {
          const tilesX = Math.floor((st.x + TILE / 2) / TILE);
          const tilesY = Math.floor((st.y + TILE / 2) / TILE);
          const t2 = lv.tiles[tilesY]?.[tilesX];
          if (t2 === "l") die();
          if (t2 === "s" && st.vy >= 0 && st.onGround === false && st.vy < 14) {
            // only when descending into spring or landing on it
            if (st.vy >= -1) { st.vy = -14; play("ding"); vibrate(20); }
          }
          if (t2 === "f" && !won) {
            setWon(true);
            const bonus = time * 10 + lives * 200;
            setScore((sc) => sc + bonus);
            const next = level + 1;
            if (next > unlockedLvl) {
              setUnlockedLvl(next);
              storage.set("mario:unlocked", next);
            }
            if (next > TOTAL_LEVELS) {
              setAllCleared(true);
              setOver(true);
              const ok = setHighScore("mario", score + bonus); if (ok) setBest(score + bonus);
              play("win"); vibrate([60, 30, 60]);
            } else {
              play("win"); vibrate(60);
              setTimeout(() => initLevel(next, false), 800);
            }
          }
        }
      }

      // render
      // sky
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, "#1d4ed8");
      grad.addColorStop(1, "#0a0a24");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      // clouds (parallax)
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      for (let i = 0; i < 6; i++) {
        const cx = ((i * 200 - st.cameraX * 0.3) % (VIEW_W + 200)) - 100;
        const cy = 40 + (i % 3) * 30;
        ctx.beginPath();
        ctx.arc(cx, cy, 20, 0, Math.PI * 2);
        ctx.arc(cx + 18, cy + 4, 16, 0, Math.PI * 2);
        ctx.arc(cx - 16, cy + 4, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      // tiles
      const startX = Math.floor(st.cameraX / TILE);
      const endX = Math.min(lv.cols, startX + Math.ceil(VIEW_W / TILE) + 1);
      for (let y = 0; y < lv.rows; y++) {
        for (let x = startX; x < endX; x++) {
          const t2 = lv.tiles[y][x];
          if (t2 === ".") continue;
          const dx = x * TILE - st.cameraX;
          const dy = y * TILE;
          if (t2 === "#") {
            ctx.fillStyle = "#7c4a1f";
            ctx.fillRect(dx, dy, TILE, TILE);
            ctx.fillStyle = "#a86a32";
            ctx.fillRect(dx, dy, TILE, 6);
            ctx.fillStyle = "#22ee9c";
            ctx.fillRect(dx, dy, TILE, 3);
          } else if (t2 === "=") {
            ctx.fillStyle = "#b14aed";
            ctx.fillRect(dx, dy, TILE, TILE);
            ctx.strokeStyle = "#0a0a14"; ctx.lineWidth = 2;
            ctx.strokeRect(dx + 1, dy + 1, TILE - 2, TILE - 2);
          } else if (t2 === "?") {
            ctx.fillStyle = "#fde047";
            ctx.fillRect(dx, dy, TILE, TILE);
            ctx.fillStyle = "#000";
            ctx.font = "bold 22px monospace";
            ctx.textAlign = "center";
            ctx.fillText("?", dx + TILE / 2, dy + TILE - 6);
          } else if (t2 === "p") {
            ctx.fillStyle = "#22ee9c";
            ctx.fillRect(dx, dy, TILE, TILE);
            ctx.fillStyle = "#000";
            ctx.fillRect(dx + 4, dy + 4, TILE - 8, 2);
          } else if (t2 === "f") {
            ctx.fillStyle = "#a3a3a3";
            ctx.fillRect(dx + TILE / 2 - 1, dy, 2, TILE);
            ctx.fillStyle = "#ec4899";
            ctx.beginPath();
            ctx.moveTo(dx + TILE / 2, dy + 4);
            ctx.lineTo(dx + TILE, dy + 12);
            ctx.lineTo(dx + TILE / 2, dy + 20);
            ctx.fill();
          } else if (t2 === "l") {
            ctx.fillStyle = "#ef4444";
            ctx.fillRect(dx, dy + TILE * 0.4, TILE, TILE * 0.6);
            ctx.fillStyle = "#fde047";
            for (let i = 0; i < 3; i++) {
              const wx = dx + i * 10 + (Math.sin(t / 200 + i) * 4);
              ctx.fillRect(wx, dy + TILE * 0.4, 6, 4);
            }
          } else if (t2 === "s") {
            ctx.fillStyle = "#22d3ee";
            ctx.fillRect(dx + 4, dy + TILE - 12, TILE - 8, 12);
            ctx.fillRect(dx + 2, dy + TILE - 4, TILE - 4, 4);
          }
        }
      }
      // coins
      for (const co of lv.coins) {
        if (co.collected) continue;
        const cx = co.x - st.cameraX;
        if (cx < -20 || cx > VIEW_W + 20) continue;
        ctx.fillStyle = "#fde047";
        ctx.shadowColor = "#fde047"; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(cx, co.y + Math.sin(t / 200) * 2, 6, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      // enemies (goombas)
      for (const e of lv.enemies) {
        if (!e.alive) continue;
        const ex = e.x - st.cameraX;
        if (ex < -40 || ex > VIEW_W + 40) continue;
        ctx.fillStyle = "#a86a32";
        ctx.fillRect(ex + 4, e.y + 8, TILE - 8, TILE - 8);
        ctx.fillStyle = "#000";
        ctx.fillRect(ex + 8, e.y + 14, 4, 4);
        ctx.fillRect(ex + TILE - 12, e.y + 14, 4, 4);
        ctx.fillStyle = "#5a3a1f";
        ctx.fillRect(ex + 6, e.y + TILE - 4, 6, 4);
        ctx.fillRect(ex + TILE - 12, e.y + TILE - 4, 6, 4);
      }
      // player
      const px = st.x - st.cameraX;
      const py = st.y;
      if (st.invuln === 0 || Math.floor(t / 80) % 2 === 0) {
        // body
        ctx.fillStyle = "#ec4899";
        ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
        // hat
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(px + 4, py + 4, TILE - 8, 8);
        // face
        ctx.fillStyle = "#fde047";
        ctx.fillRect(px + 10, py + 14, TILE - 20, 8);
        // eye
        ctx.fillStyle = "#000";
        ctx.fillRect(px + (st.facing === 1 ? 18 : 10), py + 16, 3, 3);
      }
      // HUD
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, VIEW_W, 28);
      ctx.fillStyle = "white"; ctx.font = "bold 14px monospace"; ctx.textAlign = "left";
      ctx.fillText(`Score ${score.toString().padStart(6,"0")}`, 10, 19);
      ctx.fillText(`× ${coins}`, 180, 19);
      ctx.fillStyle = "#fde047";
      ctx.beginPath(); ctx.arc(168, 14, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "white";
      ctx.fillText(`World ${level}-1`, 290, 19);
      ctx.fillText(`Time ${time}`, 420, 19);
      ctx.fillText(`Lives ${"♥".repeat(lives)}`, 540, 19);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, score, coins, level, lives, time, unlockedLvl, die, initLevel, play, vibrate]);

  function resolveX(st: typeof s.current, lv: typeof s.current.level) {
    const minX = Math.floor(st.x / TILE);
    const maxX = Math.floor((st.x + TILE - 1) / TILE);
    const minY = Math.floor(st.y / TILE);
    const maxY = Math.floor((st.y + TILE - 1) / TILE);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (y < 0 || y >= lv.rows || x < 0 || x >= lv.cols) continue;
        if (isSolid(lv.tiles[y][x])) {
          if (st.vx > 0) st.x = x * TILE - TILE;
          else if (st.vx < 0) st.x = x * TILE + TILE;
          st.vx = 0;
        }
      }
    }
    if (st.x < 0) st.x = 0;
  }
  function resolveY(st: typeof s.current, lv: typeof s.current.level) {
    const minX = Math.floor(st.x / TILE);
    const maxX = Math.floor((st.x + TILE - 1) / TILE);
    const minY = Math.floor(st.y / TILE);
    const maxY = Math.floor((st.y + TILE - 1) / TILE);
    st.onGround = false;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (y < 0 || y >= lv.rows || x < 0 || x >= lv.cols) continue;
        if (isSolid(lv.tiles[y][x])) {
          if (st.vy > 0) { st.y = y * TILE - TILE; st.onGround = true; }
          else if (st.vy < 0) {
            st.y = y * TILE + TILE;
            // hit a "?" block: pop coin if any near
            if (lv.tiles[y][x] === "?") {
              const nearby = lv.coins.find((c) => !c.collected && Math.abs(c.x - (x * TILE + TILE / 2)) < 4);
              if (nearby) {
                nearby.collected = true;
                setCoins((c) => c + 1);
                setScore((sc) => sc + 50);
                play("ding");
                lv.tiles[y][x] = "=" as Tile;
              }
            }
          }
          st.vy = 0;
        }
      }
    }
  }

  return (
    <GameShell
      game={game}
      score={score}
      best={best}
      paused={paused}
      onTogglePause={() => setPaused((p) => !p)}
      onRestart={() => initLevel(level, true)}
      onOpenHowTo={() => setShowHow(true)}
      rightExtra={
        <button onClick={() => setShowLevels(true)} className="btn-ghost">
          <Layers size={16} /> <span className="hidden sm:inline">Lvl {level}/{TOTAL_LEVELS}</span>
        </button>
      }
    >
      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={VIEW_H}
        className="rounded-2xl border-2 border-white/10 shadow-neon bg-bg-soft w-[min(95vw,800px)] h-auto aspect-[800/480]"
      />
      {touch && (
        <div className="mt-4 flex justify-between w-[min(95vw,500px)]">
          <div className="flex gap-2">
            <button onPointerDown={() => (s.current.keys["arrowleft"] = true)} onPointerUp={() => (s.current.keys["arrowleft"] = false)} className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 text-2xl">◀</button>
            <button onPointerDown={() => (s.current.keys["arrowright"] = true)} onPointerUp={() => (s.current.keys["arrowright"] = false)} className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 text-2xl">▶</button>
          </div>
          <button onPointerDown={() => jump()} className="w-16 h-16 rounded-2xl bg-neon-pink/20 border-2 border-neon-pink/50 text-neon-pink font-bold">JUMP</button>
        </div>
      )}

      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        title={allCleared ? "🏆 You saved them all!" : won ? `Level ${level} cleared!` : "Game Over"}
        score={score}
        best={best}
        isNewBest={score === best && score > 0}
        extra={<div className="text-xs text-white/60">Coins: {coins} · Time: {time}</div>}
        onRestart={() => initLevel(1, true)}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>← → / A D to move · Shift to run · Space / ↑ / W to jump</li>
          <li>Jump on goombas to stomp them. Touching from the side = lose a life.</li>
          <li>Coins = +50. Hit yellow "?" blocks from below to pop a coin.</li>
          <li>Reach the pink flag to finish the level. Beat all 5 to win.</li>
          <li>Don't fall in lava (red) or off the map.</li>
        </ul>
      </Modal>
      <Modal open={showLevels} onClose={() => setShowLevels(false)} title="Select Level">
        <div className="text-xs text-white/60 mb-2">Unlocked: {unlockedLvl}/{TOTAL_LEVELS}</div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1).map((n) => {
            const locked = n > unlockedLvl;
            return (
              <button
                key={n}
                disabled={locked}
                onClick={() => { initLevel(n, true); setShowLevels(false); }}
                className={cn(
                  "aspect-square rounded-xl border text-2xl font-bold",
                  locked ? "bg-white/3 border-white/5 text-white/20" :
                  n === level ? "bg-neon-pink/30 border-neon-pink shadow-neon" :
                  "bg-white/5 border-white/10 hover:bg-neon-pink/20"
                )}
              >
                {locked ? "🔒" : n}
              </button>
            );
          })}
        </div>
      </Modal>
    </GameShell>
  );
}
