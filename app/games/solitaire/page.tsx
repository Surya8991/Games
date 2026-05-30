"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { pushRecent, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { cn } from "@/lib/cn";
import { Undo2 } from "lucide-react";

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { rank: number; suit: Suit; up: boolean };
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

const isRed = (s: Suit) => s === "♥" || s === "♦";

function makeDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ rank: r, suit: s, up: false });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

type State = {
  stock: Card[];
  waste: Card[];
  foundations: Record<Suit, Card[]>;
  tableau: Card[][];
};

function deal(): State {
  const deck = makeDeck();
  const tableau: Card[][] = [[], [], [], [], [], [], []];
  for (let i = 0; i < 7; i++) {
    for (let j = i; j < 7; j++) {
      const c = deck.pop()!;
      c.up = i === j;
      tableau[j].push(c);
    }
  }
  return {
    stock: deck,
    waste: [],
    foundations: { "♠": [], "♥": [], "♦": [], "♣": [] },
    tableau,
  };
}

function clone(s: State): State {
  return {
    stock: s.stock.map((c) => ({ ...c })),
    waste: s.waste.map((c) => ({ ...c })),
    foundations: { "♠": s.foundations["♠"].map((c) => ({ ...c })), "♥": s.foundations["♥"].map((c) => ({ ...c })), "♦": s.foundations["♦"].map((c) => ({ ...c })), "♣": s.foundations["♣"].map((c) => ({ ...c })) },
    tableau: s.tableau.map((col) => col.map((c) => ({ ...c }))),
  };
}

function canStackOnTableau(top: Card | undefined, card: Card): boolean {
  if (!top) return card.rank === 13; // empty col → King
  if (!top.up) return false;
  if (top.rank !== card.rank + 1) return false;
  return isRed(top.suit) !== isRed(card.suit);
}
function canStackOnFoundation(top: Card | undefined, card: Card): boolean {
  if (!top) return card.rank === 1;
  return top.suit === card.suit && top.rank === card.rank - 1;
}

type Source = { type: "tableau"; col: number; idx: number } | { type: "waste" } | { type: "foundation"; suit: Suit };

