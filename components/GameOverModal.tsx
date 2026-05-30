"use client";

import { Share2, RotateCcw, Trophy, Home } from "lucide-react";
import Link from "next/link";
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
  const share = async () => {
    const text = shareText || `I scored ${score} on Arcade-15! 🕹️`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Arcade-15", text, url: window.location.href });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
        alert("Copied to clipboard!");
      } catch {}
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
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
            <button onClick={onRestart} className="btn-primary">
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
  );
}
