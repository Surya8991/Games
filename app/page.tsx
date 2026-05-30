"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Trophy, Sparkles, Award, Flame, Pencil, Gamepad2, Star } from "lucide-react";
import Link from "next/link";
import { GAMES, GameCategory } from "@/lib/games-meta";
import { GameCard } from "@/components/GameCard";
import { getRecent, getPlayerName, getHighScore, storage } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { ACHIEVEMENTS, unlocked } from "@/lib/achievements";
import { dailyGame, dailyDateLabel } from "@/lib/daily-challenge";

const CATS: { id: "all" | GameCategory; label: string; emoji: string }[] = [
  { id: "all", label: "All", emoji: "🎮" },
  { id: "puzzle", label: "Puzzle", emoji: "🧩" },
  { id: "classic", label: "Classic", emoji: "🕹️" },
  { id: "action", label: "Action", emoji: "💥" },
  { id: "board", label: "Board", emoji: "♟️" },
];

export default function Home() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | GameCategory>("all");
  const [recent, setRecent] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [achCount, setAchCount] = useState(0);
  const [totalPlays, setTotalPlays] = useState(0);
  const [showHot, setShowHot] = useState(false);
  const [mounted, setMounted] = useState(false);

  const load = () => {
    setRecent(getRecent());
    setName(getPlayerName());
    setAchCount(Object.keys(unlocked()).length);
    setTotalPlays(storage.get<number>("totalPlays", 0));
  };

  useEffect(() => {
    setMounted(true);
    load();
    const onChange = () => load();
    window.addEventListener("name-changed", onChange);
    window.addEventListener("achievement", onChange);
    return () => {
      window.removeEventListener("name-changed", onChange);
      window.removeEventListener("achievement", onChange);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return GAMES.filter(
      (g) =>
        (cat === "all" || g.category === cat) &&
        (!showHot || g.hot) &&
        (!needle || g.title.toLowerCase().includes(needle) || g.blurb.toLowerCase().includes(needle))
    );
  }, [q, cat, showHot]);

  const recentGames = useMemo(
    () => recent.map((s) => GAMES.find((g) => g.slug === s)).filter(Boolean) as typeof GAMES,
    [recent]
  );

  const topScores = useMemo(() => {
    if (!mounted) return [];
    return GAMES
      .map((g) => ({ g, score: getHighScore(g.slug) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [mounted, recent]); // refresh on mount + recent change

  const daily = useMemo(() => dailyGame(), []);
  const dateLabel = mounted ? dailyDateLabel() : "";

  return (
    <div className="min-h-screen safe-pad">
      {/* HERO */}
      <header className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-6">
        <div className="absolute -top-10 -left-10 w-72 h-72 bg-neon-purple/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-neon-cyan/15 rounded-full blur-3xl pointer-events-none" />

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-white/40 mb-2">
                <Gamepad2 size={14} /> Browser Arcade
              </div>
              <h1 className="pixel-font text-3xl sm:text-5xl md:text-6xl neon-text leading-tight">
                ARCADE-{GAMES.length}
              </h1>
              <p className="mt-3 text-sm sm:text-base text-white/60 max-w-xl">
                {GAMES.length} polished classic games in one tab. Mobile-friendly · zero install · global ambitions.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => window.dispatchEvent(new Event("edit-name"))}
                  className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:border-neon-purple/50 transition"
                >
                  <span className="text-xs text-white/50">Playing as</span>
                  <span className="text-sm font-bold text-neon-cyan">{name || "Player"}</span>
                  <Pencil size={12} className="text-white/40 group-hover:text-neon-purple" />
                </button>
                <Link href="/achievements" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neon-yellow/10 border border-neon-yellow/30 hover:bg-neon-yellow/20 transition">
                  <Award size={14} className="text-neon-yellow" />
                  <span className="text-sm"><b className="text-neon-yellow">{achCount}</b><span className="text-white/40">/{ACHIEVEMENTS.length}</span></span>
                </Link>
                <Link href="/stats" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 hover:bg-neon-cyan/20 transition">
                  <Star size={14} className="text-neon-cyan" />
                  <span className="text-sm"><b className="text-neon-cyan">{totalPlays}</b> <span className="text-white/40">plays</span></span>
                </Link>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/leaderboard" className="btn-primary">
                <Trophy size={16} /> Leaderboards
              </Link>
            </div>
          </div>
        </motion.div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        {/* DAILY CHALLENGE */}
        <Link
          href={`/games/${daily.slug}`}
          className="block mb-10 p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-neon-purple/25 via-neon-pink/15 to-neon-cyan/25 border-2 border-neon-purple/40 hover:border-neon-purple/80 transition shadow-neon overflow-hidden relative"
        >
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-neon-yellow/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-5 relative">
            <motion.div
              animate={{ rotate: [0, -8, 8, 0], y: [0, -4, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="text-6xl sm:text-7xl shrink-0"
            >
              {daily.emoji}
            </motion.div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-neon-pink mb-1">
                <Flame size={12} /> Daily Challenge · {dateLabel}
              </div>
              <h2 className={cn("pixel-font text-xl sm:text-3xl truncate", daily.accent)}>{daily.title}</h2>
              <p className="text-xs sm:text-sm text-white/70 line-clamp-1">{daily.blurb}</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-neon-cyan text-sm pixel-font shrink-0">
              PLAY <span className="animate-pulse">→</span>
            </div>
          </div>
        </Link>

        {/* TOP SCORES STRIP */}
        {topScores.length > 0 && (
          <section className="mb-10">
            <h2 className="flex items-center gap-2 text-sm uppercase tracking-wider text-white/50 mb-3">
              <Trophy size={14} /> Your top scores
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {topScores.map(({ g, score }) => (
                <Link
                  key={g.slug}
                  href={`/games/${g.slug}`}
                  className="flex items-center gap-2 p-3 rounded-xl bg-bg-card/60 border border-white/5 hover:border-neon-yellow/40 transition"
                >
                  <div className="text-2xl">{g.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white/50 truncate">{g.title}</div>
                    <div className="text-base font-bold text-neon-yellow tabular-nums">{score.toLocaleString()}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* RECENTLY PLAYED */}
        {recentGames.length > 0 && (
          <section className="mb-10">
            <h2 className="flex items-center gap-2 text-sm uppercase tracking-wider text-white/50 mb-3">
              <Sparkles size={14} /> Recently played
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {recentGames.slice(0, 6).map((g, i) => (
                <GameCard key={g.slug} game={g} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* FILTERS */}
        <section className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-bg/85 backdrop-blur">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search games (e.g. tetris, chess, mario)..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple/60 focus:outline-none text-sm"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto -mx-1 px-1 scrollbar-hide">
              {CATS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={cn(
                    "px-3 py-2 rounded-xl text-xs whitespace-nowrap border transition flex items-center gap-1.5",
                    cat === c.id
                      ? "bg-neon-purple/20 border-neon-purple/50 text-white shadow-neon"
                      : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                  )}
                >
                  <span>{c.emoji}</span> {c.label}
                </button>
              ))}
              <button
                onClick={() => setShowHot((h) => !h)}
                className={cn(
                  "px-3 py-2 rounded-xl text-xs whitespace-nowrap border transition flex items-center gap-1.5",
                  showHot
                    ? "bg-neon-pink/20 border-neon-pink/50 text-neon-pink shadow-neon"
                    : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                )}
              >
                <Flame size={12} /> Hot
              </button>
            </div>
          </div>
        </section>

        {/* GAME GRID */}
        <section className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-wider text-white/50">
              {filtered.length === GAMES.length ? "All games" : `${filtered.length} game${filtered.length !== 1 ? "s" : ""}`}
            </h2>
          </div>
          {filtered.length === 0 ? (
            <p className="text-center text-white/40 py-12">No games match your filters.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {filtered.map((g, i) => (
                <GameCard key={g.slug} game={g} index={i} />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-16 pt-8 border-t border-white/5 text-center text-xs text-white/40 space-y-2">
          <p>
            Built with Next.js · Hosted on Vercel · Mobile-friendly · Free to play
          </p>
          <p className="space-x-3">
            <Link href="/stats" className="hover:text-neon-cyan">Stats</Link>
            <Link href="/achievements" className="hover:text-neon-yellow">Achievements</Link>
            <Link href="/leaderboard" className="hover:text-neon-purple">Leaderboards</Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
