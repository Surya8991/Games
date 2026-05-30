"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, Square, Move, PieceSymbol, Color } from "chess.js";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { pushRecent, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { pickMove } from "@/lib/chess-ai";
import { unlock } from "@/lib/achievements";
import { cn } from "@/lib/cn";
import { RotateCcw, Undo2 } from "lucide-react";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PIECES: Record<string, string> = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

type Mode = "ai-easy" | "ai-med" | "ai-hard" | "2p";

export default function ChessGame() {
  const game = getGame("chess")!;
  const [chess] = useState(() => new Chess());
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [legal, setLegal] = useState<Move[]>([]);
  const [mode, setMode] = useState<Mode>("ai-med");
  const [history, setHistory] = useState<string[]>([]);
  const [showOver, setShowOver] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [thinking, setThinking] = useState(false);
  const { play, vibrate } = useSound();

  useEffect(() => { pushRecent("chess"); }, []);

  const board = chess.board();
  const turn = chess.turn();
  const isOver = chess.isGameOver();

  useEffect(() => {
    if (mode === "2p" || isOver) return;
    if (turn === "b") {
      setThinking(true);
      const t = setTimeout(() => {
        const mv = pickMove(chess.fen(), mode === "ai-hard" ? "hard" : mode === "ai-med" ? "med" : "easy");
        if (mv) {
          chess.move(mv.san);
          setHistory(chess.history());
          play(mv.captured ? "thud" : "click");
          vibrate(15);
          rerender();
          if (chess.isCheckmate()) {
            setShowOver(true);
            play("lose");
            updateStats("chess", { plays: 1, losses: 1 });
          } else if (chess.isDraw()) { setShowOver(true); }
        }
        setThinking(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [turn, mode, isOver]); // eslint-disable-line

  const onSquare = (sq: Square) => {
    if (isOver || thinking) return;
    if (mode !== "2p" && turn !== "w") return;
    const piece = chess.get(sq);
    if (selected) {
      const move = legal.find((m) => m.to === sq);
      if (move) {
        chess.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
        setHistory(chess.history());
        play(move.captured ? "thud" : "click");
        vibrate(20);
        setSelected(null); setLegal([]);
        rerender();
        if (chess.isCheckmate()) {
          setShowOver(true); play("win");
          updateStats("chess", { plays: 1, wins: 1 });
          unlock("chess-checkmate");
          if (mode === "ai-hard") unlock("chess-beat-hard");
        }
        else if (chess.isDraw()) setShowOver(true);
        return;
      }
      if (piece && piece.color === turn) {
        setSelected(sq);
        setLegal(chess.moves({ square: sq, verbose: true }) as Move[]);
        return;
      }
      setSelected(null); setLegal([]);
    } else if (piece && piece.color === turn) {
      setSelected(sq);
      setLegal(chess.moves({ square: sq, verbose: true }) as Move[]);
    }
  };

  const undo = () => {
    if (mode === "2p") chess.undo();
    else { chess.undo(); chess.undo(); }
    setHistory(chess.history());
    setSelected(null); setLegal([]);
    rerender();
  };

  const newGame = () => {
    chess.reset();
    setHistory([]);
    setSelected(null); setLegal([]);
    setShowOver(false);
    rerender();
  };

  const rows = useMemo(() => {
    const order = [0, 1, 2, 3, 4, 5, 6, 7];
    return flipped ? order.reverse() : order;
  }, [flipped]);
  const cols = useMemo(() => {
    const order = [0, 1, 2, 3, 4, 5, 6, 7];
    return flipped ? order.reverse() : order;
  }, [flipped]);

  return (
    <GameShell
      game={game}
      onRestart={newGame}
      onOpenHowTo={() => setShowHow(true)}
      onOpenSettings={() => setShowSettings(true)}
      rightExtra={
        <div className="flex gap-1">
          <button onClick={undo} disabled={!history.length} className="btn-ghost disabled:opacity-30" aria-label="Undo"><Undo2 size={16} /></button>
          <button onClick={() => setFlipped((f) => !f)} className="btn-ghost" aria-label="Flip"><RotateCcw size={16} /></button>
        </div>
      }
    >
      <div className="text-center text-xs text-white/60 mb-2">
        {isOver
          ? chess.isCheckmate()
            ? `${turn === "w" ? "Black" : "White"} wins by checkmate`
            : chess.isDraw()
            ? "Draw"
            : "Game over"
          : thinking
          ? "AI thinking…"
          : `${turn === "w" ? "White" : "Black"} to move${chess.isCheck() ? " · CHECK" : ""}`}
      </div>
      <div className="grid grid-cols-8 rounded-xl overflow-hidden border-2 border-white/10 shadow-neon">
        {rows.map((r) =>
          cols.map((c) => {
            const sq = (FILES[c] + (8 - r)) as Square;
            const piece = board[r][c];
            const isLight = (r + c) % 2 === 0;
            const isSel = selected === sq;
            const isLegal = legal.some((m) => m.to === sq);
            const isCap = legal.some((m) => m.to === sq && m.captured);
            return (
              <button
                key={sq}
                onClick={() => onSquare(sq)}
                className={cn(
                  "w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 grid place-items-center text-2xl sm:text-4xl md:text-5xl select-none transition relative",
                  isLight ? "bg-[#e6c79a]" : "bg-[#7d5430]",
                  isSel && "ring-4 ring-neon-cyan ring-inset",
                  piece?.color === "w" ? "text-white" : "text-black"
                )}
              >
                <span style={{ textShadow: piece?.color === "w" ? "0 0 2px #000, 1px 1px 0 #000" : "" }}>
                  {piece ? PIECES[piece.color + piece.type] : ""}
                </span>
                {isLegal && (
                  <span className={cn("absolute pointer-events-none", isCap ? "inset-1 rounded-full border-4 border-neon-pink/70" : "w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-neon-cyan/60")} />
                )}
                {/* coords */}
                {c === (flipped ? 7 : 0) && (
                  <span className="absolute top-0 left-1 text-[9px] text-black/60">{8 - r}</span>
                )}
                {r === (flipped ? 0 : 7) && (
                  <span className="absolute bottom-0 right-1 text-[9px] text-black/60">{FILES[c]}</span>
                )}
              </button>
            );
          })
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-3 w-full max-w-md max-h-32 overflow-y-auto text-xs text-white/70 bg-white/5 rounded-lg p-2 font-mono">
          {history.map((m, i) => (
            <span key={i} className="mr-2">
              {i % 2 === 0 && <span className="text-white/40">{Math.floor(i / 2) + 1}.</span>} {m}
            </span>
          ))}
        </div>
      )}

      <GameOverModal
        open={showOver}
        onClose={() => setShowOver(false)}
        title={chess.isCheckmate() ? (turn === "w" ? "Black wins" : "White wins") : "Draw"}
        onRestart={newGame}
      />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Click a piece, then click a highlighted square to move.</li>
          <li>All FIDE rules: castling, en passant, promotion, stalemate, threefold rep, 50-move.</li>
          <li>AI uses alpha-beta minimax with piece-square tables (depth 3 on Hard).</li>
        </ul>
      </Modal>
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings" footer={<button onClick={newGame} className="btn-primary w-full justify-center">New game</button>}>
        <div className="space-y-3">
          <p className="text-xs text-white/60">Mode</p>
          <div className="grid grid-cols-2 gap-2">
            {([["ai-easy","AI Easy"],["ai-med","AI Medium"],["ai-hard","AI Hard"],["2p","2 Player"]] as [Mode,string][]).map(([k,l]) => (
              <button key={k} onClick={() => setMode(k)} className={cn("px-3 py-2 rounded-lg border text-sm", mode === k ? "bg-neon-purple/20 border-neon-purple/50" : "bg-white/5 border-white/10")}>{l}</button>
            ))}
          </div>
        </div>
      </Modal>
    </GameShell>
  );
}
