import type { Config } from "tailwindcss";
// `import`, not `require`. This file is ESM by its own extension and the
// rest of its syntax, and the CommonJS call made it unloadable by anything
// other than Tailwind's own loader — including the test that checks the
// `font-*` classes in src/ against the faces declared here.
// Default import with the extension spelled out: the package is CommonJS
// and names no ESM exports, and Node's own resolver will not add `.js` for
// you. Both are why the original `require` looked like the easier option.
import defaultTheme from "tailwindcss/defaultTheme.js";
import tailwindcssAnimate from "tailwindcss-animate";

const { fontFamily } = defaultTheme;

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    // Do not scan src/content here: during migration it may be a symlink outside
    // the project root, which Turbopack/PostCSS rejects.
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        lg: "1024px", // 适合iPad横屏和低分辨率的笔记本电脑
        xl: "1280px",
        fhd: "1920px", // 常规桌面显示器
        "4k": "3840px", // 4K显示器
      },
    },
    extend: {
      /**
       * `touch:` — a device that cannot hover and points coarsely.
       *
       * A named screen rather than the arbitrary variant it replaces.
       * `[@media(hover:none)and(pointer:coarse)]:block` looks equivalent and
       * is not: Tailwind takes `_` as the space in an arbitrary variant, so
       * written without one it emits `@media(hover:none)and(...)`, which is
       * invalid CSS — and an invalid at-rule does not fail quietly, it takes
       * the whole compiled stylesheet with it. Every page 500'd. A name in
       * here cannot be mis-escaped at a call site.
       */
      screens: {
        touch: { raw: "(hover: none) and (pointer: coarse)" },
      },
      fontFamily: {
        lexend: ["var(--font-body)", ...fontFamily.sans],
        code: ["var(--font-code)", ...fontFamily.sans],
        // `font-heading` was used in twenty-odd places and defined in none:
        // an unknown utility is not an error in Tailwind, it is simply
        // absent from the output, so every one of those call sites asked for
        // the heading face and silently kept the body one. The element rule
        // in globals.css covers real `<h1>`–`<h6>`; this is for everything
        // else that wants the same face — the editor's title input, the
        // quota figure, the nav labels. e2e/unit/font-utilities.spec.ts is
        // what stops the pair drifting apart again.
        heading: ["var(--font-heading)", ...fontFamily.sans],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        none: "0px",
        sm: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
        "3xl": "0px",
        full: "0px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "background-position-spin": {
          "0%": { backgroundPosition: "top center" },
          "100%": { backgroundPosition: "bottom center" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-100% - var(--gap)))" },
        },
        "marquee-vertical": {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(calc(-100% - var(--gap)))" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        backgroundPositionSpin:
          "background-position-spin 3000ms infinite alternate",
        marquee: "marquee var(--duration) linear infinite",
        "marquee-vertical": "marquee-vertical var(--duration) linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;

export default config;
