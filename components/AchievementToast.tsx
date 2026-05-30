"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Achievement } from "@/lib/achievements";

export function AchievementToast() {
  const [queue, setQueue] = useState<Achievement[]>([]);

  useEffect(() => {
    const onAch = (e: Event) => {
      const a = (e as CustomEvent<Achievement>).detail;
      setQueue((q) => [...q, a]);
      setTimeout(() => setQueue((q) => q.slice(1)), 4200);
    };
    window.addEventListener("achievement", onAch);
    return () => window.removeEventListener("achievement", onAch);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2 pointer-events-none">
      <AnimatePresence>
        {queue.map((a, i) => (
          <motion.div
            key={`${a.id}-${i}`}
            initial={{ opacity: 0, x: 80, scale: 0.85 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-card border-2 border-neon-yellow/60 shadow-neon max-w-xs"
          >
            <div className="text-3xl">{a.icon}</div>
            <div className="text-sm">
              <div className="text-[10px] uppercase tracking-wide text-neon-yellow">Achievement unlocked</div>
              <div className="font-bold">{a.title}</div>
              <div className="text-xs text-white/60">{a.desc}</div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
