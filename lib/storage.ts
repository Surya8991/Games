"use client";

const PREFIX = "arcade15:";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // quota exceeded or disabled — ignore
  }
}

export const storage = {
  get: read,
  set: write,
  remove(key: string) {
    if (typeof window === "undefined") return;
    localStorage.removeItem(PREFIX + key);
  },
};

// Per-game high-score helpers
export function getHighScore(slug: string, mode = "default"): number {
  return read<number>(`hs:${slug}:${mode}`, 0);
}
export function setHighScore(slug: string, score: number, mode = "default"): boolean {
  // Always record into the local leaderboard (top-50)
  if (score > 0) pushLeaderboard(slug, score, mode);
  const cur = getHighScore(slug, mode);
  if (score > cur) {
    write(`hs:${slug}:${mode}`, score);
    return true;
  }
  return false;
}

// Local leaderboard: top-10 per game/mode with player name + timestamp
export type LBEntry = { name: string; score: number; mode: string; at: number };
export function pushLeaderboard(slug: string, score: number, mode = "default") {
  if (typeof window === "undefined") return;
  const key = `lb:${slug}`;
  const list = read<LBEntry[]>(key, []);
  const name = getPlayerName();
  list.push({ name, score, mode, at: Date.now() });
  // keep top 50 by score desc
  list.sort((a, b) => b.score - a.score);
  write(key, list.slice(0, 50));
}
export function getLeaderboard(slug: string): LBEntry[] {
  return read<LBEntry[]>(`lb:${slug}`, []);
}

// Generic stats bucket per game
export type GameStats = {
  plays: number;
  wins: number;
  losses: number;
  bestScore: number;
  bestTimeMs?: number;
  lastPlayedAt?: number;
};

export function getStats(slug: string): GameStats {
  return read<GameStats>(`stats:${slug}`, {
    plays: 0,
    wins: 0,
    losses: 0,
    bestScore: 0,
  });
}

export function updateStats(slug: string, patch: Partial<GameStats>) {
  const cur = getStats(slug);
  const next = { ...cur, ...patch, lastPlayedAt: Date.now() };
  write(`stats:${slug}`, next);
  return next;
}

// Player handle
export function getPlayerName(): string {
  let n = read<string>("player:name", "");
  if (!n) {
    const animals = ["Tiger", "Falcon", "Otter", "Lynx", "Wolf", "Raven", "Panda", "Koala", "Fox"];
    const adjectives = ["Neon", "Pixel", "Turbo", "Cosmic", "Hyper", "Retro", "Quantum"];
    const a = adjectives[Math.floor(Math.random() * adjectives.length)];
    const b = animals[Math.floor(Math.random() * animals.length)];
    const num = Math.floor(Math.random() * 900) + 100;
    n = `${a}${b}${num}`;
    write("player:name", n);
  }
  return n;
}
export function setPlayerName(name: string) {
  write("player:name", name);
}

// Recently played
export function pushRecent(slug: string) {
  const list = read<string[]>("recent", []);
  const next = [slug, ...list.filter((s) => s !== slug)].slice(0, 12);
  write("recent", next);
  // Played-games set
  const played = new Set(read<string[]>("played", []));
  const before = played.size;
  played.add(slug);
  if (played.size !== before) write("played", Array.from(played));
  // Total plays counter
  const total = read<number>("totalPlays", 0) + 1;
  write("totalPlays", total);
  // Fire achievements (lazy import to keep server bundles clean)
  if (typeof window !== "undefined") {
    import("./achievements").then(({ unlock }) => {
      unlock("first-play");
      if (played.size >= 10) unlock("ten-games");
      if (played.size >= 15) unlock("all-games");
      if (total >= 100) unlock("century");
      const hour = new Date().getHours();
      if (hour < 4 || hour >= 23) unlock("night-owl");
    });
  }
}
export function getRecent(): string[] {
  return read<string[]>("recent", []);
}

// Settings: sound, music, vibration
export type GlobalSettings = {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  scanlines: boolean;
};
export function getSettings(): GlobalSettings {
  return read<GlobalSettings>("settings", {
    sound: true,
    music: false,
    vibration: true,
    scanlines: false,
  });
}
export function setSettings(s: Partial<GlobalSettings>) {
  const cur = getSettings();
  write("settings", { ...cur, ...s });
}
