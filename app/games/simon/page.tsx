"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { cn } from "@/lib/cn";

const COLORS = ["#22ee9c", "#ec4899", "#fde047", "#22d3ee"] as const;
const FREQS = [330, 415, 494, 622];

export default function SimonGame() {
  const game = getGame("simon")!;
  const [seq, setSeq] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false); // is computer playing
  const [active, setActive] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { play, tone, vibrate } = useSound();
  const timeoutsRef = useRef<number[]>([]);

  const reset = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setSeq([Math.floor(Math.random() * 4)]);
    setStep(0);
    setOver(false);
    setScore(0);
    setPlaying(true);
  }, []);

  useEffect(() => {
    pushRecent("simon");
    setBest(getHighScore("simon"));
  }, []);

  // Play out sequence
  useEffect(() => {
    if (!seq.length || !playing) return;
    let i = 0;
    const playOne = () => {
      if (i >= seq.length) { setActive(null); setPlaying(false); setStep(0); return; }
      const idx = seq[i];
      setActive(idx);
      tone(FREQS[idx], 350, "square", 0.1);
      const off = window.setTimeout(() => setActive(null), 350);
      timeoutsRef.current.push(off);
      const next = window.setTimeout(() => { i++; playOne(); }, 500);
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
        if (setHighScore("simon", seq.length)) setBest(seq.length);
        setTimeout(() => {
          setSeq((s) => [...s, Math.floor(Math.random() * 4)]);
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

  return (
    <GameShell game={game} score={score} best={best} onRestart={reset} onOpenHowTo={() => setShowHow(true)}>
      <div className="text-center text-sm text-white/60 mb-2">{playing ? "Watch…" : over ? "Game over" : "Repeat the sequence"}</div>
      <div className="grid grid-cols-2 gap-3 w-[min(90vw,360px)]">
        {[0, 1, 2, 3].map((i) => (
          <button
            key={i}
            onPointerDown={() => press(i)}
            className={cn("aspect-square rounded-2xl transition-all shadow-neon border-2", active === i ? "scale-95 brightness-150" : "")}
            style={{ background: COLORS[i], borderColor: COLORS[i], opacity: active === i ? 1 : 0.55 }}
            aria-label={`Color ${i + 1}`}
          />
        ))}
      </div>
      <div className="mt-4 text-xs text-white/40">Level {seq.length}</div>
      <GameOverModal open={over} onClose={() => setOver(false)} title="Wrong note!" score={seq.length} best={best} isNewBest={seq.length === best && seq.length > 0} onRestart={reset} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Watch the sequence. Repeat it exactly.</li>
          <li>Each round adds one more color.</li>
          <li>One wrong tap and the game ends.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
