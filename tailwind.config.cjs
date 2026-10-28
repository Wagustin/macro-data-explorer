module.exports = {
  darkMode: "class",
  content: ["./**/*.html", "./**/*.js", "!./node_modules/**"],
  safelist: [
    // Utility names that are selected from runtime data in explorer.html.
    { pattern: /^(text|bg)-(emerald|rose)-(400|500|600)$/, variants: ["dark"] }
  ],
  theme: {
    extend: {
      colors: {
        appleLight: "#FFFFFF",
        appleDark: "#0D0D0E",
        appleCardDark: "#1C1C1E",
        appleTextDark: "#F5F5F7",
        appleSubDark: "#8E8E93",
        appleBorderDark: "#2C2C2E",
        appleBorderLight: "#E5E5EA",
        paper: "var(--pd-paper)",
        card: "var(--pd-card)",
        surface: "var(--pd-surface)",
        ink: "var(--pd-ink)",
        "ink-soft": "var(--pd-ink-soft)",
        rule: "var(--pd-rule)",
        peru: "var(--pd-peru)",
        pos: "var(--pd-pos)",
        neg: "var(--pd-neg)"
      }
    }
  }
};
