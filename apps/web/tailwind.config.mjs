/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{astro,html,js,ts,jsx,tsx,md,mdx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      // color-mix bridge: works with any CSS color value (hex from niche injection OR oklch
      // from template defaults), so bg-accent/30, border-border/50, etc. all resolve correctly.
      colors: {
        background: withAlpha("--background"),
        foreground: withAlpha("--foreground"),
        card: { DEFAULT: withAlpha("--card"), foreground: withAlpha("--card-foreground") },
        popover: { DEFAULT: withAlpha("--popover"), foreground: withAlpha("--popover-foreground") },
        primary: { DEFAULT: withAlpha("--primary"), foreground: withAlpha("--primary-foreground") },
        secondary: { DEFAULT: withAlpha("--secondary"), foreground: withAlpha("--secondary-foreground") },
        muted: { DEFAULT: withAlpha("--muted"), foreground: withAlpha("--muted-foreground") },
        accent: { DEFAULT: withAlpha("--accent"), foreground: withAlpha("--accent-foreground") },
        destructive: { DEFAULT: withAlpha("--destructive"), foreground: withAlpha("--destructive-foreground") },
        border: withAlpha("--border"),
        input: withAlpha("--input"),
        ring: withAlpha("--ring"),
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["'Geist Variable'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'Geist Mono Variable'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

function withAlpha(varName) {
  return `color-mix(in srgb, var(${varName}) calc(<alpha-value> * 100%), transparent)`;
}
