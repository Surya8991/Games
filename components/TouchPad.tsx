"use client";

import { cn } from "@/lib/cn";

type Dir = "up" | "down" | "left" | "right";

export function DPad({
  onPress,
  className,
}: {
  onPress: (dir: Dir) => void;
  className?: string;
}) {
  const Btn = ({ d, label, cls }: { d: Dir; label: string; cls: string }) => (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onPress(d);
      }}
      aria-label={`Move ${d}`}
      className={cn(
        "absolute w-14 h-14 rounded-xl bg-white/8 active:bg-neon-purple/30 border border-white/10 grid place-items-center text-white/80 text-xl select-none",
        cls
      )}
    >
      {label}
    </button>
  );
  return (
    <div className={cn("relative w-44 h-44", className)}>
      <Btn d="up" label="▲" cls="left-1/2 -translate-x-1/2 top-0" />
      <Btn d="down" label="▼" cls="left-1/2 -translate-x-1/2 bottom-0" />
      <Btn d="left" label="◀" cls="left-0 top-1/2 -translate-y-1/2" />
      <Btn d="right" label="▶" cls="right-0 top-1/2 -translate-y-1/2" />
    </div>
  );
}

export function ActionButton({
  onPress,
  label,
  className,
}: {
  onPress: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      className={cn(
        "w-20 h-20 rounded-full bg-neon-purple/20 active:bg-neon-purple/40 border-2 border-neon-purple/60 text-white pixel-font text-xs select-none",
        className
      )}
    >
      {label}
    </button>
  );
}
