"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Settings as SettingsIcon, RotateCcw } from "lucide-react";
import { getPlayerName, setPlayerName, getSettings, setSettings, storage, GlobalSettings } from "@/lib/storage";
import { cn } from "@/lib/cn";

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [settings, setLocalSettings] = useState<GlobalSettings>({ sound: true, music: false, vibration: true, scanlines: false });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(getPlayerName());
    setLocalSettings(getSettings());
  }, []);

  const update = (patch: Partial<GlobalSettings>) => {
    const next = { ...settings, ...patch };
    setLocalSettings(next);
    setSettings(patch);
    window.dispatchEvent(new Event("storage"));
    flash();
  };

  const saveName = () => {
    const t = name.trim();
    if (t.length < 2 || t.length > 18) return;
    setPlayerName(t);
    window.dispatchEvent(new Event("name-changed"));
    flash();
  };

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1200); };

  const clearData = () => {
    if (!confirm("This wipes ALL scores, achievements, favorites, and progress. Continue?")) return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("arcade15:")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    alert("All data cleared. Reloading…");
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen safe-pad max-w-2xl mx-auto px-4 py-8">
      <Link href="/" className="btn-ghost mb-4"><ArrowLeft size={16} /> Back to lobby</Link>
      <h1 className="pixel-font text-2xl sm:text-3xl neon-text mb-6 flex items-center gap-2"><SettingsIcon /> Settings</h1>

      {saved && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-neon-green/20 border border-neon-green/40 text-neon-green text-sm">
          ✓ Saved
        </div>
      )}

      <section className="mb-8 p-5 rounded-2xl bg-bg-card/70 border border-white/10">
        <h2 className="text-sm uppercase tracking-wider text-white/50 mb-3">Player</h2>
        <label className="text-xs text-white/60 block mb-2">Display name</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            maxLength={18}
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple/60 outline-none text-sm"
          />
          <button onClick={saveName} className="btn-primary text-sm">Save</button>
        </div>
        <p className="text-xs text-white/40 mt-2">2–18 chars · letters, numbers, _ - and spaces</p>
      </section>

      <section className="mb-8 p-5 rounded-2xl bg-bg-card/70 border border-white/10">
        <h2 className="text-sm uppercase tracking-wider text-white/50 mb-4">Audio & Feedback</h2>
        <Toggle label="Sound effects" desc="Chiptune SFX on actions" value={settings.sound} onChange={(v) => update({ sound: v })} />
        <Toggle label="Background music" desc="Coming soon — disabled by default" value={settings.music} onChange={(v) => update({ music: v })} />
        <Toggle label="Vibration" desc="Haptic feedback on phones" value={settings.vibration} onChange={(v) => update({ vibration: v })} />
        <Toggle label="CRT scanlines overlay" desc="Retro arcade aesthetic" value={settings.scanlines} onChange={(v) => update({ scanlines: v })} />
      </section>

      <section className="mb-8 p-5 rounded-2xl bg-bg-card/70 border border-white/10">
        <h2 className="text-sm uppercase tracking-wider text-white/50 mb-4">Data</h2>
        <button onClick={clearData} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25 text-sm">
          <RotateCcw size={16} /> Reset all progress
        </button>
        <p className="text-xs text-white/40 mt-2">Wipes scores, achievements, favorites, level unlocks. Cannot be undone.</p>
      </section>

      <p className="text-xs text-white/30 text-center">Arcade-40 · Local storage only · No data leaves your device</p>
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-0 cursor-pointer">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-white/50">{desc}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn("relative w-12 h-6 rounded-full transition-colors", value ? "bg-neon-purple" : "bg-white/15")}
      >
        <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform", value && "translate-x-6")} />
      </button>
    </label>
  );
}
