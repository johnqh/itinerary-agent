import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        walk: "#16a34a",
        transit: "#2563eb",
        rideshare: "#9333ea",
        car: "#ea580c",
      },
    },
  },
  plugins: [],
} satisfies Config;
