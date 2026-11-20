/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        maroon: {
          DEFAULT: "#630505",
          dark: "#4a0404",
          light: "#7e3223",
        },
        slate: {
          950: "#1a1a1a",
        },
        neutral: {
          350: "#ababab",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
