"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSettings } from "./storage";

// Lightweight WebAudio SFX (no asset files required) — chiptune-ish blips.
// For real samples later we can swap to Howler.

type SfxType =
  | "click"
  | "blip"
  | "ding"
  | "pop"
  | "thud"
  | "zap"
  | "win"
  | "lose"
  | "tick";

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(true);

  useEffect(() => {
    enabledRef.current = getSettings().sound;
    const onStorage = () => (enabledRef.current = getSettings().sound);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const getCtx = () => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  };

  const tone = useCallback(
    (
      freq: number,
      durMs: number,
      type: OscillatorType = "square",
      gain = 0.07
    ) => {
      if (!enabledRef.current) return;
      const ctx = getCtx();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = gain;
      g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + durMs / 1000);
    },
    []
  );

  const play = useCallback(
    (kind: SfxType) => {
      switch (kind) {
        case "click":
          return tone(720, 40, "square", 0.05);
        case "blip":
          return tone(880, 60);
        case "ding":
          tone(880, 80);
          setTimeout(() => tone(1320, 120), 60);
          return;
        case "pop":
          return tone(440, 80, "triangle", 0.08);
        case "thud":
          return tone(140, 140, "sawtooth", 0.1);
        case "zap":
          tone(1200, 60, "sawtooth", 0.08);
          setTimeout(() => tone(600, 80, "sawtooth", 0.08), 50);
          return;
        case "win":
          [523, 659, 784, 1046].forEach((f, i) =>
            setTimeout(() => tone(f, 140, "square", 0.09), i * 100)
          );
          return;
        case "lose":
          [523, 415, 311, 233].forEach((f, i) =>
            setTimeout(() => tone(f, 180, "sawtooth", 0.08), i * 120)
          );
          return;
        case "tick":
          return tone(1600, 25, "square", 0.03);
      }
    },
    [tone]
  );

  const vibrate = useCallback((ms: number | number[]) => {
    if (typeof navigator === "undefined") return;
    if (!getSettings().vibration) return;
    navigator.vibrate?.(ms);
  }, []);

  return { play, tone, vibrate };
}
