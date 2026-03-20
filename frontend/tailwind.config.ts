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
        panel: "0 30px 70px rgba(58, 41, 33, 0.12)",
      },
      fontFamily: {
        sans: ['"Avenir Next"', '"Segoe UI"', "sans-serif"],
        display: ['"Iowan Old Style"', '"Palatino Linotype"', '"Book Antiqua"', "serif"],
      },
      backgroundImage: {
        "folio-shell":
          "radial-gradient(circle at top left, rgba(210, 111, 76, 0.26), transparent 28%), radial-gradient(circle at top right, rgba(45, 90, 103, 0.18), transparent 24%), linear-gradient(180deg, #f7efe3 0%, #efe3d2 48%, #e7d9c5 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
