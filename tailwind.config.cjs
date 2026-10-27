module.exports = {
  darkMode: "class",
  content: ["./*.html", "./*.js", "./scripts/**/*.js"],
  safelist: [
    "cat-chip",
    "text-[14px]",
    "font-semibold",
    "text-ink",
    "border-b-2",
    "border-ink",
    "pb-1",
    "whitespace-nowrap",
    "transition",
    "cursor-pointer",
    "bg-transparent",
    "border-t-0",
    "border-l-0",
    "border-r-0",
    "rounded-none",
    "font-medium",
    "text-ink-soft",
    "hover:text-ink",
    "border-transparent"
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
