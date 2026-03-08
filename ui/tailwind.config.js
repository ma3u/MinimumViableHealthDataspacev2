/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 5-layer architecture palette — mirrors health-dataspace-style.grass
        layer1: {
          DEFAULT: "#2471A3",
          light: "#AED6F1",
          dark: "#1A5276",
        },
        layer2: {
          DEFAULT: "#148F77",
          light: "#76D7C4",
          dark: "#0E6655",
        },
        layer3: {
          DEFAULT: "#1E8449",
          light: "#82E0AA",
          dark: "#145A32",
        },
        layer4: {
          DEFAULT: "#CA6F1E",
          light: "#F5CBA7",
          dark: "#935116",
        },
        layer5: {
          DEFAULT: "#7D3C98",
          light: "#D7BDE2",
          dark: "#6C3483",
        },
      },
    },
  },
  plugins: [],
};
