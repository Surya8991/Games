"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { cn } from "@/lib/cn";

const COLORS = ["#22ee9c", "#ec4899", "#fde047", "#22d3ee", "#a855f7", "#f97316"] as const;
const FREQS = [330, 415, 494, 622, 740, 880];
type Mode = "classic" | "hard" | "extreme";
const MODE_COUNT: Record<Mode, number> = { classic: 4, hard: 6, extreme: 6 };
const MODE_SPEED: Record<Mode, number> = { classic: 500, hard: 380, extreme: 240 };

export default function SimonGame() {
  const game = getGame("simon")!;
  const [mode, setMode] = useState<Mode>("classic");
  const [seq, setSeq] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false); // is computer playing
  const [active, setActive] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { play, tone, vibrate } = useSound();
  const colorCount = MODE_COUNT[mode];
  const timeoutsRef = useRef<number[]>([]);

  const reset = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setSeq([Math.floor(Math.random() * colorCount)]);
    setStep(0);
    setOver(false);
    setScore(0);
    setPlaying(true);
  }, [colorCount]);

  useEffect(() => {
    pushRecent("simon");
    setBest(getHighScore("simon", mode));
  }, [mode]);

  // Play out sequence
  useEffect(() => {
    if (!seq.length || !playing) return;
    let i = 0;
    const stepDelay = MODE_SPEED[mode];
    const flashDelay = Math.max(140, stepDelay - 100);
    const playOne = () => {
      if (i >= seq.length) { setActive(null); setPlaying(false); setStep(0); return; }
      const idx = seq[i];
      setActive(idx);
      tone(FREQS[idx], flashDelay, "square", 0.1);
      const off = window.setTimeout(() => setActive(null), flashDelay);
      timeoutsRef.current.push(off);
      const next = window.setTimeout(() => { i++; playOne(); }, stepDelay);
      timeoutsRef.current.push(next);
    };
    const start = window.setTimeout(playOne, 600);
    timeoutsRef.current.push(start);
    return () => { timeoutsRef.current.forEach(clearTimeout); timeoutsRef.current = []; };
  }, [seq, playing, tone]);

  const press = (i: number) => {
    if (playing || over) return;
    setActive(i);
    tone(FREQS[i], 200, "square", 0.1);
    vibrate(15);
    setTimeout(() => setActive(null), 200);
    if (seq[step] === i) {
      const ns = step + 1;
      if (ns === seq.length) {
        setScore(seq.length);
        if (setHighScore("simon", seq.length, mode)) setBest(seq.length);
        setTimeout(() => {
          setSeq((s) => [...s, Math.floor(Math.random() * colorCount)]);
          setPlaying(true);
        }, 400);
        setStep(0);
      } else setStep(ns);
    } else {
      setOver(true);
      play("lose"); vibrate(150);
      updateStats("simon", { plays: 1, losses: 1, bestScore: seq.length });
    }
  };

  // Auto start
  useEffect(() => { if (!seq.length) reset(); }, [seq.length, reset]);

  const gridCols = colorCount <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)} onOpenSettings={() => setShowSettings(true)} rightExtra={<span className="text-xs text-white/60 capitalize">{mode}</span>}>
      <div className="text-center text-sm text-white/60 mb-2">{playing ? "Watch…" : over ? "Game over" : "Repeat the sequence"}</div>
      <div className={cn("grid gap-3 w-[min(90vw,360px)]", gridCols)}>
        {Array.from({ length: colorCount }, (_, i) => i).map((i) => (
          <button
            key={i}
            onPointerDown={() => press(i)}
            className={cn("aspect-square rounded-2xl transition-all shadow-neon border-2", active === i ? "scale-95 brightness-150" : "")}
            style={{ background: COLORS[i], borderColor: COLORS[i], opacity: active === i ? 1 : 0.55 }}
            aria-label={`Color ${i + 1}`}
          />
        ))}
      </div>
      <div className="mt-4 text-xs text-white/40">Level {seq.length} · {colorCount} colors · {mode === "extreme" ? "fastest" : mode === "hard" ? "faster" : "normal"} tempo</div>
      <GameOverModal open={over} onClose={() => setOver(false)} title="Wrong note!" score={seq.length} best={best} isNewBest={seq.length === best && seq.length > 0} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Watch the sequence. Repeat it exactly.</li>
          <li>Each round adds one more color.</li>
          <li>Classic = 4 colors. Hard = 6. Extreme = 6 + super-fast.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Mode" footer={<button onClick={() => { setShowSettings(false); reset(); }} className="btn-primary w-full justify-center">Restart</button>}>
        <div className="grid grid-cols-3 gap-2">
          {(["classic","hard","extreme"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("px-3 py-2 rounded-lg border text-sm capitalize", mode === m ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>
              {m}
              <div className="text-[10px] text-white/50">{m === "classic" ? "4 colors" : m === "hard" ? "6 colors" : "6 · fast"}</div>
            </button>
          ))}
        </div>
      </Modal>
    </GameShell>
  );
}
