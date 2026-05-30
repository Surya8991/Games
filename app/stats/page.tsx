"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GAMES } from "@/lib/games-meta";
import { getStats, getHighScore, getPlayerName } from "@/lib/storage";

export default function StatsPage() {
  const [rows, setRows] = useState<{ slug: string; title: string; emoji: string; plays: number; best: number; wins: number; losses: number; lastPlayed?: number }[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    setName(getPlayerName());
    setRows(
      GAMES.map((g) => {
        const s = getStats(g.slug);
        return {
          slug: g.slug,
          title: g.title,
          emoji: g.emoji,
          plays: s.plays,
          best: Math.max(s.bestScore, getHighScore(g.slug)),
          wins: s.wins,
          losses: s.losses,
          lastPlayed: s.lastPlayedAt,
        };
      })
    );
  }, []);

  const totalPlays = rows.reduce((a, b) => a + b.plays, 0);

  return (
    <div className="min-h-screen safe-pad max-w-4xl mx-auto px-4 py-8">
      <Link href="/" className="btn-ghost mb-4"><ArrowLeft size={16} /> Back to lobby</Link>
      <h1 className="pixel-font text-2xl neon-text mb-2">Your Stats</h1>
      <p className="text-sm text-white/60 mb-6">Player: <span className="text-neon-cyan">{name}</span> · Total plays: <span className="text-neon-yellow">{totalPlays}</span></p>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr className="text-left text-white/60">
              <th className="px-3 py-2">Game</th>
              <th className="px-3 py-2 text-right">Plays</th>
              <th className="px-3 py-2 text-right">Best</th>
              <th className="px-3 py-2 text-right">W/L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} className="border-t border-white/5 hover:bg-white/3">
                <td className="px-3 py-2">
                  <Link href={`/games/${r.slug}`} className="flex items-center gap-2 hover:text-neon-purple">
                    <span className="text-xl">{r.emoji}</span> {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.plays}</td>
                <td className="px-3 py-2 text-right tabular-nums text-neon-yellow">{r.best || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/60">{r.wins}/{r.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
