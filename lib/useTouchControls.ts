"use client";

import { useEffect, useState } from "react";

export function useIsTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const hasTouch =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches;
    setTouch(hasTouch);
  }, []);
  return touch;
}

export type Swipe = "up" | "down" | "left" | "right";

/**
 * Attach swipe detection to a target element. Threshold in px.
 */
export function useSwipe(
  ref: React.RefObject<HTMLElement>,
  onSwipe: (dir: Swipe) => void,
  threshold = 24
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let sx = 0,
      sy = 0,
      tracking = false;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      tracking = true;
    };
    const end = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
      if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? "right" : "left");
      else onSwipe(dy > 0 ? "down" : "up");
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
    };
  }, [ref, onSwipe, threshold]);
}
