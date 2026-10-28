/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        atc: {
          bg: "#0B0F19",
          card: "#111827",
          panel: "#161F30",
          border: "#1F293D",
          radar: "#070B12",
          scopeGrid: "#132338",
          targetGreen: "#10B981",
          targetCyan: "#06B6D4",
          targetAmber: "#F59E0B",
          targetRed: "#EF4444",
          honeyPrimary: "#3B82F6",
          honeyPurple: "#8B5CF6",
          honeyAccent: "#00F2FE",
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
