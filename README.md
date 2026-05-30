# Arcade-15

15 polished, mobile-friendly browser games in one Next.js app. Hosted on Vercel.

**Games:** Wordle · 2048 · Tetris · Snake · Tic-Tac-Toe · Connect Four · Minesweeper · Memory Match · Flappy Bird · Doodle Jump · Breakout · Pong · Pac-Man · Asteroids · Chess

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS — dark neon arcade theme
- HTML5 Canvas for action games · React state for grid/turn-based
- `chess.js` for chess rules + custom alpha-beta AI
- WebAudio for chiptune SFX (no asset files needed)
- localStorage for stats, scores, settings, daily Wordle persistence

## Run

```bash
npm install
npm run dev   # http://localhost:3000
```

## Deploy

```bash
npm i -g vercel
vercel              # preview
vercel --prod       # production
```

Or push to GitHub and import the repo at https://vercel.com/new — zero config required.

## Project layout

- `app/page.tsx` — homepage grid (categories, search, recently played)
- `app/games/<slug>/page.tsx` — one route per game (15 of them)
- `app/leaderboard/`, `app/stats/` — personal-best summaries
- `components/GameShell.tsx` — shared header/controls/modal wrapper
- `lib/games-meta.ts` — single source of truth for the game catalog
- `lib/storage.ts` — typed localStorage helpers (high scores, stats, settings, player name)
- `lib/useGameLoop.ts`, `lib/useKeyboard.ts`, `lib/useTouchControls.ts`, `lib/useSound.ts` — shared hooks

## Features per game

- Score + personal best (localStorage)
- How-to-play modal · Settings modal (where applicable)
- Game-over modal with share button (Web Share API + clipboard fallback)
- Mobile touch controls (DPad, swipe gestures, drag) auto-mounted on touch devices
- Chiptune SFX + optional vibration (Vibration API) with global mute toggle
- Pause / resume / restart
- Fullscreen toggle
- Auto-pause on tab blur (canvas games)

## Global leaderboards (future)

The plan includes Vercel Postgres + Drizzle + NextAuth + KV cache + anti-cheat tokens.
To enable:

1. `vercel postgres create` and add `POSTGRES_URL` env var
2. `vercel kv create`
3. Add `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
4. Wire `app/api/scores/route.ts` (skeleton in plan)

Currently scores live in `localStorage` per device.

## Add a 16th game

1. Add to `lib/games-meta.ts`
2. Create `app/games/<slug>/page.tsx` using `<GameShell>` + the shared hooks
3. It'll appear on the homepage and stats page automatically.

## License

Code: MIT. Tetris piece definitions, chess rules, and game concepts are from public-domain prior art.
