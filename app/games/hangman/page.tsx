"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GameShell } from "@/components/GameShell";
import { GameOverModal } from "@/components/GameOverModal";
import { Modal } from "@/components/Modal";
import { getGame } from "@/lib/games-meta";
import { getHighScore, pushRecent, setHighScore, updateStats } from "@/lib/storage";
import { useSound } from "@/lib/useSound";
import { cn } from "@/lib/cn";

const WORDS = "ANCHOR APPLE ASTEROID AVENUE BANJO BASKET BEACON BIRTHDAY BLANKET BOTTLE BRIDGE BUTTERFLY CACTUS CAMERA CANDLE CAPTAIN CARTOON CASTLE CHALLENGE CHEESE CHERRY CHIMNEY CIRCUS COMPUTER COUNTRY CRYSTAL DELIGHT DIAMOND DISCOVER DRAGON DREAM EAGLE EARLY EARTH EFFORT ENERGY ENGINE EQUATOR FACTORY FAMILY FANTASY FEATHER FESTIVE FOREST FORTUNE FRAGILE FRIDAY FROZEN GADGET GALAXY GARLIC GATHER GENEROUS GIRAFFE GLACIER GLITTER GOLDEN GUITAR HAMMER HARBOR HARMONY HEART HEAVEN HOLIDAY HONEYCOMB HORIZON IMPACT INSTANT INVENT ISLAND JACKET JAGUAR JOURNAL JUSTICE KETTLE KINGDOM KITTEN KNIGHT LANTERN LEAGUE LEGEND LEMONADE LIBRARY LIGHTNING LIQUID LIZARD MAGNET MANGO MARBLE MEADOW MIDNIGHT MIRROR MISSION MONKEY MORNING MOUNTAIN MUSEUM MYSTERY NEPTUNE NEUTRAL NEUTRON OASIS OCTAGON OCTOPUS ORBIT ORCHID OXYGEN PALACE PARADISE PEBBLE PELICAN PENGUIN PHOENIX PILLOW PIRATE PIZZA PLANET PLATINUM PLAYFUL POISON POLISH POTION PRINCE PUZZLE PYTHON QUASAR QUARTZ QUIVER RABBIT RAINBOW RECIPE REPTILE RIDDLE ROBOT ROCKET SAILOR SAMURAI SAPPHIRE SATELLITE SCISSORS SECRET SENSOR SHADOW SHIMMER SIGNAL SILVER SKETCH SOLAR SPARROW SPIDER SPONGE SQUIRREL STADIUM STELLAR STORM SUMMER SUNRISE SUNSET TABLET TEMPLE THUNDER TIGER TOMATO TORTOISE TRAVEL TREASURE TROPHY TUNNEL TWILIGHT UMBRELLA UNICORN UNIVERSE VALLEY VAPOR VELVET VICTORY VIOLIN VOLCANO VOYAGE WAFFLE WALRUS WATERFALL WEDDING WHISPER WILDLIFE WINDOW WINTER WIZARD YELLOW ZEBRA ZIGZAG".split(" ");

const MAX_WRONG = 6;

