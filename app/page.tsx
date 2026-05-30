"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Trophy, Sparkles, Award, Flame, Pencil, Gamepad2, Star, Shuffle, ArrowUpDown, Settings as SettingsIcon, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GAMES, GameCategory } from "@/lib/games-meta";
import { GameCard } from "@/components/GameCard";
import { getRecent, getPlayerName, getHighScore, storage, getFavorites, getStats } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { ACHIEVEMENTS, unlocked } from "@/lib/achievements";
import { dailyGame, dailyDateLabel } from "@/lib/daily-challenge";

const CATS: { id: "all" | "favorites" | GameCategory; label: string; emoji: string }[] = [
  { id: "all", label: "All", emoji: "🎮" },
  { id: "favorites", label: "Faves", emoji: "⭐" },
  { id: "puzzle", label: "Puzzle", emoji: "🧩" },
  { id: "classic", label: "Classic", emoji: "🕹️" },
  { id: "action", label: "Action", emoji: "💥" },
  { id: "board", label: "Board", emoji: "♟️" },
  { id: "3d", label: "3D", emoji: "🧊" },
];

type SortKey = "default" | "best" | "plays" | "az" | "recent" | "hot";

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | "favorites" | GameCategory>("all");
  const [sort, setSort] = useState<SortKey>("default");
  const [recent, setRecent] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [achCount, setAchCount] = useState(0);
  const [totalPlays, setTotalPlays] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showHot, setShowHot] = useState(false);
  const [mounted, setMounted] = useState(false);

  const load = () => {
    setRecent(getRecent());
    setName(getPlayerName());
    setAchCount(Object.keys(unlocked()).length);
    setTotalPlays(storage.get<number>("totalPlays", 0));
    setFavorites(getFavorites());
  };

  useEffect(() => {
    setMounted(true);
    load();
    const onChange = () => load();
    window.addEventListener("name-changed", onChange);
    window.addEventListener("achievement", onChange);
    window.addEventListener("favorites-changed", onChange);
    return () => {
      window.removeEventListener("name-changed", onChange);
      window.removeEventListener("achievement", onChange);
      window.removeEventListener("favorites-changed", onChange);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = GAMES.filter(
      (g) =>
        (cat === "all" ||
          (cat === "favorites" && favorites.includes(g.slug)) ||
          g.category === cat) &&
        (!showHot || g.hot) &&
        (!needle || g.title.toLowerCase().includes(needle) || g.blurb.toLowerCase().includes(needle))
    );
    if (mounted) {
      if (sort === "best") list = [...list].sort((a, b) => getHighScore(b.slug) - getHighScore(a.slug));
      else if (sort === "plays") list = [...list].sort((a, b) => getStats(b.slug).plays - getStats(a.slug).plays);
      else if (sort === "az") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
      else if (sort === "recent") list = [...list].sort((a, b) => (getStats(b.slug).lastPlayedAt ?? 0) - (getStats(a.slug).lastPlayedAt ?? 0));
      else if (sort === "hot") list = [...list].sort((a, b) => Number(!!b.hot) - Number(!!a.hot));
    }
    return list;
  }, [q, cat, showHot, sort, favorites, mounted]);

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
  }, [mounted, recent]);

  const daily = useMemo(() => dailyGame(), []);
  const dateLabel = mounted ? dailyDateLabel() : "";

  const playRandom = () => {
    const pool = filtered.length ? filtered : GAMES;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    router.push(`/games/${pick.slug}`);
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: GAMES.length, favorites: favorites.length };
    for (const g of GAMES) counts[g.category] = (counts[g.category] ?? 0) + 1;
    return counts;
  }, [favorites]);

  return (
    <div className="min-h-screen safe-pad">
      {/* HERO */}
      <header className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-6">
        <div className="absolute -top-10 -left-10 w-72 h-72 bg-neon-purple/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-neon-cyan/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 left-1/3 w-48 h-48 bg-neon-pink/15 rounded-full blur-3xl pointer-events-none" />

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-white/40 mb-2">
                <Gamepad2 size={14} /> Browser Arcade · {GAMES.length} games
              </div>
              <h1 className="pixel-font text-3xl sm:text-5xl md:text-6xl neon-text leading-tight">
                ARCADE-{GAMES.length}
              </h1>
              <p className="mt-3 text-sm sm:text-base text-white/60 max-w-xl">
                Classic arcade, modern web. Free to play · mobile-friendly · zero install · {GAMES.filter((g) => g.category === "3d").length} 3D games.
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
                  <Zap size={14} className="text-neon-cyan" />
                  <span className="text-sm"><b className="text-neon-cyan">{totalPlays}</b> <span className="text-white/40">plays</span></span>
                </Link>
                <button onClick={playRandom} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neon-pink/15 border border-neon-pink/40 hover:bg-neon-pink/25 transition text-sm text-neon-pink">
                  <Shuffle size={14} /> Random
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/leaderboard" className="btn-primary">
                <Trophy size={16} /> Leaderboards
              </Link>
              <Link href="/settings" className="btn-ghost" aria-label="Settings">
                <SettingsIcon size={16} />
              </Link>
            </div>
          </div>
        </motion.div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        {/* DAILY CHALLENGE */}
        <Link
          href={`/games/${daily.slug}`}
          className="block mb-8 p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-neon-purple/25 via-neon-pink/15 to-neon-cyan/25 border-2 border-neon-purple/40 hover:border-neon-purple/80 transition shadow-neon overflow-hidden relative"
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

        {/* QUICK STATS GRID */}
        {mounted && totalPlays > 0 && (
          <section className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total plays", value: totalPlays, color: "text-neon-cyan" },
              { label: "Best score", value: topScores[0] ? topScores[0].score.toLocaleString() : "—", color: "text-neon-yellow" },
              { label: "Favorites", value: favorites.length, color: "text-neon-pink" },
              { label: "Achievements", value: `${achCount}/${ACHIEVEMENTS.length}`, color: "text-neon-purple" },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-xl bg-bg-card/60 border border-white/5">
                <div className="text-[10px] text-white/40 uppercase tracking-wide">{s.label}</div>
                <div className={cn("text-2xl pixel-font tabular-nums", s.color)}>{s.value}</div>
              </div>
            ))}
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
        <section className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-bg/90 backdrop-blur">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search games (e.g. tetris, mario, sudoku)..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple/60 focus:outline-none text-sm"
                />
              </div>
              <div className="relative">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="appearance-none pl-9 pr-8 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple/60 outline-none text-sm cursor-pointer"
                >
                  <option value="default">Default</option>
                  <option value="hot">🔥 Hot first</option>
                  <option value="recent">Recently played</option>
                  <option value="best">Best score</option>
                  <option value="plays">Most plays</option>
                  <option value="az">A → Z</option>
                </select>
                <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              </div>
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
                  <span className="text-[10px] text-white/40">({categoryCounts[c.id] ?? 0})</span>
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
                <Flame size={12} /> Hot only
              </button>
            </div>
          </div>
        </section>

        {/* GAME GRID */}
        <section className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-wider text-white/50">
              {cat === "favorites" ? "Your favorites" : filtered.length === GAMES.length ? "All games" : `${filtered.length} game${filtered.length !== 1 ? "s" : ""}`}
            </h2>
            {filtered.length > 0 && (
              <button onClick={playRandom} className="text-xs text-white/50 hover:text-neon-pink inline-flex items-center gap-1">
                <Shuffle size={12} /> Random from filtered
              </button>
            )}
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-white/40 mb-3">{cat === "favorites" ? "No favorites yet. Tap ⭐ on any game card to add it here." : "No games match your filters."}</p>
              {cat === "favorites" && <button onClick={() => setCat("all")} className="btn-ghost text-sm">Browse all games</button>}
            </div>
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
            Built with Next.js + Three.js · Hosted on Vercel · Free to play
          </p>
          <p className="space-x-3">
            <Link href="/stats" className="hover:text-neon-cyan">Stats</Link>
            <Link href="/achievements" className="hover:text-neon-yellow">Achievements</Link>
            <Link href="/leaderboard" className="hover:text-neon-purple">Leaderboards</Link>
            <Link href="/settings" className="hover:text-neon-pink">Settings</Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
