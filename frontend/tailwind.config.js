/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Deep navy / steel palette — deliberately institutional/forensic,
        // not a crypto-trading look.
        navy: {
          950: "#0a0f1a",
          900: "#0f1729",
          800: "#16213a",
          700: "#1f2d4a"
        },
        accent: {
          500: "#2f6fed",
          600: "#2559c9"
        },
        status: {
          ok: "#1f9d55",
          warn: "#d9822b",
          danger: "#d1373f"
        }
      }
    }
  },
  plugins: []
};
