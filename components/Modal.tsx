"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-bg-card border border-white/10 shadow-neon overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <h2 className="pixel-font text-sm text-neon-purple">{title}</h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto text-sm text-white/85">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-white/5 bg-white/2">{footer}</div>}
      </div>
    </div>
  );
}
