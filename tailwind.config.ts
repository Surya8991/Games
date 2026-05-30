import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a14",
          soft: "#11111d",
          card: "#161628",
        },
        neon: {
          purple: "#b14aed",
          cyan: "#22d3ee",
          pink: "#ec4899",
          green: "#22ee9c",
          yellow: "#fde047",
        },
      },
      fontFamily: {
        arcade: ['"Press Start 2P"', "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        neon: "0 0 12px rgba(177, 74, 237, 0.45), 0 0 32px rgba(34, 211, 238, 0.18)",
        "neon-cyan": "0 0 12px rgba(34, 211, 238, 0.55)",
        "neon-pink": "0 0 12px rgba(236, 72, 153, 0.55)",
      },
      keyframes: {
        glow: {
          "0%, 100%": { filter: "drop-shadow(0 0 6px currentColor)" },
          "50%": { filter: "drop-shadow(0 0 14px currentColor)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      animation: {
        glow: "glow 2s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
