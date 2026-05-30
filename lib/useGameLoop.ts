"use client";

import { useEffect, useRef } from "react";

export type LoopCallback = (deltaMs: number, elapsedMs: number) => void;

/**
 * requestAnimationFrame loop. Calls `cb` each frame with delta + elapsed ms.
 * Loop runs while `running` is true. Auto-pauses when tab is hidden.
 */
export function useGameLoop(cb: LoopCallback, running: boolean) {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let start = last;
    let paused = false;

    const tick = (t: number) => {
      const dt = Math.min(48, t - last); // clamp 48ms to avoid huge jumps
      last = t;
      if (!paused) cbRef.current(dt, t - start);
      raf = requestAnimationFrame(tick);
    };

    const onVis = () => {
      paused = document.hidden;
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [running]);
}
