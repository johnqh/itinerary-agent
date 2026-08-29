import type { Config } from "tailwindcss";

/**
 * Tokens for a transit-diagram reading of the product.
 *
 * The four transport modes are the entire accent system: they already carry
 * meaning on the map and the timeline, so adding a decorative brand colour on
 * top would compete with the one signal the traveller needs to read quickly.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'IBM Plex Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        canvas: "#E6EAEE",
        surface: "#FFFFFF",
        ink: "#111820",
        muted: "#5B6773",
        hairline: "#D3DAE1",
        walk: "#0F8A4C",
        transit: "#1D5FD0",
        rideshare: "#7B3FC4",
        car: "#C25608",
      },
      letterSpacing: {
        eyebrow: "0.14em",
      },
    },
  },
  plugins: [],
} satisfies Config;
