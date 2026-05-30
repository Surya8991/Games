"use client";

import { useEffect, useRef } from "react";

export type KeyMap = Record<string, boolean>;

/**
 * Tracks which keys are currently held. Returns a ref-stable map you can read in game loops.
 * Optional onDown/onUp for one-shot triggers (jump, hard-drop).
 */
export function useKeyboard(
  opts: {
    onDown?: (key: string, e: KeyboardEvent) => void;
    onUp?: (key: string, e: KeyboardEvent) => void;
    preventDefault?: string[];
  } = {}
) {
  const keys = useRef<KeyMap>({});

  useEffect(() => {
    const prevent = new Set((opts.preventDefault ?? []).map((k) => k.toLowerCase()));
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (prevent.has(k) || prevent.has(e.code.toLowerCase())) e.preventDefault();
      if (!keys.current[k]) {
        keys.current[k] = true;
        opts.onDown?.(k, e);
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current[k] = false;
      opts.onUp?.(k, e);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return keys;
}
