"use client";

import Link from "next/link";
import { ArrowLeft, Trophy, Crown, Medal } from "lucide-react";
import { GAMES } from "@/lib/games-meta";
import { getLeaderboard, getPlayerName, LBEntry } from "@/lib/storage";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export default function LeaderboardPage() {
  const [selected, setSelected] = useState<string>(GAMES[0].slug);
  const [entries, setEntries] = useState<LBEntry[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    setEntries(getLeaderboard(selected));
    setName(getPlayerName());
  }, [selected]);

  const cards = useMemo(() => GAMES.map((g) => {
    const lb = getLeaderboard(g.slug);
    return { g, top: lb[0] };
  }), []);

  return (
    <div className="min-h-screen safe-pad max-w-5xl mx-auto px-4 py-8">
      <Link href="/" className="btn-ghost mb-4"><ArrowLeft size={16} /> Back to lobby</Link>
      <h1 className="pixel-font text-2xl sm:text-3xl neon-text mb-2 flex items-center gap-2"><Trophy /> Leaderboards</h1>
      <p className="text-sm text-white/60 mb-6">
        Local top-50 scores per game (with player names). Global leaderboards arrive once a Postgres backend is wired up.
      </p>

      {/* Game picker */}
      <div className="flex gap-2 overflow-x-auto mb-6 pb-2 scrollbar-hide">
        {GAMES.map((g) => (
          <button
            key={g.slug}
            onClick={() => setSelected(g.slug)}
            className={cn(
              "shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition",
              selected === g.slug
                ? "bg-neon-purple/20 border-neon-purple/50 shadow-neon"
                : "bg-white/5 border-white/10 hover:bg-white/10"
            )}
          >
            <span className="text-xl">{g.emoji}</span>
            <span>{g.title}</span>
          </button>
        ))}
      </div>

      {/* Selected board */}
      <div className="rounded-2xl overflow-hidden border border-white/10 mb-10">
        <div className="p-4 bg-gradient-to-r from-neon-purple/15 to-neon-cyan/10 border-b border-white/10">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span className="text-2xl">{GAMES.find((g) => g.slug === selected)?.emoji}</span>
            {GAMES.find((g) => g.slug === selected)?.title}
          </h2>
        </div>
        {entries.length === 0 ? (
          <div className="p-12 text-center text-white/40">
            No scores yet. <Link href={`/games/${selected}`} className="text-neon-cyan underline">Be the first!</Link>
          </div>
        ) : (
          <ol className="divide-y divide-white/5">
            {entries.slice(0, 50).map((e, i) => {
              const isYou = e.name === name;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <li
                  key={i}
                  className={cn(
                    "px-4 py-2.5 flex items-center gap-3 text-sm",
                    isYou && "bg-neon-cyan/10"
                  )}
                >
                  <div className="w-8 text-center">
                    {medal ? <span className="text-lg">{medal}</span> : <span className="text-white/40 tabular-nums">{i + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-bold truncate", isYou && "text-neon-cyan")}>{e.name}</span>
                      {isYou && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neon-cyan/20 text-neon-cyan">YOU</span>}
                    </div>
                    <div className="text-[10px] text-white/40">
                      {e.mode !== "default" && <span className="mr-2">{e.mode}</span>}
                      {new Date(e.at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="font-bold text-neon-yellow tabular-nums">{e.score.toLocaleString()}</div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* All-games overview */}
      <h2 className="text-sm uppercase tracking-wider text-white/50 mb-3">All game top scores</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(({ g, top }) => (
          <button
            key={g.slug}
            onClick={() => setSelected(g.slug)}
            className="text-left arcade-card p-4 flex items-center gap-3"
          >
            <div className="text-3xl">{g.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{g.title}</div>
              <div className="text-[11px] text-white/50 truncate">
                {top ? (
                  <>👑 <span className="text-white/70">{top.name}</span></>
                ) : "no scores yet"}
              </div>
            </div>
            <div className="text-lg pixel-font text-neon-yellow tabular-nums">
              {top ? top.score.toLocaleString() : "—"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
