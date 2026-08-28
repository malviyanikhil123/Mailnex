/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#E3FDFD",
          100: "#CBF1F5",
          200: "#A6E3E9",
          300: "#8fe0e7",
          400: "#7cd4da",
          500: "#71C9CE",
          600: "#4ea8ae",
          700: "#36888e",
          800: "#24666b",
          900: "#164549",
          950: "#0c282b",
        },
        ice: {
          light: "#E3FDFD",
          soft: "#CBF1F5",
          medium: "#A6E3E9",
          primary: "#71C9CE",
        },
      },
    },
  },
  plugins: [],
};