export default function SolitaireGame() {
  const game = getGame("solitaire")!;
  const [state, setState] = useState<State>(deal);
  const [sel, setSel] = useState<Source | null>(null);
  const [history, setHistory] = useState<State[]>([]);
  const [won, setWon] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [drawMode, setDrawMode] = useState<1 | 3>(1);
  const { play, vibrate } = useSound();

  useEffect(() => { pushRecent("solitaire"); }, []);

  const isWon = useMemo(() => SUITS.every((s) => state.foundations[s].length === 13), [state]);
  useEffect(() => {
    if (isWon && !won) {
      setWon(true); play("win"); vibrate([40, 30, 60]);
      updateStats("solitaire", { plays: 1, wins: 1 });
    }
  }, [isWon, won, play, vibrate]);

  const push = (next: State) => {
    setHistory((h) => [...h.slice(-30), state]);
    setState(next);
  };

  const drawStock = () => {
    const n = clone(state);
    if (n.stock.length === 0) {
      // recycle waste
      n.stock = n.waste.reverse().map((c) => ({ ...c, up: false }));
      n.waste = [];
    } else {
      const count = Math.min(drawMode, n.stock.length);
      for (let i = 0; i < count; i++) {
        const c = n.stock.pop()!;
        c.up = true;
        n.waste.push(c);
      }
    }
    push(n);
    play("tick");
  };

  const tryMoveTo = useCallback((dest: { type: "tableau"; col: number } | { type: "foundation"; suit: Suit }) => {
    if (!sel) return false;
    const n = clone(state);
    let moving: Card[] = [];
    if (sel.type === "waste") {
      moving = n.waste.length ? [n.waste[n.waste.length - 1]] : [];
    } else if (sel.type === "tableau") {
      const col = n.tableau[sel.col];
      moving = col.slice(sel.idx);
    } else if (sel.type === "foundation") {
      const f = n.foundations[sel.suit];
      moving = f.length ? [f[f.length - 1]] : [];
    }
    if (!moving.length) return false;
    let ok = false;
    if (dest.type === "tableau") {
      const col = n.tableau[dest.col];
      if (canStackOnTableau(col[col.length - 1], moving[0])) ok = true;
    } else {
      if (moving.length === 1 && canStackOnFoundation(n.foundations[dest.suit][n.foundations[dest.suit].length - 1], moving[0])) ok = true;
    }
    if (!ok) return false;
    // remove from source
    if (sel.type === "waste") n.waste.pop();
    else if (sel.type === "tableau") {
      n.tableau[sel.col].splice(sel.idx);
      const col = n.tableau[sel.col];
      if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true;
    } else if (sel.type === "foundation") {
      n.foundations[sel.suit].pop();
    }
    // add to dest
    if (dest.type === "tableau") n.tableau[dest.col].push(...moving);
    else n.foundations[dest.suit].push(moving[0]);
    push(n);
    setSel(null);
    play("click"); vibrate(8);
    return true;
  }, [sel, state, play, vibrate]);

  const onWasteClick = () => { if (sel?.type === "waste") setSel(null); else if (state.waste.length) setSel({ type: "waste" }); };
  const onTableauCard = (col: number, idx: number) => {
    const card = state.tableau[col][idx];
    if (!card?.up) return;
    if (sel) {
      if (tryMoveTo({ type: "tableau", col })) return;
    }
    setSel({ type: "tableau", col, idx });
  };
  const onTableauEmpty = (col: number) => {
    if (sel) tryMoveTo({ type: "tableau", col });
  };
  const onFoundation = (suit: Suit) => {
    if (sel) { if (tryMoveTo({ type: "foundation", suit })) return; }
    if (state.foundations[suit].length) setSel({ type: "foundation", suit });
  };

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setState(h[h.length - 1]);
      setSel(null);
      return h.slice(0, -1);
    });
  };

  // Auto-send aces/etc to foundation: double-click handler approximation = button
  const autoToFoundation = () => {
    const n = clone(state);
    let moved = true;
    let count = 0;
    while (moved && count < 60) {
      moved = false; count++;
      // waste
      const w = n.waste[n.waste.length - 1];
      if (w && canStackOnFoundation(n.foundations[w.suit][n.foundations[w.suit].length - 1], w)) {
        n.waste.pop(); n.foundations[w.suit].push(w); moved = true; continue;
      }
      for (let col = 0; col < 7; col++) {
        const t = n.tableau[col][n.tableau[col].length - 1];
        if (t && t.up && canStackOnFoundation(n.foundations[t.suit][n.foundations[t.suit].length - 1], t)) {
          n.tableau[col].pop(); n.foundations[t.suit].push(t);
          const col2 = n.tableau[col]; if (col2.length && !col2[col2.length - 1].up) col2[col2.length - 1].up = true;
          moved = true;
        }
      }
    }
    if (count > 1) { push(n); play("ding"); }
  };

  const renderCard = (c: Card, sel = false) => (
    <div className={cn("w-14 h-20 sm:w-16 sm:h-24 rounded-md shadow-md grid place-items-center text-sm sm:text-base font-bold relative",
      c.up ? "bg-white text-black" : "bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-white/20",
      sel && "ring-2 ring-neon-cyan -translate-y-1"
    )}>
      {c.up && (
        <>
          <span className={cn("absolute top-1 left-1.5 text-xs", isRed(c.suit) ? "text-red-600" : "text-black")}>{RANKS[c.rank - 1]}{c.suit}</span>
          <span className={cn("text-3xl", isRed(c.suit) ? "text-red-600" : "text-black")}>{c.suit}</span>
        </>
      )}
    </div>
  );

  const newGame = () => { setState(deal()); setSel(null); setHistory([]); setWon(false); };

  return (
    <GameShell game={game} onRestart={newGame} onOpenHowTo={() => setShowHow(true)} onOpenSettings={() => setShowSettings(true)} rightExtra={
      <div className="flex gap-1 items-center">
        <span className="hidden sm:inline text-xs text-white/50">Draw-{drawMode}</span>
        <button onClick={undo} disabled={!history.length} className="btn-ghost disabled:opacity-30"><Undo2 size={16} /></button>
        <button onClick={autoToFoundation} className="btn-ghost text-xs">Auto</button>
      </div>
    }>
      <div className="w-full max-w-3xl space-y-3">
        {/* Top row: stock/waste + foundations */}
        <div className="flex gap-2 justify-between">
          <div className="flex gap-2">
            <button onClick={drawStock} className="w-14 h-20 sm:w-16 sm:h-24 rounded-md bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-white/20 grid place-items-center text-white/60 text-xs">
              {state.stock.length ? "DECK" : "↻"}
            </button>
            <button onClick={onWasteClick} className="w-14 h-20 sm:w-16 sm:h-24 rounded-md bg-black/30 border-2 border-dashed border-white/10 grid place-items-center relative">
              {state.waste.length > 0 && renderCard(state.waste[state.waste.length - 1], sel?.type === "waste")}
            </button>
          </div>
          <div className="flex gap-2">
            {SUITS.map((s) => (
              <button key={s} onClick={() => onFoundation(s)} className="w-14 h-20 sm:w-16 sm:h-24 rounded-md bg-black/30 border-2 border-dashed border-white/10 grid place-items-center text-3xl">
                {state.foundations[s].length ? renderCard(state.foundations[s][state.foundations[s].length - 1], sel?.type === "foundation" && sel.suit === s) : <span className={cn(isRed(s) ? "text-red-500/40" : "text-white/30")}>{s}</span>}
              </button>
            ))}
          </div>
        </div>
        {/* Tableau */}
        <div className="grid grid-cols-7 gap-2">
          {state.tableau.map((col, ci) => (
            <div key={ci} className="relative min-h-[200px]" onClick={() => col.length === 0 && onTableauEmpty(ci)}>
              {col.length === 0 ? (
                <div className="w-14 h-20 sm:w-16 sm:h-24 rounded-md border-2 border-dashed border-white/10" />
              ) : (
                col.map((card, i) => (
                  <div key={i} className="absolute" style={{ top: i * 20 }} onClick={(e) => { e.stopPropagation(); onTableauCard(ci, i); }}>
                    {renderCard(card, sel?.type === "tableau" && sel.col === ci && sel.idx === i)}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      <GameOverModal open={won} onClose={() => setWon(false)} title="🎉 You won!" extra={<div className="text-sm text-white/70">All cards home.</div>} onRestart={newGame} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Click a card to select, then click a destination to move.</li>
          <li>Tableau: stack descending with alternating colors. Kings start empty columns.</li>
          <li>Foundations (top right): build up A→K by suit. Win when all 4 are full.</li>
          <li>Click the deck to draw. <b>Draw-1</b> = easy. <b>Draw-3</b> = classic challenge.</li>
          <li><b>Auto</b> sends every safe card to the foundations. <b>Undo</b> reverts the last move.</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings" footer={<button onClick={() => { setShowSettings(false); newGame(); }} className="btn-primary w-full justify-center">New deal</button>}>
        <p className="text-xs text-white/60 mb-2">Draw mode</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setDrawMode(1)} className={cn("px-3 py-2 rounded-lg border text-sm", drawMode === 1 ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>
            Draw 1<div className="text-[10px] text-white/50">Easy mode</div>
          </button>
          <button onClick={() => setDrawMode(3)} className={cn("px-3 py-2 rounded-lg border text-sm", drawMode === 3 ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>
            Draw 3<div className="text-[10px] text-white/50">Classic</div>
          </button>
        </div>
      </Modal>
    </GameShell>
  );
}
