import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08090c",
          900: "#0d0f14",
          800: "#13161d",
          700: "#1c2029",
          600: "#262b37",
          500: "#3a4150",
          400: "#6b7280",
        },
        accent: {
          DEFAULT: "#f97373",
          glow: "#ff8e8e",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Inter", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 2s ease-in-out infinite",
        "ping-slow": "ping 1.6s cubic-bezier(0,0,0.2,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
