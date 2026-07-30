/** Blueprint OS — light theme. Colors map to CSS variables in index.css. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        "ink-4": "var(--ink-4)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        "line-strong": "var(--line-strong)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        "accent-ink": "var(--accent-ink)",
        "accent-bg": "var(--accent-bg)",
        ok: "var(--ok)",
        "ok-bg": "var(--ok-bg)",
        "ok-line": "var(--ok-line)",
        warn: "var(--warn)",
        "warn-bg": "var(--warn-bg)",
        "warn-line": "var(--warn-line)",
        crit: "var(--crit)",
        "crit-bg": "var(--crit-bg)",
        "crit-line": "var(--crit-line)",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "JetBrains Mono", "Menlo", "monospace"],
      },
      borderRadius: { DEFAULT: "6px", sm: "4px", lg: "10px" },
    },
  },
  plugins: [],
};
