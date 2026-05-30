import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AchievementToast } from "@/components/AchievementToast";
import { NameModal } from "@/components/NameModal";

export const metadata: Metadata = {
  title: "Arcade-15 — 15 Classic Games, One Tab",
  description:
    "Wordle, Tetris, 2048, Chess, Pac-Man, Snake, Flappy and more. Play 15 polished browser games. Free, mobile-friendly, with global leaderboards.",
  keywords: [
    "browser games",
    "html5 games",
    "wordle",
    "2048",
    "tetris",
    "chess",
    "snake",
    "pac-man",
    "flappy bird",
    "free online games",
  ],
  openGraph: {
    title: "Arcade-15",
    description: "15 polished browser games, one tab. Free + mobile-friendly.",
    type: "website",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0a0a14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <NameModal />
        <AchievementToast />
      </body>
    </html>
  );
}
