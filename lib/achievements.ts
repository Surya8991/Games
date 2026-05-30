"use client";

import { storage } from "./storage";

export type Achievement = {
  id: string;
  game: string; // slug or "global"
  title: string;
  desc: string;
  icon: string;
  goal: number; // for progress
};

export const ACHIEVEMENTS: Achievement[] = [
  // Global
  { id: "first-play", game: "global", title: "Welcome to the Arcade", desc: "Play any game once", icon: "🎮", goal: 1 },
  { id: "ten-games", game: "global", title: "Sampler", desc: "Play 10 different games", icon: "🍱", goal: 10 },
  { id: "all-games", game: "global", title: "Completionist", desc: "Play all 15 games at least once", icon: "🏅", goal: 15 },
  { id: "century", game: "global", title: "Centurion", desc: "Total 100 plays across all games", icon: "💯", goal: 100 },
  { id: "night-owl", game: "global", title: "Night Owl", desc: "Play after midnight", icon: "🌙", goal: 1 },

  // Wordle
  { id: "wordle-first-win", game: "wordle", title: "Wordsmith", desc: "Win a Wordle game", icon: "🟩", goal: 1 },
  { id: "wordle-streak-5", game: "wordle", title: "5-Day Streak", desc: "Win 5 daily Wordles in a row", icon: "🔥", goal: 5 },
  { id: "wordle-genius", game: "wordle", title: "Genius", desc: "Solve in 2 guesses", icon: "🧠", goal: 1 },

  // 2048
  { id: "2048-reach-1024", game: "2048", title: "Big Numbers", desc: "Reach the 1024 tile", icon: "🔢", goal: 1 },
  { id: "2048-win", game: "2048", title: "2048!", desc: "Reach the 2048 tile", icon: "🏆", goal: 1 },
  { id: "2048-master", game: "2048", title: "Master", desc: "Reach the 4096 tile", icon: "👑", goal: 1 },

  // Tetris
  { id: "tetris-first-line", game: "tetris", title: "Line Clear", desc: "Clear your first line", icon: "📏", goal: 1 },
  { id: "tetris-tetris", game: "tetris", title: "TETRIS!", desc: "Clear 4 lines at once", icon: "🟦", goal: 1 },
  { id: "tetris-sprint", game: "tetris", title: "Sprinter", desc: "Finish 40-line sprint", icon: "🏃", goal: 1 },

  // Snake
  { id: "snake-10", game: "snake", title: "Snack Time", desc: "Eat 10 apples", icon: "🍎", goal: 1 },
  { id: "snake-50", game: "snake", title: "Anaconda", desc: "Eat 50 apples in one game", icon: "🐍", goal: 1 },
  { id: "snake-lvl-50", game: "snake", title: "Maze Master", desc: "Clear level 50", icon: "🗺️", goal: 1 },

  // Tic-Tac-Toe
  { id: "ttt-beat-hard", game: "tic-tac-toe", title: "Untouchable", desc: "Beat or draw the unbeatable AI", icon: "❌", goal: 1 },

  // Connect Four
  { id: "c4-beat-hard", game: "connect-four", title: "Strategist", desc: "Beat AI Hard", icon: "🔴", goal: 1 },

  // Minesweeper
  { id: "mine-beginner", game: "minesweeper", title: "Sweeper", desc: "Clear Beginner", icon: "💣", goal: 1 },
  { id: "mine-expert", game: "minesweeper", title: "Bomb Squad", desc: "Clear Expert", icon: "🚨", goal: 1 },

  // Memory
  { id: "memory-6x6", game: "memory", title: "Elephant", desc: "Complete a 6×6 board", icon: "🧠", goal: 1 },

  // Flappy
  { id: "flappy-bronze", game: "flappy", title: "Bronze Wings", desc: "Score 7+ in Flappy", icon: "🥉", goal: 1 },
  { id: "flappy-platinum", game: "flappy", title: "Platinum Wings", desc: "Score 40+ in Flappy", icon: "🏆", goal: 1 },

  // Doodle Jump
  { id: "doodle-5k", game: "doodle-jump", title: "Sky High", desc: "Reach 5,000 height", icon: "🦘", goal: 1 },

  // Breakout
  { id: "breakout-lvl-10", game: "breakout", title: "Brick Smasher", desc: "Clear level 10", icon: "🧱", goal: 1 },
  { id: "breakout-lvl-50", game: "breakout", title: "Demolition Expert", desc: "Clear level 50", icon: "💥", goal: 1 },
  { id: "breakout-lvl-100", game: "breakout", title: "Legend", desc: "Clear ALL 100 levels", icon: "👑", goal: 1 },

  // Pong
  { id: "pong-win-hard", game: "pong", title: "Reflex", desc: "Beat 1P Hard", icon: "🏓", goal: 1 },

  // Pac-Man
  { id: "pacman-lvl-3", game: "pacman", title: "Ghost Hunter", desc: "Reach Pac-Man level 3", icon: "👻", goal: 1 },

  // Asteroids
  { id: "asteroids-wave-5", game: "asteroids", title: "Space Cowboy", desc: "Survive wave 5", icon: "🚀", goal: 1 },

  // Chess
  { id: "chess-checkmate", game: "chess", title: "Checkmate!", desc: "Checkmate the AI", icon: "♟️", goal: 1 },
  { id: "chess-beat-hard", game: "chess", title: "Grandmaster", desc: "Beat AI Hard", icon: "👑", goal: 1 },
];

const KEY = "achievements";

export function unlocked(): Record<string, number> {
  return storage.get<Record<string, number>>(KEY, {});
}

export function isUnlocked(id: string) {
  return !!unlocked()[id];
}

export function unlock(id: string): boolean {
  const u = unlocked();
  if (u[id]) return false;
  u[id] = Date.now();
  storage.set(KEY, u);
  // Fire toast event
  if (typeof window !== "undefined") {
    const ach = ACHIEVEMENTS.find((a) => a.id === id);
    if (ach) window.dispatchEvent(new CustomEvent("achievement", { detail: ach }));
  }
  return true;
}

export function unlockMany(ids: string[]) {
  ids.forEach(unlock);
}
