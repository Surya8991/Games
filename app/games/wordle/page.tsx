"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { dailyAnswer, isValid, randomAnswer, ANSWERS } from "@/lib/wordle-words";
import { pushRecent, storage, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { unlock } from "@/lib/achievements";
import { cn } from "@/lib/cn";

type Letter = { ch: string; state: "correct" | "present" | "absent" | "empty" };
type Mode = "daily" | "unlimited";

const ROWS = 6;
const COLS = 5;
const KEYS = ["qwertyuiop".split(""), "asdfghjkl".split(""), ["enter", ..."zxcvbnm".split(""), "back"]];

function score(guess: string, answer: string): Letter[] {
  const res: Letter[] = guess.split("").map((ch) => ({ ch, state: "absent" }));
  const ansArr = answer.split("");
  const used = Array(COLS).fill(false);
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === ansArr[i]) {
      res[i].state = "correct";
      used[i] = true;
    }
  }
  for (let i = 0; i < COLS; i++) {
    if (res[i].state === "correct") continue;
    const j = ansArr.findIndex((c, k) => !used[k] && c === guess[i]);
    if (j >= 0) {
      res[i].state = "present";
      used[j] = true;
    }
  }
  return res;
}

export default function WordleGame() {
  const game = getGame("wordle")!;
  const [mode, setMode] = useState<Mode>("daily");
  const [answer, setAnswer] = useState<string>("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hardMode, setHardMode] = useState(false);
  const [streak, setStreak] = useState(0);
  const [dist, setDist] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const { play, vibrate } = useSound();

  const dayKey = useMemo(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  }, []);

  useEffect(() => {
    pushRecent("wordle");
    setStreak(storage.get<number>("wordle:streak", 0));
    setDist(storage.get<number[]>("wordle:dist", [0, 0, 0, 0, 0, 0]));
  }, []);

  const newGame = useCallback(
    (m: Mode = mode) => {
      const ans = m === "daily" ? dailyAnswer() : randomAnswer();
      setAnswer(ans);
      setMode(m);
      setGuesses([]);
      setCurrent("");
      setOver(false);
      setWon(false);
      if (m === "daily") {
        const saved = storage.get<{ key: string; guesses: string[]; over: boolean; won: boolean } | null>(
          "wordle:daily",
          null
        );
        if (saved && saved.key === dayKey) {
          setGuesses(saved.guesses);
          setOver(saved.over);
          setWon(saved.won);
        }
      }
    },
    [mode, dayKey]
  );

  useEffect(() => {
    newGame("daily");
  }, []); // eslint-disable-line

  const flash = (m: string) => {
    setToast(m);
    setShake(true);
    setTimeout(() => setShake(false), 400);
    setTimeout(() => setToast(null), 1400);
  };

  const submit = useCallback(() => {
    if (current.length !== COLS) {
      flash("Not enough letters");
      play("thud");
      return;
    }
    if (!isValid(current)) {
      flash("Not in word list");
      play("thud");
      return;
    }
    if (hardMode && guesses.length) {
      // require correct/present letters reused
      const prev = guesses[guesses.length - 1];
      const prevScored = score(prev, answer);
      for (let i = 0; i < COLS; i++) {
        if (prevScored[i].state === "correct" && current[i] !== prev[i]) {
          flash(`Letter ${i + 1} must be ${prev[i].toUpperCase()}`);
          play("thud");
          return;
        }
      }
      for (const l of prevScored.filter((x) => x.state === "present")) {
        if (!current.includes(l.ch)) {
          flash(`Must use ${l.ch.toUpperCase()}`);
          play("thud");
          return;
        }
      }
    }
    const next = [...guesses, current];
    setGuesses(next);
    setCurrent("");
    play("blip");
    vibrate(20);
    if (current === answer) {
      setOver(true);
      setWon(true);
      play("win");
      vibrate([60, 30, 60]);
      unlock("wordle-first-win");
      if (next.length <= 2) unlock("wordle-genius");
      const ndist = dist.slice();
      ndist[next.length - 1] += 1;
      setDist(ndist);
      storage.set("wordle:dist", ndist);
      if (mode === "daily") {
        const nstreak = streak + 1;
        setStreak(nstreak);
        storage.set("wordle:streak", nstreak);
        if (nstreak >= 5) unlock("wordle-streak-5");
      }
      updateStats("wordle", { plays: 1, wins: 1 });
      setTimeout(() => setShowStats(true), 800);
    } else if (next.length === ROWS) {
      setOver(true);
      setWon(false);
      play("lose");
      vibrate(120);
      if (mode === "daily") {
        setStreak(0);
        storage.set("wordle:streak", 0);
      }
      updateStats("wordle", { plays: 1, losses: 1 });
      setTimeout(() => setShowStats(true), 800);
    }
    if (mode === "daily") {
      storage.set("wordle:daily", {
        key: dayKey,
        guesses: next,
        over: current === answer || next.length === ROWS,
        won: current === answer,
      });
    }
  }, [current, guesses, answer, hardMode, mode, play, vibrate, dist, streak, dayKey]);

  const press = useCallback(
    (k: string) => {
      if (over) return;
      if (k === "enter") return submit();
      if (k === "back") {
        setCurrent((c) => c.slice(0, -1));
        return;
      }
      if (/^[a-z]$/.test(k) && current.length < COLS) {
        setCurrent((c) => c + k);
        play("tick");
      }
    },
    [submit, over, current.length, play]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "enter") press("enter");
      else if (k === "backspace") press("back");
      else if (/^[a-z]$/.test(k)) press(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const rows: Letter[][] = useMemo(() => {
    const out: Letter[][] = [];
    for (let r = 0; r < ROWS; r++) {
      if (r < guesses.length) out.push(score(guesses[r], answer));
      else if (r === guesses.length) {
        const padded = current.padEnd(COLS, " ");
        out.push(
          padded.split("").map((ch) => ({ ch: ch.trim(), state: "empty" }))
        );
      } else out.push(Array.from({ length: COLS }, () => ({ ch: "", state: "empty" })));
    }
    return out;
  }, [guesses, current, answer]);

  const keyState: Record<string, Letter["state"]> = useMemo(() => {
    const k: Record<string, Letter["state"]> = {};
    for (const g of guesses) {
      const s = score(g, answer);
      for (const { ch, state } of s) {
        const prior = k[ch];
        if (prior === "correct") continue;
        if (state === "correct" || (prior !== "present" && state === "present")) k[ch] = state;
        else if (!prior) k[ch] = state;
      }
    }
    return k;
  }, [guesses, answer]);

  const stateColor = (s: Letter["state"]) =>
    s === "correct"
      ? "bg-neon-green/80 border-neon-green text-black"
      : s === "present"
      ? "bg-neon-yellow/80 border-neon-yellow text-black"
      : s === "absent"
      ? "bg-white/10 border-white/10 text-white/50"
      : "border-white/20 text-white";

  const shareGrid = () => {
    const grid = guesses
      .map((g) =>
        score(g, answer)
          .map((l) => (l.state === "correct" ? "🟩" : l.state === "present" ? "🟨" : "⬛"))
          .join("")
      )
      .join("\n");
    const text = `Wordle ${won ? guesses.length : "X"}/6${hardMode ? "*" : ""}\n${grid}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => alert("Copied to clipboard!"));
  };

  return (
    <GameShell
      game={game}
      onRestart={() => newGame(mode === "daily" ? "unlimited" : "unlimited")}
      onOpenHowTo={() => setShowHow(true)}
      onOpenSettings={() => setShowSettings(true)}
      rightExtra={
        <button className="btn-ghost text-xs" onClick={() => setShowStats(true)}>
          Streak: <span className="ml-1 text-neon-yellow">{streak}</span>
        </button>
      }
    >
      <div className="text-xs text-white/50 mb-2">{mode === "daily" ? "Daily" : "Unlimited"}{hardMode ? " · Hard" : ""}</div>
      {toast && <div className="mb-2 px-3 py-1 rounded bg-white text-black text-xs font-medium">{toast}</div>}
      <div className={cn("grid grid-rows-6 gap-1.5 mb-5", shake && "animate-[shake_0.4s]")}>
        {rows.map((row, r) => (
          <div key={r} className="grid grid-cols-5 gap-1.5">
            {row.map((l, i) => (
              <div
                key={i}
                className={cn(
                  "w-12 h-12 sm:w-14 sm:h-14 grid place-items-center rounded border-2 pixel-font text-base sm:text-lg uppercase transition-all",
                  stateColor(l.state),
                  l.ch && l.state === "empty" && "border-neon-purple/50 scale-105"
                )}
              >
                {l.ch}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="space-y-1.5 w-full max-w-md">
        {KEYS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1 sm:gap-1.5">
            {row.map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                className={cn(
                  "px-2 sm:px-3 h-12 rounded text-sm font-bold uppercase transition select-none",
                  k === "enter" || k === "back" ? "px-3 sm:px-4 text-xs" : "min-w-[28px] sm:min-w-[36px]",
                  stateColor(keyState[k] ?? "empty"),
                  !keyState[k] && "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {k === "back" ? "⌫" : k}
              </button>
            ))}
          </div>
        ))}
      </div>

      <GameOverModal
        open={false}
        onClose={() => setOver(false)}
        score={won ? guesses.length : "X"}
      />
      <Modal
        open={showStats}
        onClose={() => setShowStats(false)}
        title="Statistics"
        footer={
          <div className="flex gap-2">
            <button onClick={shareGrid} className="btn-primary flex-1 justify-center">Share</button>
            {mode === "unlimited" && (
              <button onClick={() => { setShowStats(false); newGame("unlimited"); }} className="btn-ghost flex-1 justify-center">New word</button>
            )}
          </div>
        }
      >
        {over && (
          <div className="mb-4 text-center">
            <div className="text-lg">
              {won ? "Solved in " + guesses.length + "/6" : "Answer: "}
              {!won && <span className="pixel-font text-neon-cyan uppercase">{answer}</span>}
            </div>
            <div className="text-xs text-white/50 mt-1">Streak: <span className="text-neon-yellow">{streak}</span></div>
          </div>
        )}
        <div className="space-y-1">
          {dist.map((n, i) => {
            const max = Math.max(1, ...dist);
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-white/50">{i + 1}</span>
                <div className="flex-1 bg-white/5 rounded h-5">
                  <div
                    className="h-full bg-neon-green rounded grid place-items-end pr-2 text-black font-bold"
                    style={{ width: `${Math.max(8, (n / max) * 100)}%` }}
                  >
                    {n}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Guess the 5-letter word in 6 tries.</li>
          <li>🟩 = right letter, right spot · 🟨 = in the word, wrong spot · ⬛ = not in the word.</li>
          <li>Daily mode = one word per day. Unlimited = play forever.</li>
          <li>Hard mode: every guess must use previously revealed letters.</li>
        </ul>
      </Modal>
      <Modal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Settings"
        footer={
          <button onClick={() => { setShowSettings(false); newGame(mode); }} className="btn-primary w-full justify-center">
            Apply
          </button>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setMode("daily")} className={cn("flex-1 px-3 py-2 rounded-lg border text-sm", mode === "daily" ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>
              Daily
            </button>
            <button onClick={() => setMode("unlimited")} className={cn("flex-1 px-3 py-2 rounded-lg border text-sm", mode === "unlimited" ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>
              Unlimited
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hardMode} onChange={(e) => setHardMode(e.target.checked)} />
            Hard mode
          </label>
          <div className="text-xs text-white/50">Pool: {ANSWERS.length} possible answers</div>
        </div>
      </Modal>
    </GameShell>
  );
}
