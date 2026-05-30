"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Award } from "lucide-react";
import { ACHIEVEMENTS, unlocked } from "@/lib/achievements";
import { GAMES } from "@/lib/games-meta";
import { cn } from "@/lib/cn";

export default function AchievementsPage() {
  const [u, setU] = useState<Record<string, number>>({});
  useEffect(() => { setU(unlocked()); }, []);
  const total = ACHIEVEMENTS.length;
  const got = Object.keys(u).length;
  const pct = Math.round((got / total) * 100);

  const groups = ["global", ...GAMES.map((g) => g.slug)] as const;
  const titleFor = (g: string) => g === "global" ? "Global" : GAMES.find((x) => x.slug === g)?.title ?? g;
  const emojiFor = (g: string) => g === "global" ? "🌐" : GAMES.find((x) => x.slug === g)?.emoji ?? "";

  return (
    <div className="min-h-screen safe-pad max-w-4xl mx-auto px-4 py-8">
      <Link href="/" className="btn-ghost mb-4"><ArrowLeft size={16} /> Back to lobby</Link>
      <h1 className="pixel-font text-2xl neon-text mb-2 flex items-center gap-2"><Award /> Achievements</h1>
      <div className="mb-6">
        <div className="flex items-center gap-3 text-sm text-white/70 mb-2">
          <span>{got} / {total} unlocked</span>
          <span className="text-neon-yellow tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-neon-purple to-neon-cyan" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {groups.map((g) => {
        const list = ACHIEVEMENTS.filter((a) => a.game === g);
        if (!list.length) return null;
        return (
          <section key={g} className="mb-8">
            <h2 className="text-sm uppercase tracking-wider text-white/50 mb-3 flex items-center gap-2">
              <span className="text-lg">{emojiFor(g)}</span> {titleFor(g)}
              <span className="text-xs text-white/30">({list.filter((a) => u[a.id]).length}/{list.length})</span>
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {list.map((a) => {
                const has = !!u[a.id];
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "p-3 rounded-xl border flex items-center gap-3",
                      has ? "bg-neon-yellow/10 border-neon-yellow/40" : "bg-white/3 border-white/5 opacity-60"
                    )}
                  >
                    <div className={cn("text-3xl", !has && "grayscale opacity-50")}>{has ? a.icon : "🔒"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">{a.title}</div>
                      <div className="text-xs text-white/60">{a.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