export default function HangmanGame() {
  const game = getGame("hangman")!;
  const [word, setWord] = useState("");
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [showHow, setShowHow] = useState(false);
  const { play, vibrate } = useSound();

  const wrong = useMemo(() => Array.from(guessed).filter((c) => !word.includes(c)).length, [guessed, word]);

  const newRound = useCallback((keepStreak = false) => {
    const w = WORDS[Math.floor(Math.random() * WORDS.length)];
    setWord(w);
    setGuessed(new Set());
    setOver(false);
    setWon(false);
    if (!keepStreak) setStreak(0);
  }, []);

  useEffect(() => {
    pushRecent("hangman");
    setBest(getHighScore("hangman"));
    newRound();
  }, [newRound]);

  const guess = useCallback((letter: string) => {
    if (over || guessed.has(letter)) return;
    const ng = new Set(guessed);
    ng.add(letter);
    setGuessed(ng);
    if (word.includes(letter)) {
      play("ding"); vibrate(10);
      const solved = [...word].every((c) => c === " " || ng.has(c));
      if (solved) {
        setOver(true); setWon(true);
        play("win"); vibrate([40, 30, 60]);
        const ns = streak + 1;
        setStreak(ns);
        const ok = setHighScore("hangman", ns); if (ok) setBest(ns);
        updateStats("hangman", { plays: 1, wins: 1, bestScore: ns });
      }
    } else {
      play("thud"); vibrate(30);
      const w2 = Array.from(ng).filter((c) => !word.includes(c)).length;
      if (w2 >= MAX_WRONG) {
        setOver(true); setWon(false);
        play("lose"); vibrate(150);
        setStreak(0);
        updateStats("hangman", { plays: 1, losses: 1 });
      }
    }
  }, [guessed, over, word, streak, play, vibrate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (k.length === 1 && k >= "A" && k <= "Z") guess(k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guess]);

  // Hangman SVG parts based on wrong count
  const parts = [
    <line key="h1" x1="20" y1="180" x2="100" y2="180" />,
    <line key="h2" x1="60" y1="180" x2="60" y2="20" />,
    <line key="h3" x1="60" y1="20" x2="120" y2="20" />,
    <line key="h4" x1="120" y1="20" x2="120" y2="40" />,
    // 1 head
    <circle key="b1" cx="120" cy="55" r="15" fill="none" />,
    // 2 body
    <line key="b2" x1="120" y1="70" x2="120" y2="110" />,
    // 3 left arm
    <line key="b3" x1="120" y1="80" x2="100" y2="100" />,
    // 4 right arm
    <line key="b4" x1="120" y1="80" x2="140" y2="100" />,
    // 5 left leg
    <line key="b5" x1="120" y1="110" x2="100" y2="140" />,
    // 6 right leg
    <line key="b6" x1="120" y1="110" x2="140" y2="140" />,
  ];

  return (
    <GameShell game={game} score={`${wrong}/${MAX_WRONG}`} best={best} onRestart={() => newRound()} onOpenHowTo={() => setShowHow(true)} rightExtra={<span className="text-xs text-white/60">Streak: <span className="text-neon-yellow">{streak}</span></span>}>
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
        <svg viewBox="0 0 160 200" className="w-40 h-52" stroke="#22d3ee" strokeWidth="3" fill="none" strokeLinecap="round">
          {parts.slice(0, 4 + wrong)}
        </svg>
        <div>
          <div className="text-3xl sm:text-5xl pixel-font tracking-widest mb-6 text-neon-cyan flex flex-wrap gap-2 justify-center">
            {word.split("").map((c, i) => (
              <span key={i} className={cn("inline-block w-6 sm:w-8 text-center border-b-4", c === " " ? "border-transparent" : guessed.has(c) ? "border-neon-cyan" : "border-white/30")}>
                {c === " " ? " " : guessed.has(c) ? c : "_"}
              </span>
            ))}
          </div>
          <p className="text-xs text-white/50 text-center">Wrong: {Array.from(guessed).filter((c) => !word.includes(c)).join(" ") || "—"}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 sm:grid-cols-13 gap-1.5 max-w-xl">
        {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => {
          const isGuessed = guessed.has(c);
          const inWord = word.includes(c);
          return (
            <button
              key={c}
              onClick={() => guess(c)}
              disabled={isGuessed || over}
              className={cn(
                "h-10 rounded-lg font-bold border transition",
                isGuessed
                  ? inWord
                    ? "bg-neon-green/30 border-neon-green/50 text-neon-green"
                    : "bg-neon-pink/20 border-neon-pink/40 text-neon-pink"
                  : "bg-white/5 border-white/10 hover:bg-neon-purple/20"
              )}
            >
              {c}
            </button>
          );
        })}
      </div>

      <GameOverModal open={over} onClose={() => setOver(false)} title={won ? "You got it!" : `Hanged! Word was ${word}`} score={streak} best={best} extra={won ? <div className="text-xs text-white/60">Streak: {streak}</div> : null} onRestart={() => newRound(false)} />
      <Modal open={showHow} onClose={() => setShowHow(false)} title="How to play">
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>Guess the word one letter at a time. Type letters or click them.</li>
          <li>6 wrong guesses = game over. Streak resets.</li>
          <li>Solve to advance. Score = current streak.</li>
        </ul>
      </Modal>
    </GameShell>
  );
}
