export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f4f1e9",
        ink: "#262820",
        muted: "#6b6e62",
        line: "#d5d5c9",
        accent: "#c44b2d",
      },
      fontFamily: {
        serif: ["Iowan Old Style", "Baskerville", "Palatino Linotype", "serif"],
        sans: ["Arial", "Helvetica", "sans-serif"],
        mono: ["SFMono-Regular", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
