"use client";

import { Share2, RotateCcw, Trophy, Home } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "./Modal";

export function GameOverModal({
  open,
  onClose,
  title = "Game Over",
  score,
  best,
  isNewBest,
  extra,
  shareText,
  onRestart,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  score?: number | string;
  best?: number | string;
  isNewBest?: boolean;
  extra?: React.ReactNode;
  shareText?: string;
  onRestart?: () => void;
}) {
  // Dismissal is internal — we never call the parent's onClose() from the X.
  // That prevents the parent from un-setting `over` and letting the game loop resume.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!open) setDismissed(false);
  }, [open]);

  // Confetti on new best
  useEffect(() => {
    if (!open || !isNewBest) return;
    let cancelled = false;
    import("canvas-confetti").then((m) => {
      if (cancelled) return;
      const confetti = m.default;
      confetti({ particleCount: 110, spread: 70, origin: { y: 0.6 }, colors: ["#b14aed", "#22d3ee", "#fde047", "#ec4899", "#22ee9c"] });
      setTimeout(() => confetti({ particleCount: 60, spread: 90, origin: { y: 0.6 }, colors: ["#22d3ee", "#fde047"] }), 250);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, isNewBest]);

  const share = async () => {
    const text = shareText || `I scored ${score} on Arcade-30! 🕹️`;
    if (navigator.share) {
      try { await navigator.share({ title: "Arcade-30", text, url: window.location.href }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(`${text}\n${window.location.href}`); alert("Copied to clipboard!"); } catch {}
    }
  };

  const handleRestart = () => {
    setDismissed(false);
    onRestart?.();
    // also fully dismiss in case parent's restart didn't reset `over`
    onClose?.();
  };

  return (
    <>
      <Modal open={open && !dismissed} onClose={() => setDismissed(true)} title={title}>
        <div className="text-center py-4">
          {isNewBest && (
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-neon-yellow/15 border border-neon-yellow/40 text-neon-yellow text-xs">
              <Trophy size={14} /> New personal best!
            </div>
          )}
          {score !== undefined && (
            <div className="text-5xl pixel-font neon-text-cyan mb-2 tabular-nums">{score}</div>
          )}
          {best !== undefined && (
            <div className="text-xs text-white/60 mb-4">Best: <span className="tabular-nums text-neon-yellow">{best}</span></div>
          )}
          {extra}
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            {onRestart && (
              <button onClick={handleRestart} className="btn-primary">
                <RotateCcw size={16} /> Play again
              </button>
            )}
            <button onClick={share} className="btn-ghost">
              <Share2 size={16} /> Share
            </button>
            <Link href="/" className="btn-ghost">
              <Home size={16} /> Lobby
            </Link>
          </div>
        </div>
      </Modal>

      {/* Floating "Play again" pill shown when modal is dismissed but game is still over */}
      {open && dismissed && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-bg-card/95 backdrop-blur border-2 border-neon-purple/50 shadow-neon">
            <span className="text-sm text-white/80">Game over</span>
            {onRestart && (
              <button onClick={handleRestart} className="px-3 py-1 rounded-full bg-neon-purple/30 hover:bg-neon-purple/50 text-sm text-white border border-neon-purple/60 transition">
                <RotateCcw size={14} className="inline mr-1" /> Play again
              </button>
            )}
            <Link href="/" className="px-3 py-1 rounded-full text-sm text-white/70 hover:text-white">
              Lobby
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
