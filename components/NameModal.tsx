"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { getPlayerName, setPlayerName, storage } from "@/lib/storage";

/** Auto-opens on first visit. Also re-openable via global event "edit-name". */
export function NameModal({ initial }: { initial?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const asked = storage.get<boolean>("name:asked", false);
    if (!asked) {
      setName(getPlayerName());
      setOpen(true);
    }
    const edit = () => {
      setName(getPlayerName());
      setError("");
      setOpen(true);
    };
    window.addEventListener("edit-name", edit);
    return () => window.removeEventListener("edit-name", edit);
  }, []);

  const save = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 18) {
      setError("Pick 2–18 characters");
      return;
    }
    if (!/^[A-Za-z0-9_\- ]+$/.test(trimmed)) {
      setError("Letters, numbers, _, -, spaces only");
      return;
    }
    setPlayerName(trimmed);
    storage.set("name:asked", true);
    setOpen(false);
    window.dispatchEvent(new Event("name-changed"));
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        storage.set("name:asked", true);
        setOpen(false);
      }}
      title="Who's playing?"
      footer={
        <button onClick={save} className="btn-primary w-full justify-center">
          Save & play
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-white/70">
          Your name is shown on your scores and leaderboard entries. You can change it any time from the lobby.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="e.g. NeonPanda420"
          maxLength={18}
          className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple/60 focus:outline-none text-base"
        />
        {error && <p className="text-xs text-neon-pink">{error}</p>}
        <p className="text-xs text-white/40">
          Tip: 2–18 characters · letters, numbers, _ - and spaces.
        </p>
      </div>
    </Modal>
  );
}
