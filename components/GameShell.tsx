"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, RotateCcw, Pause, Play, Settings, Volume2, VolumeX, Maximize2, Trophy, HelpCircle } from "lucide-react";
import { getSettings, setSettings } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { GameMeta } from "@/lib/games-meta";

type Props = {
  game: GameMeta;
  score?: React.ReactNode;
  best?: React.ReactNode;
  paused?: boolean;
  onTogglePause?: () => void;
  onRestart?: () => void;
  onOpenSettings?: () => void;
  onOpenHowTo?: () => void;
  onOpenLeaderboard?: () => void;
  children: React.ReactNode;
  rightExtra?: React.ReactNode;
  bottomBar?: React.ReactNode;
};

export function GameShell({
  game,
  score,
  best,
  paused,
  onTogglePause,
  onRestart,
  onOpenSettings,
  onOpenHowTo,
  onOpenLeaderboard,
  children,
  rightExtra,
  bottomBar,
}: Props) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(!getSettings().sound);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSettings({ sound: !next });
    window.dispatchEvent(new Event("storage"));
  };

  const goFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div className="min-h-screen safe-pad flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur bg-bg/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-3 flex items-center gap-2">
          <Link href="/" className="btn-ghost shrink-0" aria-label="Back to lobby">
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">Lobby</span>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl select-none">{game.emoji}</span>
            <div className="min-w-0">
              <h1 className={cn("pixel-font text-sm sm:text-base truncate", game.accent)}>
                {game.title}
              </h1>
              <p className="text-[10px] sm:text-xs text-white/50 hidden sm:block">
                {game.controls.join(" · ")}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            {score !== undefined && (
              <div className="px-2 sm:px-3 py-1 rounded-md bg-white/5 border border-white/10">
                <span className="text-white/50">Score </span>
                <span className="font-bold text-white tabular-nums">{score}</span>
              </div>
            )}
            {best !== undefined && (
              <div className="hidden sm:block px-3 py-1 rounded-md bg-white/5 border border-white/10">
                <span className="text-white/50">Best </span>
                <span className="font-bold tabular-nums text-neon-yellow">{best}</span>
              </div>
            )}
            {rightExtra}
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-3 sm:px-5 pb-2 flex items-center gap-1 flex-wrap">
          {onTogglePause && (
            <button onClick={onTogglePause} className="btn-ghost" aria-label="Pause">
              {paused ? <Play size={16} /> : <Pause size={16} />}
              <span className="hidden sm:inline">{paused ? "Resume" : "Pause"}</span>
            </button>
          )}
          {onRestart && (
            <button onClick={onRestart} className="btn-ghost" aria-label="Restart">
              <RotateCcw size={16} />
              <span className="hidden sm:inline">Restart</span>
            </button>
          )}
          {onOpenHowTo && (
            <button onClick={onOpenHowTo} className="btn-ghost" aria-label="How to play">
              <HelpCircle size={16} />
              <span className="hidden sm:inline">How to play</span>
            </button>
          )}
          {onOpenLeaderboard && (
            <button onClick={onOpenLeaderboard} className="btn-ghost" aria-label="Leaderboard">
              <Trophy size={16} />
              <span className="hidden sm:inline">Leaderboard</span>
            </button>
          )}
          {onOpenSettings && (
            <button onClick={onOpenSettings} className="btn-ghost" aria-label="Settings">
              <Settings size={16} />
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}
          <button onClick={toggleMute} className="btn-ghost" aria-label="Toggle sound">
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button onClick={goFullscreen} className="btn-ghost ml-auto" aria-label="Fullscreen">
            <Maximize2 size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-5 py-4 sm:py-6 flex flex-col items-center">
        {children}
      </main>

      {bottomBar && (
        <div className="sticky bottom-0 z-20 bg-bg/80 backdrop-blur border-t border-white/5 safe-pad">
          <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2">{bottomBar}</div>
        </div>
      )}
    </div>
  );
}
