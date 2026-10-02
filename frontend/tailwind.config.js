/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Light "ocean" palette. Still deliberately institutional rather than
        // a crypto-trading look - the blues are desaturated and cool, closer
        // to a records office than a dashboard. Chosen light so the interface
        // reads clearly in a printed report and on a projector, where a dark
        // theme loses most of its contrast.
        ocean: {
          50: "#f2f8fb", // page background
          100: "#e0eef5", // subtle fill, hover
          200: "#c2dce8", // borders
          300: "#9bc5d8", // emphasised borders
          400: "#5f9fbd",
          500: "#2b7fa3",
          600: "#1d6485",
          700: "#15506c", // secondary text
          800: "#0f3d53",
          900: "#0b2f41" // headings, primary text
        },
        accent: {
          400: "#4a9ec2",
          500: "#2b8fb8",
          600: "#1a6f93", // button fill, white text sits at 5.8:1
          700: "#125876" // links and hover, 7:1 on white
        },
        // Darkened from the original mid-tones: these are read as text on a
        // light surface now, where the previous values fell under 4.5:1.
        status: {
          ok: "#15803d",
          warn: "#b45309",
          danger: "#b3261e"
        }
      }
    }
  },
  plugins: []
};
