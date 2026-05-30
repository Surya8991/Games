import { GAMES } from "./games-meta";

/** Deterministic "game of the day" — same for everyone, changes at UTC midnight. */
export function dailyGame() {
  const d = new Date();
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const idx = Math.floor(utc / 86400000) % GAMES.length;
  return GAMES[idx];
}

export function dailyDateLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
