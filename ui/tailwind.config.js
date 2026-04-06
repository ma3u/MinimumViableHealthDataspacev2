/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 5-layer architecture palette — distinct cool/muted gradient
        layer1: {
          DEFAULT: "#5B8DEF",
          light: "#B3CCFA",
          dark: "#3A5FA8",
        },
        layer2: {
          DEFAULT: "#45B7AA",
          light: "#8FD8CF",
          dark: "#2E7E75",
        },
        layer3: {
          DEFAULT: "#6ABF69",
          light: "#A8DCA8",
          dark: "#468646",
        },
        layer4: {
          DEFAULT: "#F0A050",
          light: "#F8D0A0",
          dark: "#B07030",
        },
        layer5: {
          DEFAULT: "#A78BDB",
          light: "#D0C0ED",
          dark: "#7B5FB0",
        },
        // Semantic surface tokens (used via CSS vars in globals.css)
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
      },
      backgroundColor: {
        base: "var(--bg)",
      },
      textColor: {
        base: "var(--text-primary)",
        muted: "var(--text-secondary)",
      },
      borderColor: {
        base: "var(--border)",
      },
    },
  },
  plugins: [],
};
