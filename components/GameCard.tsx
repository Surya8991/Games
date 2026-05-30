"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { GameMeta } from "@/lib/games-meta";
import { Flame } from "lucide-react";

export function GameCard({ game, index = 0 }: { game: GameMeta; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.35 }}
    >
      <Link
        href={`/games/${game.slug}`}
        className="arcade-card group block p-4 sm:p-5 h-full"
        aria-label={`Play ${game.title}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="text-4xl sm:text-5xl select-none transition-transform group-hover:scale-110 group-hover:animate-float">
            {game.emoji}
          </div>
          {game.hot && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-neon-pink/15 text-neon-pink border border-neon-pink/40">
              <Flame size={10} /> HOT
            </span>
          )}
        </div>
        <h3 className={cn("pixel-font text-sm sm:text-base mb-1", game.accent)}>{game.title}</h3>
        <p className="text-xs sm:text-sm text-white/60 line-clamp-2">{game.blurb}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {game.controls.slice(0, 3).map((c) => (
            <span
              key={c}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 border border-white/5"
            >
              {c}
            </span>
          ))}
        </div>
      </Link>
    </motion.div>
  );
}
