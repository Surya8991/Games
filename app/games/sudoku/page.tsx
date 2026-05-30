"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { generate, isComplete, findErrors, Board } from "@/lib/sudoku";
import { cn } from "@/lib/cn";
import { Eraser, Lightbulb, Pencil } from "lucide-react";

type Diff = "easy" | "med" | "hard" | "expert";
const DIFF_LABELS: Record<Diff, string> = { easy: "Easy", med: "Medium", hard: "Hard", expert: "Expert" };

export default function SudokuGame() {
  const game = getGame("sudoku")!;
  const [diff, setDiff] = useState<Diff>("easy");
  const [puzzle, setPuzzle] = useState<Board>([]);
  const [solution, setSolution] = useState<Board>([]);
  const [given, setGiven] = useState<boolean[][]>([]);
  const [board, setBoard] = useState<Board>([]);
  const [notes, setNotes] = useState<Set<number>[][]>([]);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [hints, setHints] = useState(3);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [bestTime, setBestTime] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { play, vibrate } = useSound();

  const reset = useCallback((d: Diff = diff) => {
    const { puzzle, solution } = generate(d);
    setPuzzle(puzzle);
    setSolution(solution);
    setGiven(puzzle.map((r) => r.map((v) => v !== 0)));
    setBoard(puzzle.map((r) => r.slice()));
    setNotes(Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set<number>())));
    setSel(null);
    setNotesMode(false);
    setHints(3);
    setTime(0);
    setRunning(true);
    setOver(false);
    setDiff(d);
    setBestTime(getHighScore("sudoku", `t-${d}`));
  }, [diff]);

  useEffect(() => {
    pushRecent("sudoku");
    reset("easy");
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!running || over) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running, over]);

  const errors = useMemo(() => board.length ? findErrors(board, solution) : [], [board, solution]);

  const setCell = (n: number) => {
    if (!sel || over) return;
    const [r, c] = sel;
    if (given[r][c]) return;
    if (notesMode && n !== 0) {
      setNotes((nz) => {
        const cp = nz.map((row) => row.slice());
        const s = new Set(cp[r][c]);
        if (s.has(n)) s.delete(n); else s.add(n);
        cp[r][c] = s;
        return cp;
      });
      play("tick");
      return;
    }
    setBoard((b) => {
      const nb = b.map((row) => row.slice());
      nb[r][c] = n;
      if (n !== 0) {
        // clear notes for this cell + same row/col/box
        setNotes((nz) => {
          const cp = nz.map((row) => row.slice());
          cp[r][c] = new Set();
          for (let i = 0; i < 9; i++) {
            cp[r][i] = new Set([...cp[r][i]].filter((x) => x !== n));
            cp[i][c] = new Set([...cp[i][c]].filter((x) => x !== n));
          }
          const r0 = Math.floor(r / 3) * 3, c0 = Math.floor(c / 3) * 3;
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cp[r0 + i][c0 + j] = new Set([...cp[r0 + i][c0 + j]].filter((x) => x !== n));
          return cp;
        });
      }
      play(n === 0 ? "tick" : "click");
      vibrate(8);
      if (isComplete(nb) && nb.every((row, ri) => row.every((v, ci) => v === solution[ri][ci]))) {
        setRunning(false);
        setOver(true);
        const prev = getHighScore("sudoku", `t-${diff}`);
        if (prev === 0 || time < prev) { setHighScore("sudoku", time, `t-${diff}`); setBestTime(time); }
        updateStats("sudoku", { plays: 1, wins: 1 });
        play("win"); vibrate([40, 30, 60]);
      }
      return nb;
    });
  };

  const useHint = () => {
    if (!sel || hints <= 0) return;
    const [r, c] = sel;
    if (given[r][c]) return;
    setBoard((b) => { const nb = b.map((row) => row.slice()); nb[r][c] = solution[r][c]; return nb; });
    setHints((h) => h - 1);
    play("ding");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k >= "1" && k <= "9") { e.preventDefault(); setCell(parseInt(k)); }
      else if (k === "0" || k === "Backspace" || k === "Delete") { e.preventDefault(); setCell(0); }
      else if (sel) {
        const [r, c] = sel;
        if (k === "ArrowUp" && r > 0) setSel([r - 1, c]);
        else if (k === "ArrowDown" && r < 8) setSel([r + 1, c]);
        else if (k === "ArrowLeft" && c > 0) setSel([r, c - 1]);
        else if (k === "ArrowRight" && c < 8) setSel([r, c + 1]);
      }
      if (k === "n" || k === "N") setNotesMode((m) => !m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const selVal = sel && board[sel[0]] ? board[sel[0]][sel[1]] : 0;

  if (!board.length) return <div className="p-8 text-center">Generating…</div>;

  return (
    <GameShell
      game={game}
      score={fmt(time)}
      best={bestTime ? fmt(bestTime) : "—"}
      onRestart={() => reset()}
      onOpenHowTo={() => setShowHow(true)}
      onOpenSettings={() => setShowSettings(true)}
      rightExtra={<span className="text-xs text-white/60">{DIFF_LABELS[diff]}</span>}
    >
      <div className="grid grid-cols-9 gap-px bg-white/20 p-1 rounded-xl shadow-neon">
        {board.map((row, r) =>
          row.map((v, c) => {
            const isSel = sel && sel[0] === r && sel[1] === c;
            const sameVal = selVal && v === selVal;
            const sameRC = sel && (sel[0] === r || sel[1] === c || (Math.floor(sel[0] / 3) === Math.floor(r / 3) && Math.floor(sel[1] / 3) === Math.floor(c / 3)));
            const err = errors[r]?.[c];
            const isGiven = given[r][c];
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => setSel([r, c])}
                className={cn(
                  "relative aspect-square w-8 sm:w-10 md:w-12 grid place-items-center font-bold text-lg sm:text-xl transition",
                  isSel ? "bg-neon-purple/40 ring-2 ring-neon-cyan z-10" :
                  sameVal ? "bg-neon-yellow/15" :
                  sameRC ? "bg-white/8" : "bg-bg-soft",
                  err && !isGiven && "text-neon-pink",
                  isGiven ? "text-white" : "text-neon-cyan",
                  // box borders
                  c % 3 === 2 && c !== 8 && "border-r-2 border-r-white/30",
                  r % 3 === 2 && r !== 8 && "border-b-2 border-b-white/30"
                )}
              >
                {v ? v : (
                  notes[r]?.[c]?.size > 0 && (
                    <div className="grid grid-cols-3 grid-rows-3 w-full h-full text-[8px] text-white/50 p-0.5">
                      {[1,2,3,4,5,6,7,8,9].map((n) => (
                        <div key={n} className="grid place-items-center">{notes[r][c].has(n) ? n : ""}</div>
                      ))}
                    </div>
                  )
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="mt-4 flex gap-2 flex-wrap justify-center">
        {[1,2,3,4,5,6,7,8,9].map((n) => (
          <button
            key={n}
            onClick={() => setCell(n)}
            className="w-10 h-12 sm:w-12 sm:h-14 rounded-lg bg-bg-card border border-white/10 hover:bg-neon-purple/20 text-xl font-bold"
          >
            {n}
          </button>
        ))}
        <button onClick={() => setCell(0)} className="w-12 h-12 sm:h-14 rounded-lg bg-bg-card border border-white/10 hover:bg-neon-pink/20" aria-label="Erase"><Eraser size={18} className="mx-auto" /></button>
        <button onClick={() => setNotesMode((m) => !m)} className={cn("w-12 h-12 sm:h-14 rounded-lg border", notesMode ? "bg-neon-cyan/20 border-neon-cyan/50" : "bg-bg-card border-white/10 hover:bg-neon-cyan/10")} aria-label="Notes"><Pencil size={18} className="mx-auto" /></button>
        <button onClick={useHint} disabled={hints <= 0} className="w-14 h-12 sm:h-14 rounded-lg bg-bg-card border border-neon-yellow/30 hover:bg-neon-yellow/20 disabled:opacity-40 flex flex-col items-center justify-center text-xs"><Lightbulb size={16} /> {hints}</button>
      </div>

      <GameOverModal open={over} onClose={() => setOver(false)} title="Solved!" score={fmt(time)} extra={<div className="text-sm text-white/70">Difficulty: {DIFF_LABELS[diff]}</div>} onRestart={() => reset()} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Fill the grid so every row, column, and 3×3 box has 1–9.</li>
          <li>Click a cell, then type 1–9. Backspace to erase.</li>
          <li>Press <b>N</b> or tap the pencil to toggle notes mode (write small candidates).</li>
          <li>Wrong numbers turn pink. 3 hints per game.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="New game" footer={<button onClick={() => { setShowSettings(false); reset(); }} className="btn-primary w-full justify-center">Restart</button>}>
        <p className="text-xs text-white/60 mb-2">Difficulty</p>
        <div className="grid grid-cols-4 gap-2">
          {(["easy","med","hard","expert"] as Diff[]).map((d) => (
            <button key={d} onClick={() => reset(d)} className={cn("px-3 py-2 rounded-lg border text-sm", diff === d ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>{DIFF_LABELS[d]}</button>
          ))}
        </div>
      </Modal>
    </GameShell>
  );
}
