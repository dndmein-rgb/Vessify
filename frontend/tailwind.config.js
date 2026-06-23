/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#0B0A10",
        surface: "#15131D",
        surfaceHover: "#1C1926",
        border: "#27232F",
        accent: {
          DEFAULT: "#7C3AED",
          light: "#A78BFA",
          muted: "#4C1D95",
        },
        text: {
          primary: "#F4F2F8",
          secondary: "#A9A4B8",
          muted: "#6B6578",
        },
        debit: "#F87171",
        credit: "#4ADE80",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "10px",
      },
    },
  },
  plugins: [],
};
