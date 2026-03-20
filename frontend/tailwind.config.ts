import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        chart: {
          rust: "hsl(var(--chart-rust))",
          teal: "hsl(var(--chart-teal))",
          gold: "hsl(var(--chart-gold))",
          sage: "hsl(var(--chart-sage))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      boxShadow: {
        panel: "0 24px 80px rgba(0, 0, 0, 0.34)",
      },
      fontFamily: {
        sans: ['"Avenir Next"', '"Segoe UI"', "sans-serif"],
        display: ['"Iowan Old Style"', '"Palatino Linotype"', '"Book Antiqua"', "serif"],
      },
      backgroundImage: {
        "folio-shell":
          "radial-gradient(circle at top left, rgba(243, 154, 87, 0.16), transparent 20%), radial-gradient(circle at top right, rgba(85, 196, 209, 0.12), transparent 18%), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 120px), repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 120px), linear-gradient(180deg, #0b0f13 0%, #0f151a 48%, #131d23 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
