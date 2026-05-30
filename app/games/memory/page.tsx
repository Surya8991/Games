"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { unlock } from "@/lib/achievements";
import { cn } from "@/lib/cn";

const THEMES = {
  emoji: ["🐶","🐱","🦊","🐼","🦁","🐯","🐸","🐵","🦄","🐙","🐠","🦋","🌸","🍩","🍕","🚀","⚽","🎲","🎸","🎯","💎","🌈","⭐","🔥","🍓","🍉","🍔","🎁","🪐","🐢"],
  flag:  ["🇺🇸","🇬🇧","🇫🇷","🇩🇪","🇯🇵","🇧🇷","🇮🇳","🇨🇳","🇨🇦","🇲🇽","🇰🇷","🇮🇹","🇪🇸","🇳🇱","🇸🇪","🇳🇴","🇦🇺","🇿🇦","🇪🇬","🇦🇷","🇬🇷","🇨🇭","🇸🇬","🇵🇹","🇮🇪","🇹🇷","🇹🇭","🇻🇳","🇵🇭","🇳🇿"],
  food:  ["🍎","🍌","🍇","🍓","🍒","🍍","🥭","🍑","🍉","🍊","🥥","🥝","🍋","🍐","🌽","🥕","🥔","🍅","🥬","🥦","🍆","🌶️","🫐","🍈","🍏","🥑","🍔","🍕","🌮","🍜"],
};
type ThemeKey = keyof typeof THEMES;
const SIZES = [
  { rows: 4, cols: 4, label: "4×4 (8)" },
  { rows: 4, cols: 6, label: "4×6 (12)" },
  { rows: 6, cols: 6, label: "6×6 (18)" },
  { rows: 6, cols: 8, label: "6×8 (24)" },
] as const;
type SizeKey = (typeof SIZES)[number];

type Card = { id: number; face: string; flipped: boolean; matched: boolean };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal(size: SizeKey, theme: ThemeKey): Card[] {
  const total = size.rows * size.cols;
  const pairs = total / 2;
  const faces = shuffle(THEMES[theme]).slice(0, pairs);
  const cards = shuffle([...faces, ...faces]).map((face, i) => ({
    id: i,
    face,
    flipped: false,
    matched: false,
  }));
  return cards;
}

export default function MemoryGame() {
  const game = getGame("memory")!;
  const [size, setSize] = useState<SizeKey>(SIZES[1]);
  const [theme, setTheme] = useState<ThemeKey>("emoji");
  const [cards, setCards] = useState<Card[]>(() => deal(SIZES[1], "emoji"));
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [bestTime, setBestTime] = useState<number>(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { play, vibrate } = useSound();

  const sizeKey = `${size.rows}x${size.cols}`;
  const matchedAll = cards.length && cards.every((c) => c.matched);

  useEffect(() => {
    pushRecent("memory");
  }, []);
  useEffect(() => {
    setBestTime(getHighScore("memory", `time-${sizeKey}`));
  }, [sizeKey]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTime((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (matchedAll && cards.length) {
      setRunning(false);
      setOver(true);
      play("win");
      vibrate([60, 30, 60]);
      // best = lower time = higher rank → store negative or just stash min separately
      const prev = getHighScore("memory", `time-${sizeKey}`);
      if (prev === 0 || time < prev) {
        setHighScore("memory", time, `time-${sizeKey}`);
        setBestTime(time);
      }
      updateStats("memory", { plays: 1, wins: 1, bestScore: moves });
      if (size.rows >= 6 && size.cols >= 6) unlock("memory-6x6");
    }
  }, [matchedAll]); // eslint-disable-line

  const lockRef = useRef(false);
  const flip = (i: number) => {
    if (lockRef.current) return;
    setCards((cs) => {
      if (cs[i].flipped || cs[i].matched) return cs;
      const flippedCount = cs.filter((c) => c.flipped && !c.matched).length;
      if (flippedCount >= 2) return cs;
      const next = cs.slice();
      next[i] = { ...next[i], flipped: true };
      if (!running) setRunning(true);
      play("click");
      vibrate(10);
      const opens = next.map((c, idx) => ({ c, idx })).filter((o) => o.c.flipped && !o.c.matched);
      if (opens.length === 2) {
        setMoves((m) => m + 1);
        const [a, b] = opens;
        lockRef.current = true;
        if (a.c.face === b.c.face) {
          setTimeout(() => {
            setCards((cur) => cur.map((c, idx) => (idx === a.idx || idx === b.idx ? { ...c, matched: true } : c)));
            play("ding");
            vibrate(30);
            lockRef.current = false;
          }, 350);
        } else {
          setTimeout(() => {
            setCards((cur) => cur.map((c, idx) => ((idx === a.idx || idx === b.idx) && !c.matched ? { ...c, flipped: false } : c)));
            lockRef.current = false;
          }, 750);
        }
      }
      return next;
    });
  };

  const reset = (s: SizeKey = size, t: ThemeKey = theme) => {
    setSize(s);
    setTheme(t);
    setCards(deal(s, t));
    setMoves(0);
    setTime(0);
    setRunning(false);
    setOver(false);
  };

  const tileSize = useMemo(() => {
    const total = size.rows * size.cols;
    return total <= 16 ? "w-16 h-20 sm:w-20 sm:h-24" : total <= 24 ? "w-14 h-18 sm:w-16 sm:h-20" : total <= 36 ? "w-12 h-16 sm:w-14 sm:h-18" : "w-10 h-14 sm:w-12 sm:h-16";
  }, [size]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <GameShell
      game={game}
      score={`${moves}m · ${fmtTime(time)}`}
      best={bestTime ? fmtTime(bestTime) : "—"}
      onRestart={() => reset()}
      onOpenHowTo={() => setShowHow(true)}
      onOpenSettings={() => setShowSettings(true)}
    >
      <div
        className="grid gap-2 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${size.cols}, minmax(0, 1fr))` }}
      >
        {cards.map((c, i) => (
          <button
            key={c.id}
            onClick={() => flip(i)}
            className={cn(
              "rounded-lg border transition-all duration-200 grid place-items-center text-2xl sm:text-3xl select-none",
              tileSize,
              c.flipped || c.matched
                ? "bg-white/10 border-neon-purple/40 [transform:rotateY(0)]"
                : "bg-neon-purple/20 border-neon-purple/30 hover:bg-neon-purple/30",
              c.matched && "opacity-60 ring-2 ring-neon-green/60"
            )}
            aria-label={c.matched ? "matched" : c.flipped ? "showing" : "hidden card"}
          >
            {c.flipped || c.matched ? c.face : "?"}
          </button>
        ))}
      </div>

      <GameOverModal
        open={over}
        onClose={() => setOver(false)}
        title="You did it!"
        score={`${moves} moves`}
        extra={<div className="text-sm text-white/70">Time: {fmtTime(time)} · Best: {bestTime ? fmtTime(bestTime) : "—"}</div>}
        onRestart={() => reset()}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Flip cards two at a time. Match pairs to clear them.</li>
          <li>Fewer moves and faster time = better score.</li>
          <li>Pick a theme and grid size in settings.</li>
        </ul>
      </Modal>
      <Modal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Settings"
        footer={
          <button onClick={() => reset(size, theme)} className="btn-primary w-full justify-center">
            Restart
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-white/60 mb-2">Grid size</p>
            <div className="grid grid-cols-2 gap-2">
              {SIZES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setSize(s)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm",
                    size.label === s.label ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-white/60 mb-2">Theme</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(THEMES) as ThemeKey[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm capitalize",
                    theme === t ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </GameShell>
  );
}
