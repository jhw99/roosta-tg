/**
 * Roosta Tailwind Config — Tailwind v3
 *
 * Merge this into your existing tailwind.config.ts.
 * For Tailwind v4, use roosta-theme.css with @theme directive instead.
 */

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ===== Roosta brand =====
        roosta: {
          50:  "#FFF7F2",
          100: "#FFEAD9",
          200: "#FCD0AB",
          300: "#F4A261",
          400: "#ED7E47",
          500: "#E85D2F",  // Main brand
          600: "#D74E22",
          700: "#C73E1D",
          800: "#A03217",
          900: "#6E2310",
        },
        // ===== Background & surface =====
        "bg-light": "#FAFAF7",
        "bg-dark": "#1A1A1A",
        "surface-light": "#FFFFFF",
        "surface-dark": "#242422",

        // ===== Semantic (shadcn/ui compatibility) =====
        primary: {
          DEFAULT: "#E85D2F",
          foreground: "#FAFAF7",
        },
        secondary: {
          DEFAULT: "#F4A261",
          foreground: "#1A1A1A",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#FAFAF7",
        },
        muted: {
          DEFAULT: "#F5F5F2",
          foreground: "#6A6A6A",
        },
        accent: {
          DEFAULT: "#FFEAD9",
          foreground: "#C73E1D",
        },
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        body: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        "roosta-sm": "0.375rem",
        "roosta-md": "0.625rem",
        "roosta-lg": "1rem",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
